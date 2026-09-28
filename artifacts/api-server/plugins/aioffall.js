export default {
    command: 'aioffall',
    aliases: [],
    category: 'ai',
    description: 'Turn off AI replies in all direct messages',
    usage: 'aioffall',
    async handler(sock, message, ...args) {
        const context = args.at(-1);
        await context.aiState.setGlobalDm(false);
        await context.reply('AI replies are now OFF globally for direct messages. This replaces previous chat-specific settings.');
    }
};