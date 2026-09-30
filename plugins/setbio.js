import store from '../lib/lightweight_store.js';
import config from '../config.js';

const fallbackQuotes = [
    'Stay positive, work hard, make it happen.',
    'Every day is a new beginning.',
    'Believe in yourself and keep moving forward.',
    'Small steps every day lead to big results.'
];
const quoteSources = [
    'https://raw.githubusercontent.com/GlobalTechInfo/Islamic-Database/main/text/random_quotes.txt',
    'https://raw.githubusercontent.com/GlobalTechInfo/Islamic-Database/main/text/motivational_quotes.txt',
    'https://raw.githubusercontent.com/GlobalTechInfo/Islamic-Database/main/text/pickup_quotes.txt'
];

let autoBioInterval = null;
let cachedQuotes = [];
let quoteLoadPromise = null;

async function fetchQuotes() {
    if (cachedQuotes.length)
        return cachedQuotes;
    if (quoteLoadPromise)
        return quoteLoadPromise;

    quoteLoadPromise = Promise.allSettled(quoteSources.map(async (url) => {
        const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
        if (!response.ok)
            return [];
        const body = await response.text();
        return body
            .split(/\r?\n/)
            .map((quote) => quote.trim())
            .filter((quote) => quote.length > 0 && quote.length <= 139);
    })).then((results) => {
        cachedQuotes = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
        return cachedQuotes.length ? cachedQuotes : fallbackQuotes;
    }).finally(() => {
        quoteLoadPromise = null;
    });

    return quoteLoadPromise;
}

function getRandomQuote(quotes = cachedQuotes.length ? cachedQuotes : fallbackQuotes) {
    return quotes[Math.floor(Math.random() * quotes.length)];
}

function getQuotedText(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    return quoted?.conversation
        || quoted?.extendedTextMessage?.text
        || quoted?.imageMessage?.caption
        || quoted?.videoMessage?.caption
        || '';
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
        const quote = getRandomQuote(await fetchQuotes());
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
    const quote = getRandomQuote(await fetchQuotes());
    await sock.updateProfileStatus(customBio.replaceAll('{quote}', quote));
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

            if (action === 'preview') {
                const quote = getRandomQuote(await fetchQuotes());
                const template = settings.customBio || `{quote}\n\n${config.botName}`;
                await send(`📝 *Bio preview*\n\n${limitBio(template.replaceAll('{quote}', quote))}`);
                return;
            }

            const bio = action === 'set'
                ? (args.slice(1).join(' ') || getQuotedText(message))
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