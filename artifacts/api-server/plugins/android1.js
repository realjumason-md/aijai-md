export default {
    command: 'apkdl',
    aliases: ['apk', 'an1apk', 'appdl', 'app'],
    category: 'download',
    description: 'Search APKs and download by reply',
    usage: '.apkdl <apk_name>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        try {
            if (!query) {
                return await sock.sendMessage(chatId, { text: '*Please provide an APK name.*\nExample: .apkdl Telegram' }, { quoted: message });
            }
            const searchUrl = `https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=${encodeURIComponent(query)}`;
            await sock.sendMessage(chatId, {
                text: `📱 *APK search for ${query}*\n\n${searchUrl}\n\nUse a trusted source and verify downloads before installing.`
            }, { quoted: message });
        }
        catch (err) {
            console.error('❌ Android Plugin Error:', err);
            await sock.sendMessage(chatId, { text: '❌ Failed to process APK request.' }, { quoted: message });
        }
    }
};
