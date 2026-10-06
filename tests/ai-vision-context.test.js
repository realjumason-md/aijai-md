import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AiVisionContext, isPhotoFollowUp } from '../lib/ai-vision-context.js';

async function createTemporaryContext(t, options = {}) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'aijai-vision-context-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return new AiVisionContext({
        directory: path.join(directory, 'cache'),
        ...options
    });
}

function storedHistory(userText = 'What do you see in this photo?', assistantText = 'I see a person outside near trees.') {
    return [
        { role: 'user', content: userText },
        { role: 'assistant', content: assistantText },
        { role: 'user', content: 'What about the background?' },
        { role: 'assistant', content: 'There are plants behind them.' }
    ];
}

function photoTurn({
    data = 'YWJj',
    userText = 'What do you see in this photo?',
    assistantText = 'I see a person outside near trees.'
} = {}) {
    return {
        images: [{ data, mimeType: 'image/jpeg' }],
        userText,
        assistantText
    };
}

test('saves the image outside the repo and restores it onto its original turn after restart', async (t) => {
    const memory = await createTemporaryContext(t);
    const history = storedHistory();

    assert.equal(await memory.remember('chat-a', photoTurn()), true);
    const index = await readFile(memory.indexPath, 'utf8');
    assert.equal(index.includes('chat-a'), false);

    const restartedMemory = new AiVisionContext({ directory: memory.directory });
    const result = await restartedMemory.attach('chat-a', history);

    assert.equal(result.attached, true);
    assert.deepEqual(result.images, []);
    assert.deepEqual(result.history[0].content, [
        { type: 'text', text: 'What do you see in this photo?' },
        {
            type: 'image_url',
            image_url: { url: 'data:image/jpeg;base64,YWJj' }
        }
    ]);
    assert.equal(result.history[2].content, 'What about the background?');
    assert.equal(history[0].content, 'What do you see in this photo?');
});

test('keeps photo context across repeated follow-ups and sends it with the current question when history is trimmed', async (t) => {
    const memory = await createTemporaryContext(t);
    await memory.remember('chat-a', photoTurn());

    assert.equal((await memory.attach('chat-b', storedHistory())).attached, false);
    for (let index = 0; index < 7; index += 1)
        assert.equal((await memory.attach('chat-a', storedHistory())).attached, true);

    const trimmedHistory = [
        { role: 'user', content: 'What about the photo I sent earlier?' },
        { role: 'assistant', content: 'Which part do you mean?' }
    ];
    const result = await memory.attach('chat-a', trimmedHistory);
    assert.equal(result.attached, true);
    assert.deepEqual(result.history, trimmedHistory);
    assert.deepEqual(result.images, [{
        data: 'YWJj',
        mimeType: 'image/jpeg',
        contextText: 'The most recent saved photo from this chat.'
    }]);
});

test('retains multiple photos from one chat until the shared storage budget evicts them', async (t) => {
    const memory = await createTemporaryContext(t, { maxStorageBytes: 20 });
    const history = [
        { role: 'user', content: 'First photo' },
        { role: 'assistant', content: 'First description' },
        { role: 'user', content: 'Second photo' },
        { role: 'assistant', content: 'Second description' }
    ];

    await memory.remember('chat-a', photoTurn({
        data: 'YQ==',
        userText: 'First photo',
        assistantText: 'First description'
    }));
    await memory.remember('chat-a', photoTurn({
        data: 'Yg==',
        userText: 'Second photo',
        assistantText: 'Second description'
    }));

    const result = await memory.attach('chat-a', history);
    assert.equal(result.attached, true);
    assert.deepEqual(result.images, []);
    assert.match(result.history[0].content[1].image_url.url, /base64,YQ==$/);
    assert.match(result.history[2].content[1].image_url.url, /base64,Yg==$/);
});

test('evicts the oldest saved photo when the total storage budget fills', async (t) => {
    const memory = await createTemporaryContext(t, { maxStorageBytes: 6 });
    await memory.remember('chat-old', photoTurn({ data: 'YWJjZA==' }));
    await memory.remember('chat-new', photoTurn({ data: 'ZWZn' }));

    assert.equal((await memory.attach('chat-old', storedHistory())).attached, false);
    const latest = await memory.attach('chat-new', storedHistory());
    assert.equal(latest.attached, true);
    assert.deepEqual(latest.history[0].content[1], {
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,ZWZn' }
    });

    const imageFiles = await readdir(path.join(memory.directory, 'photos'));
    assert.equal(imageFiles.length, 1);
    assert.equal((await stat(path.join(memory.directory, 'photos', imageFiles[0]))).size, 3);
});

test('does not cache a single image larger than the total storage limit', async (t) => {
    const memory = await createTemporaryContext(t, { maxStorageBytes: 2 });

    assert.equal(await memory.remember('chat-a', photoTurn()), false);
    assert.equal((await memory.attach('chat-a', storedHistory())).attached, false);
    assert.deepEqual(await readdir(path.join(memory.directory, 'photos')), []);
});

test('only reuses saved photo context for visual follow-up questions', () => {
    assert.equal(isPhotoFollowUp('Does she look like a man?'), true);
    assert.equal(isPhotoFollowUp('What about the background?'), true);
    assert.equal(isPhotoFollowUp('What does tbh mean, what is the full form?'), false);
});
