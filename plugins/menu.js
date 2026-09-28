import commandHandler from '../lib/commandHandler.js';

const categoryOrder = ['general', 'ai', 'media', 'utility', 'admin', 'group', 'owner'];

function formatCategory(category) {
    return category
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function titleCase(value) {
    return value
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(timeZone) {
    return new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timeZone || 'UTC'
    });
}

function getCategories() {
    return [...commandHandler.categories.entries()]
        .map(([category, names]) => ({
            category,
            commands: names
                .map((name) => commandHandler.commands.get(name.toLowerCase()))
                .filter(Boolean)
                .sort((left, right) => left.command.localeCompare(right.command))
        }))
        .filter(({ commands }) => commands.length > 0)
        .sort((left, right) => {
            const leftIndex = categoryOrder.indexOf(left.category);
            const rightIndex = categoryOrder.indexOf(right.category);
            if (leftIndex !== -1 || rightIndex !== -1) {
                return (leftIndex === -1 ? categoryOrder.length : leftIndex)
                    - (rightIndex === -1 ? categoryOrder.length : rightIndex);
            }
            return left.category.localeCompare(right.category);
        });
}

function findCommand(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized)
        return undefined;
    const direct = commandHandler.commands.get(normalized);
    if (direct)
        return direct;
    const commandName = commandHandler.aliases.get(normalized);
    return commandName ? commandHandler.commands.get(commandName) : undefined;
}

export default {
    command: 'menu',
    aliases: ['list', 'help', 'h', 'commands'],
    category: 'general',
    description: 'Show all available commands grouped by category',
    usage: 'menu [command]',
    async handler(sock, message, args, context) {
        const prefix = context.prefix || context.config.prefix || '.';
        const query = args.join(' ').trim();

        if (query) {
            const command = findCommand(query);
            if (!command) {
                await context.reply(
                    `❌ Command "${query}" was not found.\n\nUse ${prefix}menu to view the full command list.`
                );
                return;
            }

            await context.reply(
                `╭━━〔 COMMAND DETAILS 〕━━╮\n` +
                `┃ Name: ${prefix}${command.command}\n` +
                `┃ Description: ${command.description || 'No description available'}\n` +
                `┃ Usage: ${prefix}${command.usage || command.command}\n` +
                `┃ Category: ${formatCategory(command.category || 'misc')}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━╯`
            );
            return;
        }

        const categories = getCategories();
        const lines = [
            `╭━━〔 ${context.config.botName || 'AIJAI-MD'} MENU 〕━━╮`,
            `┃ Bot: ${context.config.botName || 'AIJAI-MD'}`,
            `┃ Prefixes: ${(context.config.prefixes || [prefix]).join(', ')}`,
            `┃ Commands: ${commandHandler.commands.size}`,
            `┃ Time: ${formatTime(context.config.timeZone)}`,
            `┣━━━━━━━━━━━━━━━━━━━━━━┫`
        ];

        for (const { category, commands } of categories) {
            lines.push(`┃ ${formatCategory(category).toUpperCase()} (${commands.length})`);
            for (const [index, command] of commands.entries()) {
                const marker = index === commands.length - 1 ? '└' : '├';
                const label = command.menuName && command.menuName !== 'AI'
                    ? command.menuName
                    : titleCase(command.command);
                lines.push(`┃ ${marker} ${prefix}${command.command} — ${label}`);
            }
            lines.push(`┃`);
        }

        lines.push(
            `╰━━━━━━━━━━━━━━━━━━━━━━╯`,
            `Use ${prefix}menu <command> for details.`,
            `Example: ${prefix}menu ${categories[0]?.commands[0]?.command || 'ping'}`
        );

        await sock.sendMessage(
            context.chatId || context.jid || message.key.remoteJid,
            { text: lines.join('\n'), ...(context.channelInfo || {}) },
            { quoted: message }
        );
    }
};