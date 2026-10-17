import test from 'node:test';
import assert from 'node:assert/strict';
import { findTikTokUrl, handleTikTokLink } from '../lib/tiktok-link-handler.js';

const publicVideoUrl = 'https://www.tiktok.com/@creator/video/1234567890123456789';

function message(remoteJid = '256700000000@s.whatsapp.net') {
    return { key: { remoteJid } };
}

function makeSocket() {
    const sent = [];
    return {
        sent,
        socket: {
            sendMessage: async (jid, payload, options) => {
                sent.push({ jid, payload, options });
            }
        }
    };
}

test('detects public TikTok video and short-share links from message text', () => {
    assert.equal(findTikTokUrl(`Here is the clip: ${publicVideoUrl}.`), publicVideoUrl);
    assert.equal(
        findTikTokUrl('https://vm.tiktok.com/ZMxyz123/'),
        'https://vm.tiktok.com/ZMxyz123/'
    );
    assert.equal(
        findTikTokUrl('https://www.tiktok.com/t/ZMxyz123/'),
        'https://www.tiktok.com/t/ZMxyz123/'
    );
});

test('ignores non-TikTok, lookalike, profile, and nonstandard-port URLs', () => {
    assert.equal(findTikTokUrl('https://example.com/video/123'), null);
    assert.equal(findTikTokUrl('https://www.tiktok.com.evil.example/@creator/video/123'), null);
    assert.equal(findTikTokUrl('https://www.tiktok.com/@creator'), null);
    assert.equal(findTikTokUrl('https://vm.tiktok.com:8443/ZMxyz123/'), null);
});

test('sends fetched TikTok video as WhatsApp video media', async () => {
    const { socket, sent } = makeSocket();
    const video = Buffer.from('video bytes');

    const handled = await handleTikTokLink(socket, message(), publicVideoUrl, {
        download: async (url) => {
            assert.equal(url, publicVideoUrl);
            return video;
        }
    });

    assert.equal(handled, true);
    assert.equal(sent[0].payload.text, 'Fetching the public TikTok video…');
    assert.deepEqual(sent[1].payload.video, video);
    assert.equal(sent[1].payload.mimetype, 'video/mp4');
});

test('reports anonymous-download failures without throwing into the bot loop', async () => {
    const { socket, sent } = makeSocket();

    await assert.doesNotReject(() => handleTikTokLink(socket, message(), publicVideoUrl, {
        download: async () => {
            throw Object.assign(new Error('requires sign-in'), { code: 'public-only' });
        }
    }));

    assert.match(sent.at(-1).payload.text, /public TikTok videos/i);
    assert.doesNotMatch(sent.at(-1).payload.text, /requires sign-in/i);
});

test('limits concurrent downloads and contains WhatsApp send errors', async () => {
    const first = makeSocket();
    const second = makeSocket();
    let finishDownload;
    let secondDownloadStarted = false;
    const pendingDownload = new Promise((resolve) => {
        finishDownload = resolve;
    });

    const firstRequest = handleTikTokLink(first.socket, message(), publicVideoUrl, {
        download: () => pendingDownload
    });
    await new Promise((resolve) => setImmediate(resolve));

    await assert.doesNotReject(() => handleTikTokLink({
        sendMessage: async (jid, payload, options) => second.sent.push({ jid, payload, options })
    }, message(), publicVideoUrl, {
        download: async () => {
            secondDownloadStarted = true;
            return Buffer.from('should not run');
        }
    }));

    assert.equal(secondDownloadStarted, false);
    assert.match(second.sent.at(-1).payload.text, /already running/i);

    finishDownload(Buffer.from('first video'));
    await firstRequest;

    await assert.doesNotReject(() => handleTikTokLink({
        sendMessage: async () => {
            throw new Error('WhatsApp is disconnected');
        }
    }, message(), publicVideoUrl, {
        download: async () => {
            throw new Error('temporary extractor failure');
        }
    }));
});
