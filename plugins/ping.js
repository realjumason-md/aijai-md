export default {
    command: 'ping',
    aliases: ['p', 'pong'],
    category: 'general',
    description: 'Check response speed',
    usage: 'ping',
    async handler(sock, message, ...args) {
        const context = args.at(-1);
        const latency = Math.max(0, Date.now() - context.receivedAt);
        await context.reply(`Pong! ${latency} ms`);
    }
};