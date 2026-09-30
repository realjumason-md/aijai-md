import {
    getAuditFeatureEnabled,
    setAuditFeatureEnabled
} from '../lib/message-audit.js';

export default {
    command: 'antiedit',
    aliases: ['antied'],
    category: 'owner',
    description: 'Track edited text messages in this group',
    usage: 'antiedit <on|off|status>',
    ownerOnly: true,
    groupOnly: true,
    async handler(_sock, _message, args, context) {
        const chatId = context.chatId || context.jid;
        const subcommand = args.join(' ').trim().toLowerCase();
        const enabled = getAuditFeatureEnabled(chatId, 'antiedit');

        if (!['on', 'off', 'status'].includes(subcommand)) {
            await context.reply(
                `Use ${context.prefix}antiedit on|off|status.\n` +
                `Current status: ${enabled ? 'ON' : 'OFF'}`
            );
            return;
        }

        if (subcommand === 'status') {
            await context.reply(
                `Edited-text tracking is ${enabled ? 'ON' : 'OFF'} in this group. ` +
                'Only plain text messages are included; alerts go privately to the configured owner number ' +
                'or, if that is not set, the bot account.'
            );
            return;
        }

        const nextEnabled = subcommand === 'on';
        if (nextEnabled === enabled) {
            await context.reply(`Edited-text tracking is already ${enabled ? 'ON' : 'OFF'} in this group.`);
            return;
        }

        if (nextEnabled) {
            await context.reply(
                'Notice: edited plain-text messages in this group will be forwarded privately to the configured ' +
                'owner number or bot account, ' +
                'including the previous text, edited text, sender, and date/time. This is a group audit feature; ' +
                'please make sure participants know. Tracking starts after this notice. ' +
                `Use ${context.prefix}antiedit off to disable it.`
            );
        }

        setAuditFeatureEnabled(chatId, 'antiedit', nextEnabled);
        if (!nextEnabled) {
            await context.reply('Edited-text tracking is now OFF in this group.');
        }
    }
};