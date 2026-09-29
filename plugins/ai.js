import { generateAiReply, getImageInputs, hasAiProvider } from '../lib/aijai-ai.js';

export default {
    command: 'ai',
    aliases: ['ask'],
    category: 'ai',
    menuName: 'AI',
    description: 'Ask the AI assistant a question',
    usage: 'ai <question>',
    async handler(sock, message, args, context) {
        const prompt = args.join(' ').trim();
        const images = await getImageInputs(message);
        if (!prompt && !images.length) {
            await context.reply(`Usage: ${context.prefix}ai <question>`);
            return;
        }
        if (!hasAiProvider()) {
            await context.reply(`AI is switched off. Use ${context.prefix}aiswitch groq.`);
            return;
        }
        const reply = await generateAiReply({
            text: prompt || 'Please look at this image and respond naturally.',
            images
        });
        await context.reply(reply);
    }
};