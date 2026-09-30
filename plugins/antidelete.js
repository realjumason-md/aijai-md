import {
    getAuditFeatureEnabled,
    setAuditFeatureEnabled
} from '../lib/message-audit.js';

export default {
    command: 'antidelete',
    aliases: ['antidel'],
    category: 'owner',
    description: 'Track deleted text messages in this group',
    usage: 'antidelete <on|off|status>',
    ownerOnly: true,
    groupOnly: true,
    async handler(_sock, _message, args, context) {
        const chatId = context.chatId || context.jid;
        const subcommand = args.join(' ').trim().toLowerCase();
        const enabled = getAuditFeatureEnabled(chatId, 'antidelete');

        if (!['on', 'off', 'status'].includes(subcommand)) {
            await context.reply(
                `Use ${context.prefix}antidelete on|off|status.\n` +
                `Current status: ${enabled ? 'ON' : 'OFF'}`
            );
            return;
        }

        if (subcommand === 'status') {
            await context.reply(
                `Deleted-text tracking is ${enabled ? 'ON' : 'OFF'} in this group. ` +
                'Only plain text messages are included; alerts go privately to the configured owner number ' +
                'or, if that is not set, the bot account.'
            );
            return;
        }

        const nextEnabled = subcommand === 'on';
        if (nextEnabled === enabled) {
            await context.reply(`Deleted-text tracking is already ${enabled ? 'ON' : 'OFF'} in this group.`);
            return;
        }

        if (nextEnabled) {
            await context.reply(
                'Notice: deleted plain-text messages in this group will be forwarded privately to the configured ' +
                'owner number or bot account, with the sender and date/time. This is a group audit feature; ' +
                'please make sure participants know. ' +
                `Tracking starts after this notice. Use ${context.prefix}antidelete off to disable it.`
            );
        }

        setAuditFeatureEnabled(chatId, 'antidelete', nextEnabled);
        if (!nextEnabled) {
            await context.reply('Deleted-text tracking is now OFF in this group.');
        }
    }
};