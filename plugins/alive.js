import os from 'node:os';

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
}

function formatMemory(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export default {
    command: 'alive',
    aliases: ['status', 'bot'],
    category: 'general',
    description: 'Show that the bot is online, its uptime, and system status',
    usage: 'alive',
    isPrefixless: true,
    async handler(_sock, _message, _args, context) {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const cpuLoad = os.loadavg()[0];

        await context.reply(
            `╭─〔 ${context.config.botName} 〕\n` +
            `│ Online: yes\n` +
            `│ Uptime: ${formatUptime(process.uptime())}\n` +
            `│ RAM: ${formatMemory(usedMemory)} / ${formatMemory(totalMemory)}\n` +
            `│ CPU load: ${cpuLoad.toFixed(2)}\n` +
            `│ Node.js: ${process.version}\n` +
            `╰────────────`
        );
    }
};