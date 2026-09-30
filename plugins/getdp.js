function normalizeJid(sock, jid) {
    if (typeof jid !== 'string' || !jid)
        return '';
    const decoded = typeof sock.decodeJid === 'function' ? sock.decodeJid(jid) : jid;
    return typeof decoded === 'string' ? decoded.replace(/:\d+(?=@)/, '') : jid;
}

function addCandidate(candidates, sock, jid) {
    const normalized = normalizeJid(sock, jid);
    if (normalized && !candidates.includes(normalized))
        candidates.push(normalized);
}

export default {
    command: 'getdp',
    aliases: ['getpp', 'dlpp', 'profilepic'],
    category: 'general',
    description: 'Get a WhatsApp profile picture',
    usage: 'getdp [reply | @user | number]',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || context.jid || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const info = message.message?.extendedTextMessage?.contextInfo;
        let target = normalizeJid(sock, chatId) || chatId;
        let displayName = isGroup ? 'Group' : 'User';
        let displayNumber = '';

        if (args[0]) {
            const number = args[0].replace(/[^0-9]/g, '');
            if (number.length < 10) {
                await sock.sendMessage(
                    chatId,
                    { text: `❌ Invalid number. Use ${context.prefix}getdp 256700000000`, ...(context.channelInfo || {}) },
                    { quoted: message }
                );
                return;
            }
            target = `${number}@s.whatsapp.net`;
            displayName = '';
        }
        else if (info?.mentionedJid?.[0]) {
            target = info.mentionedJid[0];
            displayName = 'User';
        }
        else if (info?.participant) {
            target = info.participant;
            displayName = info.pushName || 'User';
        }

        try {
            if (!target || typeof target !== 'string')
                throw new Error('No valid WhatsApp user was found.');
            target = normalizeJid(sock, target) || target;
            const candidates = [];
            addCandidate(candidates, sock, target);

            if (target.endsWith('@lid') && isGroup) {
                const metadata = await sock.groupMetadata(chatId).catch(() => null);
                const participant = metadata?.participants?.find(
                    (item) =>
                        normalizeJid(sock, item.lid) === target ||
                        normalizeJid(sock, item.id) === target
                );
                if (participant?.id)
                    addCandidate(candidates, sock, participant.id);
            }
            if (target.endsWith('@lid')) {
                const getPNForLID = sock.signalRepository?.lidMapping?.getPNForLID;
                if (typeof getPNForLID === 'function') {
                    const phoneJid = await getPNForLID.call(sock.signalRepository.lidMapping, target);
                    if (phoneJid)
                        addCandidate(candidates, sock, phoneJid);
                }
            }

            if (target.endsWith('@g.us')) {
                const metadata = await sock.groupMetadata(target).catch(() => null);
                displayName = metadata?.subject || 'Group';
            }
            else if (displayName === 'User' && typeof sock.getName === 'function') {
                const name = await sock.getName(target).catch(() => '');
                if (name && !name.startsWith('+'))
                    displayName = name;
            }

            const cleanNumber = target.replace(/@s\.whatsapp\.net|@lid/g, '').split(':')[0];
            if ((target.endsWith('@s.whatsapp.net') || target.endsWith('@lid')) && cleanNumber.length >= 10)
                displayNumber = `+${cleanNumber}`;

            let profileUrl;
            let lastLookupError;
            for (const candidate of candidates) {
                for (const type of ['image', 'preview']) {
                    try {
                        profileUrl = await sock.profilePictureUrl(candidate, type, 15000);
                        if (profileUrl)
                            break;
                    }
                    catch (error) {
                        lastLookupError = error;
                    }
                }
                if (profileUrl)
                    break;
            }
            if (!profileUrl)
                throw lastLookupError || new Error('WhatsApp returned no profile picture URL.');

            await sock.sendMessage(
                chatId,
                {
                    image: { url: profileUrl },
                    caption: `📸 Profile picture${displayName ? `\n\nName: ${displayName}` : ''}${displayNumber ? `\nNumber: ${displayNumber}` : ''}`,
                    ...(context.channelInfo || {})
                },
                { quoted: message }
            );
        }
        catch (error) {
            console.error(`[getpp] Failed for target ${target}:`, error?.message || error);
            await sock.sendMessage(
                chatId,
                {
                    text: `❌ I couldn't access a profile picture${displayName ? ` for ${displayName}` : ''}.${displayNumber ? `\nNumber: ${displayNumber}` : ''}\nThe user may have hidden it in WhatsApp privacy settings, or WhatsApp may not have a photo available for this account.`,
                    ...(context.channelInfo || {})
                },
                { quoted: message }
            );
        }
    }
};