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
        const lines = [...commandHandler.commands.values()]
            .sort((left, right) => left.command.localeCompare(right.command))
            .map((plugin) => {
                const label = plugin.menuName && plugin.menuName !== 'AI'
                    ? plugin.menuName
                    : titleCase(plugin.command);
                const description = plugin.description ? ` — ${plugin.description}` : '';
                const aliases = plugin.aliases?.length ? ` (aliases: ${plugin.aliases.join(', ')})` : '';
                return `• ${context.prefix}${plugin.command} — ${label}${aliases}${description}`;
            });
        await context.reply(
            `╭─〔 ${context.config.botName} 〕\n│ Commands\n╰────────────\n\n${lines.join('\n')}\n\nUse ${context.prefix}command to run one.`
        );
    }
};