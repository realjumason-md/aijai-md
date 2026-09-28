import fs from 'node:fs';
import path from 'node:path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { generateProfilePicture } from '../lib/myfunc.js';
import { TEMP_DIR } from '../lib/paths.js';

function getImageMessage(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (message.message?.imageMessage)
        return { content: message.message.imageMessage, type: 'image' };
    if (quoted?.imageMessage)
        return { content: quoted.imageMessage, type: 'image' };
    if (quoted?.stickerMessage)
        return { content: quoted.stickerMessage, type: 'sticker' };
    return undefined;
}

export default {
    command: 'setdp',
    aliases: ['setpp', 'setppic'],
    category: 'owner',
    description: 'Set the bot profile picture from an image',
    usage: 'setdp (reply to an image)',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || context.jid || message.key.remoteJid;
        const media = getImageMessage(message);
        const send = (text) => sock.sendMessage(
            chatId,
            { text, ...(context.channelInfo || {}) },
            { quoted: message }
        );

        if (!media) {
            await send(`⚠️ Reply to an image with ${context.prefix}setdp to update the bot profile picture.`);
            return;
        }

        let imagePath;
        try {
            const stream = await downloadContentFromMessage(
                media.content,
                media.type
            );
            const chunks = [];
            for await (const chunk of stream)
                chunks.push(chunk);
            const { img } = await generateProfilePicture(Buffer.concat(chunks));

            fs.mkdirSync(TEMP_DIR, { recursive: true });
            imagePath = path.join(TEMP_DIR, `profile-${Date.now()}.jpg`);
            fs.writeFileSync(imagePath, img);
            await sock.updateProfilePicture(sock.user.id, { url: imagePath });
            await send('✅ Bot profile picture updated successfully.');
        }
        catch (error) {
            await send(`❌ Failed to update the bot profile picture: ${error.message}`);
        }
        finally {
            if (imagePath)
                fs.rmSync(imagePath, { force: true });
        }
    }
};