import assert from 'node:assert/strict';
import test from 'node:test';
import { SYSTEM_PROMPT } from '../lib/ai-system-prompt.js';

test('keeps the assistant general-purpose without adding restrictions beyond Groq policy', () => {
    assert.match(SYSTEM_PROMPT, /general-purpose WhatsApp assistant/i);
    assert.match(SYSTEM_PROMPT, /Follow Groq’s policies/i);
    assert.match(SYSTEM_PROMPT, /Do not impose extra topic or content restrictions of your own/i);
    assert.doesNotMatch(SYSTEM_PROMPT, /helps people communicate clearly and understand useful information/i);
});

test('keeps uncertainty from becoming an automatic refusal', () => {
    assert.match(SYSTEM_PROMPT, /do not treat uncertainty as a reason to refuse/i);
    assert.match(SYSTEM_PROMPT, /still give the best answer you can/i);
});

test('keeps the bot transparent about being an AI assistant', () => {
    assert.match(SYSTEM_PROMPT, /never deny it/i);
});