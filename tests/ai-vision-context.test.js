import assert from 'node:assert/strict';
import test from 'node:test';
import { AiVisionContext } from '../lib/ai-vision-context.js';

function storedHistory() {
    return [
        { role: 'user', content: 'What do you see in this photo?' },
        { role: 'assistant', content: 'I see a person outside near trees.' },
        { role: 'user', content: 'What about the background?' },
        { role: 'assistant', content: 'There are plants behind them.' }
    ];
}

function photoTurn() {
    return {
        images: [{ data: 'YWJj', mimeType: 'image/jpeg' }],
        userText: 'What do you see in this photo?',
        assistantText: 'I see a person outside near trees.'
    };
}

test('reattaches a recent photo to its original turn for follow-up questions', () => {
    const memory = new AiVisionContext();
    const history = storedHistory();

    assert.equal(memory.remember('chat-a', photoTurn(), 1_000), true);
    const result = memory.attach('chat-a', history, 2_000);

    assert.equal(result.attached, true);
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

test('keeps photo context isolated, short-lived, and limited to configured follow-ups', () => {
    const memory = new AiVisionContext({ ttlMs: 100, maxFollowUps: 1 });
    const history = storedHistory();
    memory.remember('chat-a', photoTurn(), 1_000);

    assert.equal(memory.attach('chat-b', history, 1_010).attached, false);
    assert.equal(memory.attach('chat-a', history, 1_010).attached, true);
    memory.consume('chat-a');
    assert.equal(memory.attach('chat-a', history, 1_020).attached, false);

    memory.remember('chat-a', photoTurn(), 2_000);
    assert.equal(memory.attach('chat-a', history, 2_100).attached, false);
});

test('does not keep images above the configured memory limit', () => {
    const memory = new AiVisionContext({ maxImageBytes: 2 });
    const oversizedPhoto = {
        ...photoTurn(),
        images: [{ data: 'YWJj', mimeType: 'image/jpeg' }]
    };

    assert.equal(memory.remember('chat-a', oversizedPhoto, 1_000), false);
    assert.equal(memory.attach('chat-a', storedHistory(), 1_010).attached, false);
});
