import fs from 'node:fs';
import store from '../lib/lightweight_store.js';
import commandHandler from '../lib/commandHandler.js';
import { dataFile } from '../lib/paths.js';

function readFileState(fileName) {
    try {
        const filePath = dataFile(fileName);
        if (!fs.existsSync(filePath))
            return undefined;
        return JSON.parse(fs.readFileSync(filePath, 'utf8') || '{}');
    }
    catch {
        return undefined;
    }
}

async function readSetting(key, fileName) {
    const fileState = readFileState(fileName);
    if (fileState !== undefined)
        return fileState;

    try {
        return await store.getSetting('global', key);
    }
    catch {
        return undefined;
    }
}

function isEnabled(value) {
    if (typeof value === 'boolean')
        return value;
    return value?.enabled === true;
}

function status(value) {
    return isEnabled(value) ? '✅ ON' : '❌ OFF';
}

export default {
    command: 'settings',
    aliases: ['setting', 'config'],
    category: 'owner',
    description: 'Show bot and chat settings',
    usage: 'settings',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || context.jid || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};
        const [
            autoStatus,
            autoread,
            autotyping,
            anticall,
            autoReaction,
            stealthMode,
            autoBio,
            pmblocker
        ] = await Promise.all([
            readSetting('autoStatus', 'autoStatus.json'),
            readSetting('autoread', 'autoread.json'),
            readSetting('autotyping', 'autotyping.json'),
            readSetting('anticall', 'anticall.json'),
            readSetting('autoReaction', 'autoReaction.json'),
            readSetting('stealthMode', 'stealthMode.json'),
            readSetting('autoBio', 'autoBio.json'),
            readSetting('pmblocker', 'pmblocker.json')
        ]);

        const aiProvider = context.config.aiProvider || 'auto';
        const aiModel = context.config.aiModel || 'default';
        const aiEnabled = context.aiState?.isEnabled(chatId) === true;
        const lines = [
            `╭━━〔 ${context.config.botName || 'AIJAI-MD'} SETTINGS 〕━━╮`,
            `┃ Mode: ${(context.config.commandMode || 'public').toUpperCase()}`,
            `┃ Prefixes: ${(context.config.prefixes || [context.prefix || '.']).join(', ')}`,
            `┃ Timezone: ${context.config.timeZone || 'UTC'}`,
            `┃ Plugins: ${commandHandler.commands.size}`,
            `┣━━〔 AI 〕━━━━━━━━━━━━━━┫`,
            `┃ Provider: ${aiProvider}`,
            `┃ Model: ${aiModel}`,
            `┃ Private chat AI: ${aiEnabled ? '✅ ON' : '❌ OFF'}`,
            `┣━━〔 FEATURES 〕━━━━━━━━━┫`,
            `┃ Auto status: ${status(autoStatus)}`,
            `┃ Auto read: ${status(autoread)}`,
            `┃ Auto typing: ${status(autotyping)}`,
            `┃ Anti-call: ${status(anticall)}`,
            `┃ Auto reaction: ${status(autoReaction)}`,
            `┃ Stealth mode: ${status(stealthMode)}`,
            `┃ Auto bio: ${status(autoBio)}`,
            `┃ PM blocker: ${status(pmblocker)}`
        ];

        if (context.isGroup) {
            let groupSettings = {};
            try {
                groupSettings = await store.getAllSettings(chatId) || {};
            }
            catch {
                groupSettings = {};
            }
            const groupKeys = Object.keys(groupSettings);
            lines.push(
                `┣━━〔 GROUP 〕━━━━━━━━━━━━┫`,
                `┃ Saved settings: ${groupKeys.length}`,
                ...(groupKeys.length
                    ? groupKeys.slice(0, 8).map((key) => `┃ ${key}: ${status(groupSettings[key])}`)
                    : ['┃ No group settings saved'])
            );
        }
        else {
            lines.push(
                `┣━━━━━━━━━━━━━━━━━━━━━━━┫`,
                `┃ Use this command in a group to view group settings.`
            );
        }

        lines.push(
            `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
            `Use ${context.prefix || '.'}menu to browse commands.`
        );

        await sock.sendMessage(chatId, { text: lines.join('\n'), ...channelInfo }, { quoted: message });
    }
};