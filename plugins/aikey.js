import { getAiStatus } from '../lib/aijai-ai.js';

export default {
    command: 'aikey',
    aliases: ['aistatus'],
    category: 'ai',
    menuName: 'Ollama status',
    directMessageOnly: true,
    ownerOnly: true,
    description: 'Show local Ollama readiness without exposing secrets',
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
            'Ollama is local and does not require an API key.',
            `Use ${context.prefix}aiswitch ollama to enable it.`
        ].join('\n'));
    }
};