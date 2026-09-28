import { channelInfo } from '../lib/messageConfig.js';
export default {
    command: 'wattpad',
    aliases: ['wattpadsearch', 'searchwattpad'],
    category: 'search',
    description: 'Search for stories on Wattpad!',
    usage: '.wattpad <query>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) {
            return await sock.sendMessage(chatId, {
                text: '*Please provide a query (e.g., story title, author, or tag).*' +
                    `\nExample: .wattpad The Hunger Games`,
                ...channelInfo
            }, { quoted: message });
        }
        try {
            const searchUrl = `https://www.wattpad.com/search/${encodeURIComponent(query)}`;
            await sock.sendMessage(chatId, {
                text: `*Search Results For "${query}":*\n\nOpen Wattpad search:\n${searchUrl}`,
                ...channelInfo
            }, { quoted: message });
        }
        catch (error) {
            await sock.sendMessage(chatId, {
                text: `❌ An error occurred: ${error.message || error}`,
                ...channelInfo
            }, { quoted: message });
        }
    }
};
