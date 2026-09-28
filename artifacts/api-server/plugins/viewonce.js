import { downloadContentFromMessage } from '@whiskeysockets/baileys';

async function toBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream)
        chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

function getQuotedViewOnceMessage(message) {
    const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const viewOnce = quoted?.viewOnceMessage?.message
        || quoted?.viewOnceMessageV2?.message
        || quoted?.viewOnceMessageV2Extension?.message;
    if (viewOnce?.imageMessage)
        return { kind: 'image', message: viewOnce.imageMessage };
    if (viewOnce?.videoMessage)
        return { kind: 'video', message: viewOnce.videoMessage };
    return undefined;
}

export default {
    command: 'viewonce',
    aliases: ['vv', 'viewmedia'],
    category: 'media',
    description: 'Reveal a replied-to view-once image or video',
    usage: 'viewonce (reply to view-once media)',
    async handler(sock, message, ...args) {
        const context = args.at(-1);
        const media = getQuotedViewOnceMessage(message);
        if (!media) {
            await context.reply(`Reply to a view-once image or video with ${context.prefix}viewonce.`);
            return;
        }
        const stream = await downloadContentFromMessage(media.message, media.kind);
        const buffer = await toBuffer(stream);
        if (media.kind === 'image') {
            await sock.sendMessage(context.jid, { image: buffer, caption: 'View-once media revealed.' }, { quoted: message });
            return;
        }
        await sock.sendMessage(
            context.jid,
            { video: buffer, mimetype: media.message.mimetype || 'video/mp4', caption: 'View-once media revealed.' },
            { quoted: message }
        );
    }
};