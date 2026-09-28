export default {
    command: 'echo',
    aliases: [],
    category: 'general',
    description: 'Repeat the message',
    usage: 'echo <message>',
    async handler(sock, message, args, context) {
        const text = context.args.join(' ').trim();
        await context.reply(text || `Usage: ${context.prefix}echo <message>`);
    }
};