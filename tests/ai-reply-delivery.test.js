import assert from 'node:assert/strict';
import test from 'node:test';
import { sendAiReplyInParts, sendAutomaticAiReply, splitAiReply } from '../lib/ai-reply-delivery.js';
import { startHumanReplyDelay } from '../lib/human-reply-delay.js';

function numberedWords(count) {
    return Array.from({ length: count }, (_, index) => `word${index + 1}`);
}

test('keeps replies of 30 words or fewer in one message', () => {
    const reply = numberedWords(30).join(' ');
    assert.deepEqual(splitAiReply(reply), [reply]);
});

test('splits a reply over 30 words into two messages without losing words', () => {
    const words = numberedWords(31);
    const parts = splitAiReply(words.join(' '));

    assert.equal(parts.length, 2);
    assert.ok(parts.every(Boolean));
    assert.deepEqual(parts.join(' ').split(/\s+/u), words);
});

test('splits long replies into roughly 30-word messages', () => {
    const words = numberedWords(95);
    const parts = splitAiReply(words.join(' '));

    assert.equal(parts.length, 4);
    assert.ok(parts.every(Boolean));
    assert.ok(parts.every((part) => part.split(/\s+/u).length <= 30));
    assert.deepEqual(parts.join(' ').split(/\s+/u), words);
});

test('keeps sentence-boundary splits at or below 30 words', () => {
    const words = numberedWords(95);
    const sentences = [];
    for (let index = 0; index < words.length; index += 35) {
        sentences.push(`${words.slice(index, index + 35).join(' ')}.`);
    }
    const reply = sentences.join(' ');
    const parts = splitAiReply(reply);

    assert.equal(parts.length, 4);
    assert.ok(parts.every((part) => part.split(/\s+/u).length <= 30));
    assert.equal(parts.join(' '), reply);
});

test('prefers sentence boundaries when splitting', () => {
    const firstSentence = numberedWords(17).join(' ');
    const secondSentence = numberedWords(17).slice(17).concat(numberedWords(34).slice(17)).join(' ');
    const reply = `${firstSentence}. ${secondSentence}.`;
    const parts = splitAiReply(reply);

    assert.equal(parts.length, 2);
    assert.ok(parts[0].endsWith('.'));
    assert.equal(`${parts[0]} ${parts[1]}`, reply);
});

test('waits 5 seconds before showing typing on an incoming reply', async () => {
    const events = [];
    let fakeNow = 0;
    const finishHumanReply = startHumanReplyDelay(
        {
            sendPresenceUpdate: async (state, jid) => events.push(`presence:${state}:${jid}`)
        },
        'chat-id',
        {
            wait: async (ms) => {
                events.push(`wait:${ms}`);
                fakeNow += ms;
            },
            now: () => fakeNow,
            random: () => 0
        }
    );

    assert.deepEqual(events, ['wait:5000']);
    await finishHumanReply();
    assert.deepEqual(events, [
        'wait:5000',
        'presence:composing:chat-id',
        'wait:3000',
        'presence:paused:chat-id'
    ]);
});

test('waits 5 seconds before typing and keeps it active for 7-8 seconds between parts', async () => {
    const events = [];
    const words = numberedWords(95);
    let fakeNow = 0;
    const parts = await sendAiReplyInParts(
        {
            sendPresenceUpdate: async (state, jid) => events.push(`presence:${state}:${jid}`)
        },
        'chat-id',
        words.join(' '),
        async (part) => events.push(`message:${part}`),
        {
            wait: async (ms) => {
                events.push(`wait:${ms}`);
                fakeNow += ms;
            },
            now: () => fakeNow
        }
    );

    assert.equal(parts.length, 4);
    assert.equal(events[0], `message:${parts[0]}`);
    let eventIndex = 1;
    for (let partIndex = 1; partIndex < parts.length; partIndex += 1) {
        assert.equal(events[eventIndex++], 'wait:5000');
        assert.equal(events[eventIndex++], 'presence:composing:chat-id');
        let totalWaitMs = 0;
        let refreshCount = 0;
        while (events[eventIndex]?.startsWith('wait:')) {
            const waitEvent = events[eventIndex++];
            const waitMs = Number(waitEvent.slice('wait:'.length));
            assert.ok(Number.isInteger(waitMs));
            totalWaitMs += waitMs;
            if (events[eventIndex] === 'presence:composing:chat-id') {
                refreshCount += 1;
                eventIndex += 1;
            }
        }
        assert.ok(
            totalWaitMs >= 7000 && totalWaitMs <= 8000,
            `Expected 7-8 seconds, got ${totalWaitMs}ms`
        );
        assert.ok(refreshCount >= 2, `Expected typing refreshes during the wait, got ${refreshCount}`);
        assert.equal(events[eventIndex++], `message:${parts[partIndex]}`);
    }
    assert.equal(events[eventIndex], 'presence:paused:chat-id');
});

test('keeps short automatic replies on the original single-send path', async () => {
    const sent = [];
    const reply = 'Hello there!';

    const parts = await sendAutomaticAiReply(
        {},
        'chat-id',
        reply,
        async (part) => sent.push(part)
    );

    assert.deepEqual(parts, [reply]);
    assert.deepEqual(sent, [reply]);
});

test('splits long automatic replies into parts of no more than 30 words', async () => {
    const sent = [];
    const words = numberedWords(95);
    const reply = words.join(' ');
    let fakeNow = 0;
    const parts = await sendAutomaticAiReply(
        {},
        'chat-id',
        reply,
        async (part) => sent.push(part),
        {
            wait: async (ms) => {
                fakeNow += ms;
            },
            now: () => fakeNow
        }
    );

    assert.equal(parts.length, 4);
    assert.deepEqual(sent, parts);
    assert.ok(parts.every((part) => part.split(/\s+/u).length <= 30));
    assert.deepEqual(parts.join(' ').split(/\s+/u), words);
});