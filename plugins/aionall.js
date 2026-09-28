export default {
    command: 'aionall',
    aliases: [],
    category: 'ai',
    menuName: 'AI',
    description: 'Turn on AI replies in all direct messages',
    usage: 'aionall',
    async handler(sock, message, args, context) {
        await context.aiState.setGlobalDm(true);
        await context.reply('AI replies are now ON globally for direct messages. This replaces previous chat-specific settings.');
    }
};