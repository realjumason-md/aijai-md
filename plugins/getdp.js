export default {
    command: 'getdp',
    aliases: ['getpp', 'dlpp', 'profilepic'],
    category: 'general',
    description: 'Get a WhatsApp profile picture',
    usage: 'getdp [reply | @user | number]',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || context.jid || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const info = message.message?.extendedTextMessage?.contextInfo;
        let target = chatId;
        let displayName = isGroup ? 'Group' : 'User';
        let displayNumber = '';

        if (info?.mentionedJid?.[0]) {
            target = info.mentionedJid[0];
            displayName = 'User';
        }
        else if (info?.quotedMessage && (info?.participant || info?.remoteJid)) {
            target = info.participant || info.remoteJid;
            displayName = info.pushName || 'User';
        }
        else if (args[0]) {
            const number = args[0].replace(/[^0-9]/g, '');
            if (number.length < 10) {
                await sock.sendMessage(
                    chatId,
                    { text: `❌ Invalid number. Use ${context.prefix}getdp 256700000000`, ...(context.channelInfo || {}) },
                    { quoted: message }
                );
                return;
            }
            target = `${number}@s.whatsapp.net`;
            displayName = '';
        }

        try {
            if (!target || typeof target !== 'string')
                throw new Error('No valid WhatsApp user was found.');
            if (target.endsWith('@lid') && isGroup) {
                const metadata = await sock.groupMetadata(chatId);
                const participant = metadata.participants.find(
                    (item) => item.lid === target || item.id === target
                );
                if (participant?.id)
                    target = participant.id;
            }

            const cleanNumber = target.replace(/@s\.whatsapp\.net|@lid/g, '').split(':')[0];
            if ((target.endsWith('@s.whatsapp.net') || target.endsWith('@lid')) && cleanNumber.length >= 10)
                displayNumber = `+${cleanNumber}`;

            if (target.endsWith('@g.us')) {
                const metadata = await sock.groupMetadata(target).catch(() => null);
                displayName = metadata?.subject || 'Group';
            }
            else if (displayName === 'User' && typeof sock.getName === 'function') {
                const name = await sock.getName(target).catch(() => '');
                if (name && !name.startsWith('+'))
                    displayName = name;
            }

            const profileUrl = await sock.profilePictureUrl(target, 'image');
            await sock.sendMessage(
                chatId,
                {
                    image: { url: profileUrl },
                    caption: `📸 Profile picture${displayName ? `\n\nName: ${displayName}` : ''}${displayNumber ? `\nNumber: ${displayNumber}` : ''}`,
                    ...(context.channelInfo || {})
                },
                { quoted: message }
            );
        }
        catch (error) {
            await sock.sendMessage(
                chatId,
                {
                    text: `❌ No profile picture found${displayName ? ` for ${displayName}` : ''}.`,
                    ...(context.channelInfo || {})
                },
                { quoted: message }
            );
        }
    }
};