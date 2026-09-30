import assert from 'node:assert/strict';
import test from 'node:test';
import { getDirectAiIdentityReply } from '../lib/ai-identity.js';

test('answers direct identity questions in a short, casual, truthful way', () => {
    for (const message of [
        'Is it ai?',
        'Are you an AI?',
        'Hey, are you a bot?',
        'Are you human?',
        'Is this an AI assistant?'
    ]) {
        assert.equal(
            getDirectAiIdentityReply(message),
            'Yeah, I’m an AI assistant, but I can still chat naturally with you.'
        );
    }
});

test('does not treat ordinary mentions of AI or bots as identity questions', () => {
    for (const message of [
        'Can AI help me write a birthday message?',
        'Is this AI-generated photo accurate?',
        'What does the word chatbot mean?'
    ]) {
        assert.equal(getDirectAiIdentityReply(message), undefined);
    }
});