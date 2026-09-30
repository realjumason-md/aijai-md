import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AiConversationStore } from '../lib/ai-conversation-store.js';

async function createTemporaryStore(t) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'aijai-ai-memory-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return new AiConversationStore(path.join(directory, 'ai-conversations.json'));
}

test('keeps separate conversation histories and reloads them from disk', async (t) => {
    const store = await createTemporaryStore(t);
    await store.respond('chat-a', 'My name is Alex.', async () => 'Nice to meet you, Alex.');
    await store.respond('chat-b', 'My name is Jordan.', async () => 'Nice to meet you, Jordan.');

    let historyA;
    let historyB;
    await store.respond('chat-a', 'What is my name?', async (history) => {
        historyA = history;
        return 'Alex.';
    });
    await store.respond('chat-b', 'What is my name?', async (history) => {
        historyB = history;
        return 'Jordan.';
    });

    assert.equal(historyA[0].content, 'My name is Alex.');
    assert.equal(historyB[0].content, 'My name is Jordan.');

    const saved = await readFile(store.filePath, 'utf8');
    const restoredStore = new AiConversationStore(store.filePath);
    let restoredHistory;
    await restoredStore.respond('chat-a', 'Do you still remember?', async (history) => {
        restoredHistory = history;
        return 'Yes, Alex.';
    });

    assert.equal(restoredHistory.length, 4);
    assert.equal(restoredHistory[2].content, 'What is my name?');
    assert.ok(saved.includes('Nice to meet you, Alex.'));
});

test('serializes messages in the same conversation so each reply gets the previous turn', async (t) => {
    const store = await createTemporaryStore(t);
    let startFirst;
    const firstStarted = new Promise((resolve) => {
        startFirst = resolve;
    });
    let releaseFirst;
    const firstGate = new Promise((resolve) => {
        releaseFirst = resolve;
    });

    const first = store.respond('chat-a', 'first message', async (history) => {
        assert.equal(history.length, 0);
        startFirst();
        await firstGate;
        return 'first reply';
    });
    await firstStarted;

    let secondHistory;
    const second = store.respond('chat-a', 'second message', async (history) => {
        secondHistory = history;
        return 'second reply';
    });
    releaseFirst();
    await Promise.all([first, second]);

    assert.deepEqual(
        secondHistory.map((message) => message.content),
        ['first message', 'first reply']
    );
});

test('limits stored context to the newest ten exchanges', async (t) => {
    const store = await createTemporaryStore(t);
    for (let index = 0; index < 12; index += 1) {
        await store.respond('chat-a', `message ${index}`, async () => `reply ${index}`);
    }

    let history;
    await store.respond('chat-a', 'last message', async (previous) => {
        history = previous;
        return 'last reply';
    });

    assert.equal(history.length, 20);
    assert.equal(history[0].content, 'message 2');
    assert.equal(history.at(-1).content, 'reply 11');
});