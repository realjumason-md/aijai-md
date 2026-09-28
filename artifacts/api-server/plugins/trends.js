import axios from 'axios';
export default {
    command: 'trends',
    aliases: ['trend', 'trending'],
    category: 'info',
    description: 'Get trending topics from a country.',
    usage: '.trends <country-name>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        try {
            const country = args.join(' ').trim();
            if (!country) {
                await sock.sendMessage(chatId, {
                    text: '*Please provide a country name.*\nExample: .trends Pakistan or .trends South-Africa'
                }, { quoted: message });
                return;
            }
            const countryCodes = {
                uganda: 'UG',
                kenya: 'KE',
                tanzania: 'TZ',
                rwanda: 'RW',
                nigeria: 'NG',
                ghana: 'GH',
                pakistan: 'PK',
                'south-africa': 'ZA',
                'south africa': 'ZA',
                india: 'IN',
                'united-kingdom': 'GB',
                uk: 'GB',
                usa: 'US',
                'united-states': 'US'
            };
            const geo = countryCodes[country.toLowerCase()] || country.slice(0, 2).toUpperCase();
            const { data: xml } = await axios.get(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`, {
                timeout: 15000,
                responseType: 'text'
            });
            const result = [...xml.matchAll(/<title>([^<]+)<\/title>/g)]
                .slice(1, 11)
                .map((match) => ({ hastag: match[1], tweet: '' }));
            if (result.length === 0) {
                throw new Error('No data received');
            }
            let output = `*Trending topics in ${country}:*\n\n`;
            if (typeof result === 'string') {
                output += result;
            }
            else if (Array.isArray(result) && result.length) {
                result.forEach((trend, i) => {
                    output += `${i + 1}. ${trend.hastag}${trend.tweet ? ` - ${trend.tweet}` : ''}\n`;
                });
            }
            else {
                throw new Error('No trending data found');
            }
            await sock.sendMessage(chatId, {
                text: output
            }, { quoted: message });
        }
        catch (error) {
            console.error('Error in trendsCommand:', error);
            await sock.sendMessage(chatId, {
                text: '❌ Failed to fetch trending topics. Please try again later.'
            }, { quoted: message });
        }
    }
};
