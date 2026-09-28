import store from '../lib/lightweight_store.js';
import config from '../config.js';

const fallbackQuotes = [
    'Stay positive, work hard, make it happen.',
    'Every day is a new beginning.',
    'Believe in yourself and keep moving forward.',
    'Small steps every day lead to big results.'
];

let autoBioInterval = null;

function getRandomQuote() {
    return fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
}

function limitBio(value) {
    const bio = String(value || '').trim();
    if (bio.length <= 139)
        return bio;
    return `${bio.slice(0, 136)}...`;
}

async function getAutoBioSettings() {
    return await store.getSetting('global', 'autoBio') || {
        enabled: false,
        customBio: null
    };
}

async function updateAutoBio(sock) {
    try {
        const settings = await getAutoBioSettings();
        if (!settings.enabled)
            return;
        const quote = getRandomQuote();
        const template = settings.customBio || `{quote}\n\n${config.botName}`;
        const bio = limitBio(template.replaceAll('{quote}', quote));
        await sock.updateProfileStatus(bio);
    }
    catch (error) {
        console.error(`[SETBIO] Failed to update auto bio: ${error.message}`);
    }
}

export function startAutoBio(sock) {
    if (autoBioInterval)
        return;
    void updateAutoBio(sock);
    autoBioInterval = setInterval(() => void updateAutoBio(sock), 10 * 60 * 1000);
}

export function stopAutoBio() {
    if (!autoBioInterval)
        return;
    clearInterval(autoBioInterval);
    autoBioInterval = null;
}

async function saveBio(sock, bio, settings) {
    const customBio = limitBio(bio);
    if (!customBio)
        throw new Error('Please provide bio text.');
    settings.customBio = customBio;
    await store.saveSetting('global', 'autoBio', settings);
    await sock.updateProfileStatus(customBio.replaceAll('{quote}', getRandomQuote()));
    return customBio;
}

export default {
    command: 'setbio',
    aliases: ['autobio', 'bio'],
    category: 'owner',
    description: 'Set the bot profile bio or manage automatic bio updates',
    usage: 'setbio <text> | setbio on | setbio off',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || context.jid || message.key.remoteJid;
        const action = args[0]?.toLowerCase();
        const settings = await getAutoBioSettings();
        const send = (text) => sock.sendMessage(
            chatId,
            { text, ...(context.channelInfo || {}) },
            { quoted: message }
        );

        try {
            if (!action) {
                await send(
                    `╭━━〔 BIO SETTINGS 〕━━╮\n` +
                    `┃ Auto bio: ${settings.enabled ? '✅ ON' : '❌ OFF'}\n` +
                    `┃ Custom bio: ${settings.customBio ? '✅ SET' : '❌ NOT SET'}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                    `Usage:\n` +
                    `• ${context.prefix}setbio <text>\n` +
                    `• ${context.prefix}setbio set <text>\n` +
                    `• ${context.prefix}setbio on/off\n` +
                    `• ${context.prefix}setbio reset`
                );
                return;
            }

            if (action === 'on') {
                settings.enabled = true;
                await store.saveSetting('global', 'autoBio', settings);
                startAutoBio(sock);
                await send('✅ Automatic bio updates are now enabled.');
                return;
            }

            if (action === 'off') {
                settings.enabled = false;
                await store.saveSetting('global', 'autoBio', settings);
                stopAutoBio();
                await send('❌ Automatic bio updates are now disabled.');
                return;
            }

            if (action === 'reset') {
                settings.customBio = null;
                await store.saveSetting('global', 'autoBio', settings);
                if (settings.enabled)
                    await updateAutoBio(sock);
                await send('✅ Custom bio cleared and the default bio was restored.');
                return;
            }

            const bio = action === 'set'
                ? args.slice(1).join(' ')
                : args.join(' ');
            const savedBio = await saveBio(sock, bio, settings);
            await send(
                `✅ Profile bio updated.\n\n` +
                `Bio:\n${savedBio}\n\n` +
                (settings.enabled
                    ? 'Automatic bio is enabled.'
                    : `Use ${context.prefix}setbio on to enable automatic updates.`)
            );
        }
        catch (error) {
            await send(`❌ Failed to update profile bio: ${error.message}`);
        }
    },
    startAutoBio,
    stopAutoBio,
    updateAutoBio
};