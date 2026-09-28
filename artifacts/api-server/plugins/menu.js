import commandHandler from '../lib/commandHandler.js';

export default {
    command: 'menu',
    aliases: ['list', 'help', 'h', 'commands'],
    category: 'general',
    description: 'Show all available commands',
    usage: 'menu',
    async handler(sock, message, ...args) {
        const context = args.at(-1);
        const lines = [...commandHandler.commands.values()].map((plugin) => {
            const aliases = plugin.aliases?.length ? ` (${plugin.aliases.join(', ')})` : '';
            return `• ${context.prefix}${plugin.command}${aliases}\n  ${plugin.description || ''}`;
        });
        await context.reply(
            `╭─〔 ${context.config.botName} 〕\n│ Commands\n╰────────────\n\n${lines.join('\n\n')}\n\nUse ${context.prefix}command to run one.`
        );
    }
};