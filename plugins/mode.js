import store from '../lib/lightweight_store.js';

const MODES = {
    public: {
        icon: '🌍',
        description: 'Everyone can use the bot in groups and private chats.'
    },
    private: {
        icon: '🔒',
        description: 'Only the owner and sudo users can use the bot.'
    },
    groups: {
        icon: '👥',
        description: 'Everyone can use the bot in group chats only.'
    },
    inbox: {
        icon: '💬',
        description: 'Everyone can use the bot in private chats only.'
    },
    self: {
        icon: '👤',
        description: 'Only the owner and sudo users can use the bot.'
    }
};

function statusText(mode) {
    const current = MODES[mode] ? mode : 'public';
    const lines = [
        '📊 *BOT MODE STATUS*',
        '',
        `Current mode: ${MODES[current].icon} *${current.toUpperCase()}*`,
        MODES[current].description,
        '',
        '*Available modes:*'
    ];

    for (const [name, details] of Object.entries(MODES)) {
        lines.push(`${name === current ? '✓ ' : ''}${details.icon} \`${name}\` — ${details.description}`);
    }

    lines.push('', `Use ${'${prefix}'}mode <public|private|groups|inbox|self> to change it.`);
    return lines.join('\n');
}

export default {
    command: 'mode',
    aliases: ['botmode', 'setmode'],
    category: 'owner',
    description: 'Choose who can use the bot and where',
    usage: 'mode [public|private|groups|inbox|self|status]',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const requested = args[0]?.toLowerCase();
        const current = await store.getBotMode();

        if (!requested || requested === 'status' || requested === 'check') {
            await context.reply(statusText(current).replace('${prefix}', context.prefix || '.'));
            return;
        }

        if (!Object.hasOwn(MODES, requested)) {
            await context.reply(
                `❌ Invalid mode: *${requested}*\n\n` +
                `Valid modes: ${Object.keys(MODES).join(', ')}\n` +
                `Use ${context.prefix || '.'}mode status to view the current mode.`
            );
            return;
        }

        await store.setBotMode(requested);
        await sock.sendMessage(
            chatId,
            {
                text: `${MODES[requested].icon} *Mode changed to ${requested.toUpperCase()}*\n\n` +
                    `${MODES[requested].description}`
            },
            { quoted: message }
        );
    }
};