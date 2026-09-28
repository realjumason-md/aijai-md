export default {
    command: 'owner',
    aliases: ['creator'],
    category: 'general',
    description: 'Show bot owner information',
    usage: 'owner',
    async handler(sock, message, args, context) {
        await context.reply(
            `╭─〔 Owner 〕\n│ Name: ${context.config.ownerName}\n│ Number: +${context.config.ownerNumber}\n│ WhatsApp: https://wa.me/${context.config.ownerNumber}\n╰────────────`
        );
    }
};