import fs from 'fs';
import path from 'node:path';
import { dataFile } from '../lib/paths.js';

const configPath = dataFile('autoStatus.json');

function readConfig() {
    try {
        if (!fs.existsSync(configPath))
            return { enabled: false, reactOn: false };
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8') || '{}');
        return { enabled: config.enabled === true, reactOn: config.reactOn === true };
    }
    catch {
        return { enabled: false, reactOn: false };
    }
}

function writeConfig(config) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
        enabled: config.enabled === true,
        reactOn: config.reactOn === true
    }, null, 2));
}

async function reactToStatus(sock, statusKey) {
    if (!statusKey?.id || !readConfig().reactOn)
        return;
    try {
        await sock.relayMessage('status@broadcast', {
            reactionMessage: {
                key: {
                    remoteJid: 'status@broadcast',
                    id: statusKey.id,
                    participant: statusKey.participant || statusKey.remoteJid,
                    fromMe: false
                },
                text: '💚'
            }
        }, {
            messageId: statusKey.id,
            statusJidList: [statusKey.remoteJid, statusKey.participant || statusKey.remoteJid]
        });
        console.log('✅ Reacted to status');
    }
    catch (error) {
        console.error(`❌ Error reacting to status: ${error.message}`);
    }
}

async function handleStatusUpdate(sock, status) {
    if (!readConfig().enabled)
        return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusKey = status?.messages?.[0]?.key
        || status?.key
        || status?.reaction?.key;
    if (statusKey?.remoteJid !== 'status@broadcast')
        return;
    try {
        await sock.readMessages([statusKey]);
        console.log('✅ Viewed status');
        await reactToStatus(sock, statusKey);
    }
    catch (error) {
        if (error.message?.includes('rate-overlimit')) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await sock.readMessages([statusKey]).catch(() => {});
        }
        else {
            console.error(`❌ Error viewing status: ${error.message}`);
        }
    }
}

export default {
    command: 'autostatus',
    aliases: ['autoview', 'statusview'],
    category: 'owner',
    description: 'Automatically view and react to WhatsApp statuses',
    usage: 'autostatus <on|off|react on|react off>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const config = readConfig();
        const subcommand = context.args[0]?.toLowerCase();
        const action = context.args[1]?.toLowerCase();
        if (!subcommand) {
            await sock.sendMessage(context.jid, {
                text: `🔄 *Auto Status Settings*\n\n📱 *Auto Status View:* ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                    `💫 *Status Reactions:* ${config.reactOn ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                    `*Commands:*\n• ${context.prefix}autostatus on - Enable auto view\n` +
                    `• ${context.prefix}autostatus off - Disable auto view\n` +
                    `• ${context.prefix}autostatus react on - Enable reaction\n` +
                    `• ${context.prefix}autostatus react off - Disable reaction`,
            }, { quoted: message });
            return;
        }
        if (subcommand === 'on' || subcommand === 'off') {
            config.enabled = subcommand === 'on';
            writeConfig(config);
            await sock.sendMessage(context.jid, {
                text: config.enabled
                    ? '✅ *Auto status view enabled!*\n\nBot will now automatically view all contact statuses.'
                    : '❌ *Auto status view disabled!*\n\nBot will no longer automatically view statuses.',
            }, { quoted: message });
            return;
        }
        if (subcommand === 'react' && (action === 'on' || action === 'off')) {
            config.reactOn = action === 'on';
            writeConfig(config);
            await sock.sendMessage(context.jid, {
                text: config.reactOn
                    ? '💫 *Status reactions enabled!*\n\nBot will now react to status updates with 💚'
                    : '❌ *Status reactions disabled!*\n\nBot will no longer react to status updates.',
            }, { quoted: message });
            return;
        }
        await context.reply(
            `❌ *Invalid command!*\n\nUse ${context.prefix}autostatus on/off or ${context.prefix}autostatus react on/off`
        );
    },
    readConfig,
    writeConfig,
    handleStatusUpdate,
    reactToStatus
};