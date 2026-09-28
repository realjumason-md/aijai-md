import { getAiStatus } from '../lib/aijai-ai.js';

export default {
    command: 'aikey',
    aliases: ['aistatus'],
    category: 'ai',
    menuName: 'AI key status',
    directMessageOnly: true,
    ownerOnly: true,
    description: 'Show AI provider readiness without exposing secrets',
    usage: 'aikey',
    async handler(_sock, _message, _args, context) {
        const status = getAiStatus();
        const providers = status.providers
            .map((provider) => `• ${provider.name}: ${provider.ready ? 'available' : 'key not configured'} — ${provider.description}`)
            .join('\n');
        await context.reply([
            `AI provider: ${status.selected}`,
            `Model: ${status.model || 'none'}`,
            '',
            providers,
            '',
            'API keys are never displayed or accepted in chat.',
            `Use ${context.prefix}aiswitch <provider> to select one.`
        ].join('\n'));
    }
};