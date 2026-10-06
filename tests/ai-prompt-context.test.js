import assert from 'node:assert/strict';
import test from 'node:test';
import { callWithPromptFallback, trimPromptHistory } from '../lib/ai-prompt-context.js';

test('keeps recent turns when text history exceeds the prompt budget', () => {
    const history = Array.from({ length: 8 }, (_, index) => [
        { role: 'user', content: `Question ${index}: ${'x'.repeat(1_200)}` },
        { role: 'assistant', content: `Reply ${index}: ${'y'.repeat(1_200)}` }
    ]).flat();

    const trimmed = trimPromptHistory(history);
    const characters = trimmed.reduce((total, message) => total + message.content.length, 0);

    assert.ok(characters <= 8_000);
    assert.equal(trimmed.at(-2).content.startsWith('Question 7:'), true);
    assert.equal(trimmed.at(-1).content.startsWith('Reply 7:'), true);
    assert.equal(trimmed[0].content.startsWith('Question 5:'), true);
});

test('keeps only the newest photo turn in the prompt history', () => {
    const history = [
        {
            role: 'user',
            content: [
                { type: 'text', text: 'First photo' },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,first' } }
            ]
        },
        { role: 'assistant', content: 'First description' },
        {
            role: 'user',
            content: [
                { type: 'text', text: 'Second photo' },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,second' } }
            ]
        },
        { role: 'assistant', content: 'Second description' }
    ];

    const trimmed = trimPromptHistory(history);

    assert.equal(trimmed.length, 2);
    assert.equal(trimmed[0].content[0].text, 'Second photo');
});

test('uses a smaller history window when the current request includes an image', () => {
    const history = Array.from({ length: 3 }, (_, index) => [
        { role: 'user', content: `Question ${index}: ${'x'.repeat(950)}` },
        { role: 'assistant', content: `Reply ${index}: ${'y'.repeat(950)}` }
    ]).flat();

    const trimmed = trimPromptHistory(history, { hasCurrentImage: true });
    const characters = trimmed.reduce((total, message) => total + message.content.length, 0);

    assert.ok(characters <= 4_000);
    assert.equal(trimmed[0].content.startsWith('Question 1:'), true);
    assert.equal(trimmed.at(-2).content.startsWith('Question 2:'), true);
});

test('retries a 413 with older conversation turns removed', async () => {
    const history = Array.from({ length: 3 }, (_, index) => [
        { role: 'user', content: `Question ${index}` },
        { role: 'assistant', content: `Reply ${index}` }
    ]).flat();
    const attempts = [];

    const reply = await callWithPromptFallback(history, async (messages, options) => {
        attempts.push({ messages: messages.map((message) => message.content), ...options });
        if (messages.length > 2) {
            const error = new Error('Request too large');
            error.status = 413;
            throw error;
        }
        return 'reply';
    });

    assert.equal(reply, 'reply');
    assert.deepEqual(attempts.map((attempt) => attempt.messages), [
        ['Question 0', 'Reply 0', 'Question 1', 'Reply 1', 'Question 2', 'Reply 2'],
        ['Question 1', 'Reply 1', 'Question 2', 'Reply 2'],
        ['Question 2', 'Reply 2']
    ]);
    assert.ok(attempts.every((attempt) => attempt.includeExamples));
});

test('removes style examples as a final 413 fallback, then preserves the original error', async () => {
    const attempts = [];

    await assert.rejects(
        callWithPromptFallback([], async (history, options) => {
            attempts.push({ history, ...options });
            const error = new Error('Still too large');
            error.status = 413;
            throw error;
        }),
        /Still too large/
    );

    assert.deepEqual(attempts.map((attempt) => attempt.includeExamples), [true, false]);
});
