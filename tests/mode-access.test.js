import assert from 'node:assert/strict';
import test from 'node:test';
import { getModeAccessDecision } from '../lib/mode-access.js';

test('private mode silently ignores commands from non-owner users', () => {
    assert.deepEqual(
        getModeAccessDecision('private', false, false, true),
        { allowed: false, notify: false }
    );
});

test('private mode keeps commands available to the owner and sudo users', () => {
    assert.deepEqual(
        getModeAccessDecision('private', false, true, true),
        { allowed: true, notify: false }
    );
});

test('other restricted modes continue to explain why commands are blocked', () => {
    assert.deepEqual(
        getModeAccessDecision('groups', false, false, true),
        { allowed: false, notify: true }
    );
});