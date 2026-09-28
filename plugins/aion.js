export default {
    command: 'aion',
    aliases: [],
    category: 'ai',
    menuName: 'AI',
    directMessageOnly: true,
    description: 'Turn on AI replies in this chat',
    usage: 'aion',
    async handler(sock, message, args, context) {
        await context.aiState.setChatOverride(context.jid, true);
        await context.reply('AI replies are now ON in this chat.');
    }
};