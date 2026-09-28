import config from '../config.js';
import commandHandler from './commandHandler.js';
import { aijaiState } from './aijai-state.js';
import { generateAiReply, hasAiProvider } from './aijai-ai.js';
import { printLog } from './print.js';

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
    if (!prefix)
        return undefined;
    const withoutPrefix = trimmed.slice(prefix.length).trim();
    if (!withoutPrefix)
        return undefined;
    const [command = '', ...args] = withoutPrefix.split(/\s+/);
    const normalized = command.toLowerCase();
    const mainCommand = commandHandler.commands.has(normalized)
        ? normalized
        : commandHandler.aliases.get(normalized);
    const registered = mainCommand ? commandHandler.commands.get(mainCommand) : undefined;
    if (!registered)
        return undefined;
    return { prefix, plugin: registered, command: registered.command, args };
}

function getSenderJid(message) {
    return message?.key?.participant || message?.key?.remoteJid || '';
}

function isDirectMessage(jid) {
    return jid.endsWith('@s.whatsapp.net');
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

export async function handleMessages(sock, chatUpdate) {
    const message = unwrapMessage(chatUpdate?.messages?.[0]);
    if (!message?.message || message.key?.fromMe)
        return;

    const jid = message.key.remoteJid;
    if (!jid || jid === 'status@broadcast')
        return;

    const text = getBody(message);
    const parsed = getCommand(text);
    if (!parsed) {
        if (text && isDirectMessage(jid) && aijaiState.isEnabled(jid)) {
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
    const context = {
        sock,
        message,
        jid,
        senderJid: getSenderJid(message),
        isGroup: jid.endsWith('@g.us'),
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
    try {
        await parsed.plugin.handler(sock, message, ...parsed.args, context);
    }
    catch (error) {
        printLog('error', `Command ${parsed.command} failed: ${error.message}`);
        await sock.sendMessage(jid, { text: `❌ ${error.message}` }, { quoted: message }).catch(() => {});
    }
}

export async function handleGroupParticipantUpdate() {}
export async function handleStatus() {}
export async function handleCall() {}