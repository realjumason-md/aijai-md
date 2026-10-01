import config from '../config.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import commandHandler from './commandHandler.js';
import store from './lightweight_store.js';
import { aijaiState } from './aijai-state.js';
import { getChatbot } from './index.js';
import { generateAiReply, getImageInputs, hasAiProvider, startHumanReplyDelay } from './aijai-ai.js';
import { sendAutomaticAiReply } from './ai-reply-delivery.js';
import { printLog } from './print.js';
import isOwnerOrSudo, { isOwnerOnly } from './isOwner.js';
import isAdmin from './isAdmin.js';
import { channelInfo } from './messageConfig.js';
import { getModeAccessDecision } from './mode-access.js';

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
    for (let depth = 0; depth < 8; depth += 1) {
        const content = message?.message;
        const nestedMessage = content?.ephemeralMessage?.message
            || content?.viewOnceMessage?.message
            || content?.viewOnceMessageV2?.message
            || content?.viewOnceMessageV2Extension?.message
            || content?.documentWithCaptionMessage?.message;
        if (!nestedMessage)
            break;
        message.message = nestedMessage;
    }
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
    const isGroup = jid.endsWith('@g.us');
    const parsed = getCommand(text);
    const senderJid = getSenderJid(message);
    const senderIsOwnerOrSudo = Boolean(
        message.key?.fromMe || await isOwnerOrSudo(senderJid, sock, jid)
    );
    const botMode = await store.getBotMode();

    // Owner and sudo users always retain access so they can change the mode
    // back or repair the bot. Private mode silently ignores other users.
    const access = getModeAccessDecision(
        botMode,
        isGroup,
        senderIsOwnerOrSudo,
        Boolean(parsed)
    );
    if (!access.allowed) {
        if (access.notify) {
            await sendRestriction(
                sock,
                message,
                `ℹ️ The bot is currently in *${botMode}* mode, so this chat cannot use commands.`
            );
        }
        return;
    }

    // Do not let messages sent by the bot trigger AI replies, but still process
    // owner commands sent from the connected WhatsApp account.
    if (!parsed) {
        const groupChatbot = isGroup ? await getChatbot(jid) : null;
        const aiEnabled = isGroup
            ? groupChatbot?.enabled === true
            : aijaiState.isEnabled(jid);
        if (!message.key?.fromMe && aiEnabled) {
            if (!hasAiProvider()) {
                await sock.sendMessage(jid, {
                    text: `AI replies are enabled, but Groq is switched off. Use ${config.prefix}aiswitch groq.`
                }, { quoted: message });
                return;
            }
            try {
                const images = await getImageInputs(message);
                if (!text && !images.length)
                    return;
                const finishHumanReply = startHumanReplyDelay(sock, jid);
                try {
                    const reply = await generateAiReply({
                        text: text || 'Please look at this image and respond naturally.',
                        images,
                        conversationId: jid
                    });
                    await finishHumanReply();
                    await sendAutomaticAiReply(
                        sock,
                        jid,
                        reply,
                        (part) => sock.sendMessage(jid, { text: part }, { quoted: message })
                    );
                } finally {
                    await finishHumanReply();
                }
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
    const isOwnerOrSudoCheck = Boolean(senderIsOwnerOrSudo);
    let isSenderAdmin = false;
    let isBotAdmin = false;

    try {
        if (parsed.plugin.directMessageOnly && isGroup) {
            await sendRestriction(sock, message, 'ℹ️ This command only works in one-to-one chats.');
            return;
        }
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
            botMode,
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
        if (!(await plugin.readState()).enabled)
            return;
        const notified = new Set();
        for (const call of calls || []) {
            const callerJid = call.from || call.peerJid || call.chatId || call.sender;
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
            if (typeof sock.updateBlockStatus === 'function') {
                await new Promise((resolve) => setTimeout(resolve, 800));
                await sock.updateBlockStatus(callerJid, 'block').catch(() => {});
            }
        }
    }
    catch (error) {
        printLog('error', `Call handler error: ${error.message}`);
    }
}
