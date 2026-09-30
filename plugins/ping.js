export default {
    command: 'ping',
    aliases: ['p', 'pong'],
    category: 'general',
    description: 'Check response speed',
    usage: 'ping',
    isPrefixless: true,
    async handler(sock, message, _args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const startedAt = Date.now();
        const pendingMessage = await sock.sendMessage(
            chatId,
            { text: 'Pinging...' },
            { quoted: message }
        );
        const latency = Math.max(0, Date.now() - startedAt);

        try {
            await sock.sendMessage(chatId, {
                text: `🏓 Pong!\nLatency: ${latency} ms`,
                edit: pendingMessage.key
            });
        } catch {
            await context.reply(`Pong! ${latency} ms`);
        }
    }
};