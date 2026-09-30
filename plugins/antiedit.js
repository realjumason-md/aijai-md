import {
    getAuditFeatureEnabled,
    markGroupAuditNoticeSent,
    setAuditFeatureEnabled
} from '../lib/message-audit.js';

export default {
    command: 'antiedit',
    aliases: ['antied'],
    category: 'owner',
    description: 'Track edited text messages globally across DMs and groups',
    usage: 'antiedit <on|off|status>',
    ownerOnly: true,
    async handler(_sock, _message, args, context) {
        const chatId = context.chatId || context.jid;
        const subcommand = args.join(' ').trim().toLowerCase();
        const enabled = getAuditFeatureEnabled('antiedit');

        if (!['on', 'off', 'status'].includes(subcommand)) {
            await context.reply(
                `Use ${context.prefix}antiedit on|off|status.\n` +
                `Current status: ${enabled ? 'ON' : 'OFF'}`
            );
            return;
        }

        if (subcommand === 'status') {
            await context.reply(
                `Global edited-text tracking is ${enabled ? 'ON' : 'OFF'} across DMs and groups. ` +
                'Only ordinary text messages are included. Group tracking starts after a notice is posted; ' +
                'alerts go privately to the configured owner number or, if that is not set, the bot account.'
            );
            return;
        }

        const nextEnabled = subcommand === 'on';
        if (nextEnabled === enabled) {
            await context.reply(`Global edited-text tracking is already ${enabled ? 'ON' : 'OFF'}.`);
            return;
        }

        if (nextEnabled) {
            await context.reply(
                'Notice: global edited-text tracking is being enabled for all DMs with the bot and all groups. ' +
                'Edited ordinary text, including both versions, may be forwarded privately to the configured ' +
                'owner number or bot account with sender and date/time. Other groups receive a notice before ' +
                `tracking starts there. Use ${context.prefix}antiedit off to disable tracking everywhere.`
            );
        }

        setAuditFeatureEnabled('antiedit', nextEnabled);
        if (nextEnabled && context.isGroup)
            markGroupAuditNoticeSent(chatId, 'antiedit');
        if (!nextEnabled) {
            await context.reply('Global edited-text tracking is now OFF across DMs and groups.');
        }
    }
};