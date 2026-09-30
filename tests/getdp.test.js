import test from 'node:test';
import assert from 'node:assert/strict';
import getdp from '../plugins/getdp.js';

const lid = '765309986@lid';
const phoneJid = '256765309986@s.whatsapp.net';

function makeSocket({ profilePictureUrl, groupMetadata } = {}) {
    const sent = [];
    const socket = {
        user: { id: '256700000000:3@s.whatsapp.net' },
        signalRepository: {
            lidMapping: {
                getPNForLID: async (jid) => jid === lid ? phoneJid : undefined
            }
        },
        decodeJid: (jid) => jid?.replace(/:\d+(?=@)/, ''),
        getName: async () => '',
        groupMetadata: groupMetadata || (async () => ({ participants: [] })),
        profilePictureUrl: profilePictureUrl || (async () => 'https://example.test/profile.jpg'),
        sendMessage: async (_chatId, payload) => sent.push(payload)
    };
    return { socket, sent };
}

function directMessage(remoteJid = lid) {
    return {
        key: { remoteJid },
        message: { extendedTextMessage: { text: '.getdp' } }
    };
}

test('getdp retries a private-chat LID using its mapped phone JID', async () => {
    const lookedUp = [];
    const { socket, sent } = makeSocket({
        profilePictureUrl: async (jid, type) => {
            lookedUp.push([jid, type]);
            if (jid === phoneJid && type === 'image')
                return 'https://example.test/profile.jpg';
            throw new Error('profile picture not available for this JID');
        }
    });

    await getdp.handler(socket, directMessage(), [], {
        chatId: lid,
        prefix: '.'
    });

    assert.ok(lookedUp.some(([jid]) => jid === lid));
    assert.ok(lookedUp.some(([jid]) => jid === phoneJid));
    assert.equal(sent[0].image.url, 'https://example.test/profile.jpg');
});

test('getdp resolves a mentioned LID to its phone JID in a group', async () => {
    const groupJid = '12345-67890@g.us';
    const { socket, sent } = makeSocket({
        groupMetadata: async () => ({
            participants: [{ id: phoneJid, lid }]
        }),
        profilePictureUrl: async (jid) => {
            if (jid === phoneJid)
                return 'https://example.test/group-user.jpg';
            throw new Error('LID lookup failed');
        }
    });
    const message = {
        key: { remoteJid: groupJid },
        message: {
            extendedTextMessage: {
                text: '.getdp @user',
                contextInfo: { mentionedJid: [lid] }
            }
        }
    };

    await getdp.handler(socket, message, [], {
        chatId: groupJid,
        prefix: '.'
    });

    assert.equal(sent[0].image.url, 'https://example.test/group-user.jpg');
});

test('getdp explains when WhatsApp does not make a photo available', async () => {
    const { socket, sent } = makeSocket({
        profilePictureUrl: async () => {
            throw new Error('not authorized');
        }
    });

    await getdp.handler(socket, directMessage(), [], {
        chatId: lid,
        prefix: '.'
    });

    assert.match(sent[0].text, /privacy settings/i);
    assert.match(sent[0].text, /photo available/i);
});