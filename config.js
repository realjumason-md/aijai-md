import 'dotenv/config';

const _prefixes = process.env.PREFIXES
    ? process.env.PREFIXES.split(',').map((prefix) => prefix.trim()).filter(Boolean)
    : ['.', '!', '/', '£', '🇺🇬', '⛱️'];

const config = {
    // Bot Identity
    botName: process.env.BOT_NAME || 'aijai-md',
    botOwner: process.env.BOT_OWNER || process.env.OWNER_NAME || 'Ali Jaiton',
    ownerName: process.env.OWNER_NAME || process.env.BOT_OWNER || 'Ali Jaiton',
    ownerNumber: process.env.OWNER_NUMBER || '256706106326',
    author: process.env.AUTHOR || 'aijai-md',
    packname: process.env.PACKNAME || 'aijai-md',
    description: process.env.DESCRIPTION || 'High performance multi-device WhatsApp bot',
    version: '1.0.0',
    // Bot Config
    prefixes: _prefixes,
    prefix: _prefixes[0],
    commandMode: process.env.COMMAND_MODE || 'public',
    timeZone: process.env.TIMEZONE || 'Africa/Kampala',
    aiProvider: process.env.AI_PROVIDER || 'ollama',
    aiModel: process.env.AI_MODEL || process.env.OLLAMA_MODEL || '',
    visionProvider: 'ollama',
    visionModel: process.env.VISION_MODEL || process.env.OLLAMA_VISION_MODEL || '',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    // Repository used by the owner-only plugin updater
    updateZipUrl: process.env.UPDATE_URL || 'https://github.com/realjumason-md/aijai-md/archive/refs/heads/main.zip',
    pluginRepo: process.env.PLUGIN_REPO || 'realjumason-md/aijai-md',
    pluginBranch: process.env.PLUGIN_BRANCH || 'main',
    // Session
    sessionId: process.env.SESSION_ID || '',
    pairingNumber: process.env.PAIRING_NUMBER || '',
    // Performance
    port: Number(process.env.PORT) || 5000,
    maxStoreMessages: Number(process.env.MAX_STORE_MESSAGES) || 20,
    tempCleanupInterval: Number(process.env.CLEANUP_INTERVAL) || 1 * 60 * 60 * 1000,
    storeWriteInterval: Number(process.env.STORE_WRITE_INTERVAL) || 10000,
    // API Keys
    giphyApiKey: process.env.GIPHY_API_KEY || '',
    removeBgKey: process.env.REMOVEBG_KEY || '',
    // Warn system
    warnCount: 3,
    // External APIs
    APIs: {
        xteam: 'https://api.xteam.xyz',
        dzx: 'https://api.dhamzxploit.my.id',
        lol: 'https://api.lolhuman.xyz',
        violetics: 'https://violetics.pw',
        neoxr: 'https://api.neoxr.my.id',
        zenzapis: 'https://zenzapis.xyz',
        akuari: 'https://api.akuari.my.id',
        akuari2: 'https://apimu.my.id',
        nrtm: 'https://fg-nrtm.ddns.net',
        fgmods: 'https://api-fgmods.ddns.net'
    },
    APIKeys: {
        'https://api.xteam.xyz': process.env.XTEAM_KEY || '',
        'https://api.lolhuman.xyz': process.env.LOLHUMAN_KEY || '',
        'https://api.neoxr.my.id': process.env.NEOXR_KEY || '',
        'https://violetics.pw': process.env.VIOLETICS_KEY || '',
        'https://zenzapis.xyz': process.env.ZENZAPIS_KEY || '',
        'https://api-fgmods.ddns.net': process.env.FGMODS_KEY || ''
    }
};
export default config;
