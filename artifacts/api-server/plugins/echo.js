export default {
    command: 'echo',
    aliases: [],
    category: 'general',
    description: 'Repeat the message',
    usage: 'echo <message>',
    async handler(sock, message, ...args) {
        const context = args.at(-1);
        const text = context.args.join(' ').trim();
        await context.reply(text || `Usage: ${context.prefix}echo <message>`);
    }
};