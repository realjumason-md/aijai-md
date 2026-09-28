import config from '../config.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import commandHandler from './commandHandler.js';
import { aijaiState } from './aijai-state.js';
import { generateAiReply, hasAiProvider } from './aijai-ai.js';
import { printLog } from './print.js';
import isOwnerOrSudo, { isOwnerOnly } from './isOwner.js';
import isAdmin from './isAdmin.js';
import { channelInfo } from './messageConfig.js';

async function importLivePlugin(filename) {
    const filePath = path.join(process.cwd(), 'plugins', filename);
    const version = fs.statSync(filePath).mtimeMs;
    const imported = await import(`${pathToFileURL(filePath).href}?v=${version}`);
    return imported.default || imported;
}

function getBody(message) {
    const content = message?.message;
    return content?.conversation
        || content?.extendedTextMessage?.text
        || content?.imageMessage?.caption
        || content?.videoMessage?.caption
        || content?.documentMessage?.caption
        || content?.documentWithCaptionMessage?.message?.documentMessage?.caption
        || '';
}

function getCommand(text) {
    const trimmed = text.trim();
    const prefix = [...config.prefixes]
        .sort((left, right) => right.length - left.length)
        .find((candidate) => trimmed.startsWith(candidate));
    const withoutPrefix = prefix ? trimmed.slice(prefix.length).trim() : trimmed;
    if (!withoutPrefix)
        return undefined;
    const [command = '', ...args] = withoutPrefix.split(/\s+/);
    const normalized = command.toLowerCase();
    const isPrefixless = !prefix && commandHandler.prefixlessCommands.has(normalized);
    if (!prefix && !isPrefixless)
        return undefined;
    const mainCommand = commandHandler.commands.has(normalized)
        ? normalized
        : commandHandler.aliases.get(normalized);
    const registered = mainCommand ? commandHandler.commands.get(mainCommand) : undefined;
    if (!registered)
        return undefined;
    return { prefix: prefix || config.prefix, plugin: registered, command: registered.command, args };
}

function getSenderJid(message) {
    return message?.key?.participant || message?.key?.remoteJid || '';
}

function unwrapMessage(message) {
    if (message?.message?.ephemeralMessage)
        message.message = message.message.ephemeralMessage.message;
    if (message?.message?.viewOnceMessage)
        message.message = message.message.viewOnceMessage.message;
    if (message?.message?.viewOnceMessageV2)
        message.message = message.message.viewOnceMessageV2.message;
    return message;
}

async function sendRestriction(sock, message, text) {
    const jid = message.key.remoteJid;
    return sock.sendMessage(jid, { text, ...channelInfo }, { quoted: message });
}

export async function handleMessages(sock, chatUpdate) {
    const message = unwrapMessage(chatUpdate?.messages?.[0]);
    if (!message?.message)
        return;

    const jid = message.key.remoteJid;
    if (!jid || jid === 'status@broadcast')
        return;

    const text = getBody(message);
    const parsed = getCommand(text);
    // Do not let messages sent by the bot trigger AI replies, but still process
    // owner commands sent from the connected WhatsApp account.
    if (!parsed) {
        if (!message.key?.fromMe && text && aijaiState.isEnabled(jid)) {
            if (!hasAiProvider()) {
                await sock.sendMessage(jid, { text: 'AI replies are enabled, but no AI provider is configured.' }, { quoted: message });
                return;
            }
            try {
                const reply = await generateAiReply(text);
                await sock.sendMessage(jid, { text: reply }, { quoted: message });
            }
            catch (error) {
                printLog('error', `AI reply failed: ${error.message}`);
                await sock.sendMessage(jid, { text: `AI error: ${error.message}` }, { quoted: message });
            }
        }
        return;
    }

    const receivedAt = message.messageTimestamp
        ? Number(message.messageTimestamp) * 1000
        : Date.now();
    const senderJid = getSenderJid(message);
    const isGroup = jid.endsWith('@g.us');
    const senderIsOwnerOrSudo = message.key?.fromMe || await isOwnerOrSudo(senderJid, sock, jid);
    const isOwnerOrSudoCheck = Boolean(senderIsOwnerOrSudo);
    let isSenderAdmin = false;
    let isBotAdmin = false;

    try {
        if (parsed.plugin.strictOwnerOnly && !message.key?.fromMe && !isOwnerOnly(senderJid)) {
            await sendRestriction(sock, message, 'ℹ️ This command is only available to the bot owner.');
            return;
        }
        if (parsed.plugin.ownerOnly && !isOwnerOrSudoCheck) {
            await sendRestriction(sock, message, 'ℹ️ This command is only available to the owner or sudo users.');
            return;
        }
        if (parsed.plugin.groupOnly && !isGroup) {
            await sendRestriction(sock, message, 'ℹ️ This command can only be used in groups.');
            return;
        }
        if (parsed.plugin.adminOnly) {
            if (!isGroup) {
                await sendRestriction(sock, message, 'ℹ️ This command can only be used in groups.');
                return;
            }
            ({ isSenderAdmin, isBotAdmin } = await isAdmin(sock, jid, senderJid));
            if (!isBotAdmin) {
                await sendRestriction(sock, message, 'ℹ️ Please make the bot an admin to use this command.');
                return;
            }
            if (!isSenderAdmin && !isOwnerOrSudoCheck) {
                await sendRestriction(sock, message, 'ℹ️ Only group admins can use this command.');
                return;
            }
        }

        const context = {
            // MEGA-MD-compatible names
            chatId: jid,
            senderId: senderJid,
            isGroup,
            isSenderAdmin,
            isBotAdmin,
            senderIsOwnerOrSudo,
            isOwnerOrSudoCheck,
            channelInfo,
            rawText: text,
            userMessage: text.toLowerCase(),
            messageText: text,
            // aijai-md compatibility names
            sock,
            message,
            jid,
            senderJid,
            args: parsed.args,
            prefix: parsed.prefix,
            config: {
                ...config,
                ownerName: config.botOwner
            },
            aiState: aijaiState,
            receivedAt,
            reply: (replyText) => sock.sendMessage(jid, { text: replyText }, { quoted: message })
        };
        await parsed.plugin.handler(sock, message, parsed.args, context);
    }
    catch (error) {
        printLog('error', `Command ${parsed.command} failed: ${error.message}`);
        await sock.sendMessage(jid, { text: `❌ ${error.message}`, ...channelInfo }, { quoted: message }).catch(() => {});
    }
}

export async function handleGroupParticipantUpdate() {}
export async function handleStatus(sock, status) {
    try {
        const plugin = await importLivePlugin('autostatus.js');
        await plugin.handleStatusUpdate(sock, status);
    }
    catch (error) {
        printLog('error', `Status handler error: ${error.message}`);
    }
}

export async function handleCall(sock, calls) {
    try {
        const plugin = await importLivePlugin('anticall.js');
        if (!plugin.readState().enabled)
            return;
        const notified = new Set();
        for (const call of calls || []) {
            const callerJid = call.from || call.peerJid || call.chatId;
            if (!callerJid)
                continue;
            if (typeof sock.rejectCall === 'function' && call.id)
                await sock.rejectCall(call.id, callerJid).catch(() => {});
            if (!notified.has(callerJid)) {
                notified.add(callerJid);
                await sock.sendMessage(callerJid, {
                    text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.'
                }).catch(() => {});
            }
            setTimeout(() => {
                Promise.resolve(sock.updateBlockStatus?.(callerJid, 'block')).catch(() => {});
            }, 800);
        }
    }
    catch (error) {
        printLog('error', `Call handler error: ${error.message}`);
    }
}
