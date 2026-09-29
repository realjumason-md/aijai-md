import { getAiStatus } from '../lib/aijai-ai.js';

export default {
    command: 'aikey',
    aliases: ['aistatus'],
    category: 'ai',
    menuName: 'Groq status',
    directMessageOnly: true,
    ownerOnly: true,
    description: 'Show Groq API readiness without exposing secrets',
    usage: 'aikey',
    async handler(_sock, _message, _args, context) {
        const status = getAiStatus();
        const providers = status.providers
            .map((provider) => `• ${provider.name}: ${provider.ready ? 'available' : 'key not configured'} — ${provider.description}`)
            .join('\n');
        await context.reply([
            `AI provider: ${status.selected}`,
            `Chat model: ${status.model || 'none'}`,
            `Vision model: ${status.visionModel || 'none'}`,
            '',
            providers,
            '',
            'The Groq API key is never shown in chat.',
            `Use ${context.prefix}aiswitch groq to enable Groq, or ${context.prefix}aiswitch off to disable AI.`
        ].join('\n'));
    }
};