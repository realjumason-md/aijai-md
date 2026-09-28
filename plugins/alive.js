function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
}

export default {
    command: 'alive',
    aliases: ['status', 'bot'],
    category: 'general',
    description: 'Show that the bot is online and its uptime',
    usage: 'alive',
    async handler(sock, message, args, context) {
        await context.reply(
            `╭─〔 ${context.config.botName} 〕\n│ Online: yes\n│ Uptime: ${formatUptime(process.uptime())}\n╰────────────`
        );
    }
};