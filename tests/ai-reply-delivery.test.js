import assert from 'node:assert/strict';
import test from 'node:test';
import { sendAiReplyInParts, sendAutomaticAiReply, splitAiReply } from '../lib/ai-reply-delivery.js';

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

test('shows typing between message parts and pauses after the final part', async () => {
    const events = [];
    const words = numberedWords(31);
    const parts = await sendAiReplyInParts(
        {
            sendPresenceUpdate: async (state, jid) => events.push(`presence:${state}:${jid}`)
        },
        'chat-id',
        words.join(' '),
        async (part) => events.push(`message:${part}`),
        { wait: async (ms) => events.push(`wait:${ms}`) }
    );

    assert.equal(parts.length, 2);
    assert.equal(events[0], `message:${parts[0]}`);
    assert.equal(events[1], 'presence:composing:chat-id');
    assert.match(events[2], /^wait:/u);
    assert.equal(events[3], `message:${parts[1]}`);
    assert.equal(events[4], 'presence:paused:chat-id');
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
    const parts = await sendAutomaticAiReply(
        {},
        'chat-id',
        reply,
        async (part) => sent.push(part),
        { wait: async () => {} }
    );

    assert.equal(parts.length, 4);
    assert.deepEqual(sent, parts);
    assert.ok(parts.every((part) => part.split(/\s+/u).length <= 30));
    assert.deepEqual(parts.join(' ').split(/\s+/u), words);
});