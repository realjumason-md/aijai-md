import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { dataFile } from './paths.js';

const FEATURES = new Set(['antidelete', 'antiedit']);
const MAX_CACHED_MESSAGES = 5000;
const MAX_CACHED_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000;
const EVENT_DEDUP_MS = 30_000;
const MAX_SEEN_EVENTS = 1000;
const textMessages = new Map();
const seenEvents = new Map();
let settingsCache;

function readSettings() {
    if (settingsCache)
        return settingsCache;

    const filePath = dataFile('messageAudit.json');
    try {
        settingsCache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!settingsCache || typeof settingsCache !== 'object' || Array.isArray(settingsCache))
            settingsCache = {};
    }
    catch {
        settingsCache = {};
    }
    return settingsCache;
}

function messageCacheKey(chatId, messageId) {
    return `${chatId}\u0000${messageId}`;
}

function normalizeTimestamp(value) {
    if (value && typeof value === 'object' && typeof value.toNumber === 'function')
        value = value.toNumber();
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0)
        return null;
    return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function oneLine(value, fallback) {
    return String(value || fallback).replace(/[\r\n]+/g, ' ').trim();
}

function shortText(value) {
    return typeof value === 'string' ? value : null;
}

export function extractPlainText(message) {
    if (!message || typeof message !== 'object')
        return null;

    // Deliberately do not unwrap ephemeral or view-once wrappers. Their contents
    // are not retained by this audit feature.
    return shortText(message.conversation) ??
        shortText(message.extendedTextMessage?.text) ??
        null;
}

function getTextFromStoredMessage(message) {
    return extractPlainText(message?.message);
}

function rememberInBoundText(message, sock) {
    const chatId = message?.key?.remoteJid;
    const messageId = message?.key?.id;
    const text = getTextFromStoredMessage(message);
    if (!chatId || !messageId || text === null)
        return;

    const flags = readSettings()[chatId];
    if (!flags?.antidelete && !flags?.antiedit)
        return;

    const key = messageCacheKey(chatId, messageId);
    textMessages.delete(key);
    textMessages.set(key, {
        text,
        messageTimestamp: normalizeTimestamp(message.messageTimestamp),
        sender: message.key.fromMe
            ? sock?.user?.id
            : message.key.participant || message.key.participantAlt || message.key.remoteJid,
        fromMe: message.key.fromMe === true,
        cachedAt: Date.now()
    });

    const now = Date.now();
    for (const [cachedKey, cachedMessage] of textMessages) {
        if (now - cachedMessage.cachedAt > MAX_CACHED_MESSAGE_AGE_MS)
            textMessages.delete(cachedKey);
    }
    while (textMessages.size > MAX_CACHED_MESSAGES)
        textMessages.delete(textMessages.keys().next().value);
}

export function cacheMessageForAudit(message, sock) {
    rememberInBoundText(message, sock);
}

export function getAuditFeatureEnabled(chatId, feature) {
    if (!chatId || !FEATURES.has(feature))
        return false;
    return readSettings()[chatId]?.[feature] === true;
}

export function setAuditFeatureEnabled(chatId, feature, enabled) {
    if (!chatId || !FEATURES.has(feature))
        throw new Error('Invalid message audit setting.');

    const settings = readSettings();
    const flags = { ...(settings[chatId] || {}), [feature]: Boolean(enabled) };

    if (!flags.antidelete && !flags.antiedit) {
        delete settings[chatId];
        for (const key of textMessages.keys()) {
            if (key.startsWith(`${chatId}\u0000`))
                textMessages.delete(key);
        }
    }
    else {
        settings[chatId] = flags;
    }

    const filePath = dataFile('messageAudit.json');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
}

function classifyUpdate(entry) {
    const key = entry?.key;
    const update = entry?.update;
    if (!key?.remoteJid || !key?.id || !update)
        return null;

    const editedContent = update.message?.editedMessage?.message;
    if (editedContent && typeof editedContent === 'object') {
        return {
            type: 'edit',
            key,
            update,
            newText: extractPlainText(editedContent)
        };
    }

    // Baileys emits a null message plus a revoke stub when a message is deleted.
    if (update.message === null && update.messageStubType !== undefined) {
        return { type: 'delete', key, update };
    }
    return null;
}

function formatDateTime(timestamp, timeZone) {
    const date = new Date(timestamp);
    try {
        return new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'medium',
            timeZone: timeZone || 'UTC'
        }).format(date);
    }
    catch {
        return new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'medium',
            timeZone: 'UTC'
        }).format(date);
    }
}

export function formatAuditNotice({
    type,
    chatName,
    sender,
    actor,
    changedAt = Date.now(),
    timeZone = 'UTC',
    previousText,
    newText
}) {
    const isEdit = type === 'edit';
    const lines = [
        `AIJAI-MD ${isEdit ? 'EDITED' : 'DELETED'} TEXT MESSAGE`,
        `Chat: ${oneLine(chatName, 'Unknown chat')}`,
        `Message sender: ${oneLine(sender, 'Unknown sender')}`,
        `Changed by: ${oneLine(actor, 'Unknown sender')}`,
        `Date and time: ${formatDateTime(changedAt, timeZone)}`
    ];

    if (isEdit) {
        lines.push(
            '',
            'Previous text:',
            previousText ?? '[Original text unavailable]',
            '',
            'Edited text:',
            newText ?? '[Edited text unavailable]'
        );
    }
    else {
        lines.push('', 'Deleted text:', previousText ?? '[Original text unavailable]');
    }
    return lines.join('\n');
}

