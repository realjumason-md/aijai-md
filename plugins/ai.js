import { generateAiReply, hasAiProvider } from '../lib/aijai-ai.js';

export default {
    command: 'ai',
    aliases: ['ask'],
    category: 'ai',
    menuName: 'AI',
    description: 'Ask the AI assistant a question',
    usage: 'ai <question>',
    async handler(sock, message, args, context) {
        const prompt = args.join(' ').trim();
        if (!prompt) {
            await context.reply(`Usage: ${context.prefix}ai <question>`);
            return;
        }
        if (!hasAiProvider()) {
            await context.reply('AI is not configured. Set AI_PROVIDER and its matching API key first.');
            return;
        }
        const reply = await generateAiReply(prompt);
        await context.reply(reply);
    }
};