export default {
    command: 'owner',
    aliases: ['creator'],
    category: 'general',
    description: 'Share the bot owner contact',
    usage: 'owner',
    async handler(sock, message, args, context) {
        const config = context.config;
        const chatId = context.chatId || message.key.remoteJid;
        const ownerName = String(config.botOwner || config.ownerName || 'Bot Owner')
            .replace(/[\r\n]/g, ' ')
            .trim();
        const ownerNumber = String(config.ownerNumber || '').replace(/\D/g, '');

        if (!/^\d{5,15}$/.test(ownerNumber)) {
            await context.reply(
                `╭─〔 Owner 〕\n│ Name: ${ownerName}\n│ Owner contact number is not configured correctly.\n╰────────────`
            );
            return;
        }

        try {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                `FN:${ownerName}`,
                `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${ownerNumber}`,
                'END:VCARD'
            ].join('\n');

            await sock.sendMessage(
                chatId,
                { contacts: { displayName: ownerName, contacts: [{ vcard }] } },
                { quoted: message }
            );
        } catch {
            await context.reply(
                `╭─〔 Owner 〕\n│ Name: ${ownerName}\n│ Number: +${ownerNumber}\n╰────────────`
            );
        }
    }
};