function getPrivateDestination(sock, config) {
    const ownerNumber = String(config?.ownerNumber || '').replace(/\D/g, '');
    if (/^\d{5,15}$/.test(ownerNumber))
        return `${ownerNumber}@s.whatsapp.net`;

    const botId = typeof sock.decodeJid === 'function'
        ? sock.decodeJid(sock.user?.id)
        : sock.user?.id;
    return typeof botId === 'string' && botId.includes('@') ? botId : null;
}

function eventWasRecentlySent(token) {
    const now = Date.now();
    for (const [key, timestamp] of seenEvents) {
        if (now - timestamp > EVENT_DEDUP_MS)
            seenEvents.delete(key);
    }
    const lastSent = seenEvents.get(token);
    return lastSent !== undefined && now - lastSent < EVENT_DEDUP_MS;
}

function rememberSentEvent(token) {
    seenEvents.set(token, Date.now());
    while (seenEvents.size > MAX_SEEN_EVENTS)
        seenEvents.delete(seenEvents.keys().next().value);
}

async function getOriginalText(sock, store, key) {
    const cacheKey = messageCacheKey(key.remoteJid, key.id);
    const cached = textMessages.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt <= MAX_CACHED_MESSAGE_AGE_MS)
        return cached;
    if (cached)
        textMessages.delete(cacheKey);

    if (!store?.loadMessage)
        return null;
    try {
        const stored = await store.loadMessage(key.remoteJid, key.id);
        const text = getTextFromStoredMessage(stored);
        if (text === null)
            return null;
        const messageTimestamp = normalizeTimestamp(stored?.messageTimestamp);
        if (messageTimestamp && Date.now() - messageTimestamp > MAX_CACHED_MESSAGE_AGE_MS)
            return null;
        return {
            text,
            messageTimestamp,
            sender: stored?.key?.fromMe
                ? sock.user?.id
                : stored?.key?.participant || stored?.key?.participantAlt || key.remoteJid,
            fromMe: stored?.key?.fromMe === true
        };
    }
    catch {
        return null;
    }
}

async function getLabel(sock, jid, fallback) {
    if (!jid)
        return fallback;
    try {
        return await sock.getName?.(jid) || jid;
    }
    catch {
        return jid || fallback;
    }
}

async function sendAuditNotice(sock, entry, kind, original, newText, config) {
    const destination = getPrivateDestination(sock, config);
    if (!destination)
        return false;

    const chatId = entry.key.remoteJid;
    const actorKey = entry.update.key;
    const actorJid = actorKey?.participant ||
        actorKey?.participantAlt ||
        (actorKey?.fromMe ? sock.user?.id : entry.key.participant) ||
        entry.key.participant ||
        entry.key.remoteJid;
    const senderJid = original?.sender ||
        entry.key.participant ||
        (entry.key.fromMe ? sock.user?.id : entry.key.remoteJid);
    const [chatName, sender, actor] = await Promise.all([
        getLabel(sock, chatId, 'Unknown chat'),
        getLabel(sock, senderJid, 'Unknown sender'),
        getLabel(sock, actorJid, 'Unknown sender')
    ]);
    const text = formatAuditNotice({
        type: kind,
        chatName,
        sender,
        actor,
        changedAt: normalizeTimestamp(entry.update.messageTimestamp) || Date.now(),
        timeZone: config?.timeZone || 'UTC',
        previousText: original?.text,
        newText
    });

    await sock.sendMessage(destination, { text });
    return true;
}

export async function handleAuditMessageUpdates(sock, updates, { store, config } = {}) {
    for (const entry of updates || []) {
        const classified = classifyUpdate(entry);
        if (!classified)
            continue;

        const { type, key, update, newText } = classified;
        const feature = type === 'delete' ? 'antidelete' : 'antiedit';
        if (!getAuditFeatureEnabled(key.remoteJid, feature))
            continue;

        const original = await getOriginalText(sock, store, key);
        if (type === 'delete' && !original)
            continue;
        if (type === 'edit' && newText === null)
            continue;

        const editedTextHash = type === 'edit'
            ? createHash('sha256').update(newText).digest('hex').slice(0, 16)
            : '';
        const token = `${type}:${key.remoteJid}:${key.id}:${editedTextHash}`;
        if (eventWasRecentlySent(token))
            continue;

        const sent = await sendAuditNotice(sock, entry, type, original, newText, config);
        if (!sent)
            continue;
        rememberSentEvent(token);

        const cacheKey = messageCacheKey(key.remoteJid, key.id);
        if (type === 'delete') {
            textMessages.delete(cacheKey);
        }
        else if (newText !== null) {
            textMessages.set(cacheKey, {
                ...(original || {}),
                text: newText,
                messageTimestamp: normalizeTimestamp(update.messageTimestamp),
                cachedAt: Date.now()
            });
        }
    }
}