import { getAiStatus, setAiProvider } from '../lib/aijai-ai.js';

export default {
    command: 'aiswitch',
    aliases: ['aiprovider'],
    category: 'ai',
    menuName: 'AI provider switch',
    directMessageOnly: true,
    ownerOnly: true,
    description: 'Switch the active AI provider',
    usage: 'aiswitch <auto|ollama|duckduckgo|groq|gemini|openai|xai|off>',
    async handler(_sock, _message, args, context) {
        const provider = args[0]?.toLowerCase();
        if (!provider) {
            const status = getAiStatus();
            await context.reply([
                `Current provider: ${status.selected}`,
                `Configured mode: ${status.configured}`,
                '',
                `Usage: ${context.prefix}aiswitch <provider>`,
                'Providers: auto, ollama, duckduckgo, groq, gemini, openai, xai, off'
            ].join('\n'));
            return;
        }
        const status = setAiProvider(provider);
        await context.reply(`AI provider switched to ${status.selected}. Model: ${status.model || 'none'}.`);
    }
};