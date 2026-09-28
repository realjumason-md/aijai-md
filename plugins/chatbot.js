import { setChatbot } from '../lib/index.js';

export default {
    command: 'chatbot',
    aliases: [],
    category: 'ai',
    menuName: 'Chatbot',
    groupOnly: true,
    adminOnly: true,
    description: 'Turn automatic AI replies on or off for this group',
    usage: 'chatbot <on|off>',
    async handler(sock, message, args, context) {
        const action = args[0]?.toLowerCase();
        if (action !== 'on' && action !== 'off') {
            await context.reply(`Usage: ${context.prefix}chatbot <on|off>`);
            return;
        }
        const enabled = action === 'on';
        const saved = await setChatbot(context.jid, enabled);
        if (!saved)
            throw new Error('Could not save the group chatbot setting.');
        await context.reply(`Group chatbot is now ${enabled ? 'ON' : 'OFF'}.`);
    }
};