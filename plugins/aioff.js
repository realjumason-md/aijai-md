export default {
    command: 'aioff',
    aliases: [],
    category: 'ai',
    menuName: 'AI',
    directMessageOnly: true,
    description: 'Turn off AI replies in this chat',
    usage: 'aioff',
    async handler(sock, message, args, context) {
        await context.aiState.setChatOverride(context.jid, false);
        await context.reply('AI replies are now OFF in this chat.');
    }
};