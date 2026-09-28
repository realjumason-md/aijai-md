export default {
    command: 'aioff',
    aliases: [],
    category: 'ai',
    description: 'Turn off AI replies in this chat',
    usage: 'aioff',
    async handler(sock, message, ...args) {
        const context = args.at(-1);
        await context.aiState.setChatOverride(context.jid, false);
        await context.reply('AI replies are now OFF in this chat.');
    }
};