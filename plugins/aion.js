export default {
    command: 'aion',
    aliases: [],
    category: 'ai',
    description: 'Turn on AI replies in this chat',
    usage: 'aion',
    async handler(sock, message, ...args) {
        const context = args.at(-1);
        await context.aiState.setChatOverride(context.jid, true);
        await context.reply('AI replies are now ON in this chat.');
    }
};