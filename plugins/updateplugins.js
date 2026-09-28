import { updatePlugins } from '../lib/pluginUpdater.js';

export default {
    command: 'updateplugins',
    aliases: ['pluginupdate', 'pluginsupdate'],
    category: 'owner',
    ownerOnly: true,
    description: 'Update plugins from the configured GitHub repository without restarting',
    usage: 'updateplugins [plugin-name ...]',
    async handler(sock, message, ...args) {
        const context = args.at(-1);
        const result = await updatePlugins(context.args);
        await context.reply([
            `Plugin update finished: ${result.changed.length} updated.`,
            result.changed.length ? `Updated: ${result.changed.join(', ')}` : '',
            result.failed.length ? `Failed: ${result.failed.join('; ')}` : '',
            'The bot connection stayed online; updated commands are reloaded automatically.'
        ].filter(Boolean).join('\n'));
    }
};
