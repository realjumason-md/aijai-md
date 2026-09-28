export default {
    command: 'ping',
    aliases: ['p', 'pong'],
    category: 'general',
    description: 'Check response speed',
    usage: 'ping',
    isPrefixless: true,
    async handler(sock, message, args, context) {
        const latency = Math.max(0, Date.now() - context.receivedAt);
        await context.reply(`Pong! ${latency} ms`);
    }
};