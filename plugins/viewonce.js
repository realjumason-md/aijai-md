import { downloadContentFromMessage } from '@whiskeysockets/baileys';

async function toBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream)
        chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

function getQuotedViewOnceMessage(message) {
    const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let current = quoted;
    let foundViewOnceWrapper = false;

    for (let depth = 0; current && depth < 5; depth += 1) {
        const nestedContent = current.ephemeralMessage?.message
            || current.documentWithCaptionMessage?.message;
        if (nestedContent) {
            current = nestedContent;
            continue;
        }

        const viewOnce = current.viewOnceMessage?.message
            || current.viewOnceMessageV2?.message
            || current.viewOnceMessageV2Extension?.message;
        if (viewOnce) {
            foundViewOnceWrapper = true;
            current = viewOnce;
            continue;
        }

        if (current.imageMessage && (foundViewOnceWrapper || current.imageMessage.viewOnce))
            return { kind: 'image', message: current.imageMessage };
        if (current.videoMessage && (foundViewOnceWrapper || current.videoMessage.viewOnce))
            return { kind: 'video', message: current.videoMessage };
        return undefined;
    }

    return undefined;
}

export default {
    command: 'viewonce',
    aliases: ['vv', 'viewmedia'],
    category: 'media',
    description: 'Reveal a replied-to view-once image or video',
    usage: 'viewonce (reply to view-once media)',
    async handler(sock, message, args, context) {
        const media = getQuotedViewOnceMessage(message);
        if (!media) {
            await context.reply(`Reply to a view-once image or video with ${context.prefix}viewonce.`);
            return;
        }
        try {
            const stream = await downloadContentFromMessage(media.message, media.kind);
            const buffer = await toBuffer(stream);
            const chatId = context.chatId || context.jid || message.key.remoteJid;
            if (media.kind === 'image') {
                await sock.sendMessage(chatId, { image: buffer, caption: 'View-once media revealed.' }, { quoted: message });
                return;
            }
            await sock.sendMessage(
                chatId,
                { video: buffer, mimetype: media.message.mimetype || 'video/mp4', caption: 'View-once media revealed.' },
                { quoted: message }
            );
        } catch (error) {
            await context.reply(`Could not retrieve that view-once media: ${error.message}`);
        }
    }
};