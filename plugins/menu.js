import commandHandler from '../lib/commandHandler.js';

export default {
    command: 'menu',
    aliases: ['list', 'help', 'h', 'commands'],
    category: 'general',
    description: 'Show all available commands',
    usage: 'menu',
    async handler(sock, message, args, context) {
        const titleCase = (value) => value
            .replace(/[-_]+/g, ' ')
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
        const labels = new Set();
        const lines = [...commandHandler.commands.values()]
            .sort((left, right) => left.command.localeCompare(right.command))
            .map((plugin) => plugin.menuName || titleCase(plugin.command))
            .filter((label) => {
                if (labels.has(label))
                    return false;
                labels.add(label);
                return true;
            })
            .map((label) => `• ${label}`);
        await context.reply(
            `╭─〔 ${context.config.botName} 〕\n│ Commands\n╰────────────\n\n${lines.join('\n')}\n\nUse ${context.prefix}command to run one.`
        );
    }
};