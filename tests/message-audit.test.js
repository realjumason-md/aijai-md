import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aijai-audit-test-'));
process.env.BOT_STORAGE_DIR = storageRoot;
const {
    cacheMessageForAudit,
    extractPlainText,
    formatAuditNotice,
    getAuditFeatureEnabled,
    handleAuditMessageUpdates,
    markGroupAuditNoticeSent,
    prepareGroupAuditMessageCapture,
    setAuditFeatureEnabled
} = await import('../lib/message-audit.js');
const [{ default: antideletePlugin }, { default: antieditPlugin }] = await Promise.all([
    import('../plugins/antidelete.js'),
    import('../plugins/antiedit.js')
]);

test.after(() => {
    fs.rmSync(storageRoot, { recursive: true, force: true });
});

test('extracts ordinary WhatsApp text and ignores disappearing/view-once wrappers', () => {
    assert.equal(extractPlainText({ conversation: 'hello' }), 'hello');
    assert.equal(extractPlainText({ extendedTextMessage: { text: 'edited hello' } }), 'edited hello');
    assert.equal(extractPlainText({ ephemeralMessage: { message: { conversation: 'temporary' } } }), null);
    assert.equal(extractPlainText({ viewOnceMessageV2: { message: { conversation: 'private' } } }), null);
});

test('audit controls are owner-only but available in DMs and groups', () => {
    for (const plugin of [antideletePlugin, antieditPlugin]) {
        assert.equal(plugin.ownerOnly, true);
        assert.equal(plugin.groupOnly, undefined);
    }
});

test('formats an edit notice with both versions and a date/time', () => {
    const notice = formatAuditNotice({
        type: 'edit',
        chatName: 'Garden group',
        sender: '256700000001',
        actor: '256700000002',
        changedAt: Date.UTC(2026, 8, 30, 9, 30),
        timeZone: 'Africa/Kampala',
        previousText: 'before',
        newText: 'after'
    });
    assert.match(notice, /EDITED TEXT MESSAGE/);
    assert.match(notice, /Garden group/);
    assert.match(notice, /Date and time:/);
    assert.match(notice, /Previous text:\nbefore/);
    assert.match(notice, /Edited text:\nafter/);
});

test('sends a deleted DM to the configured owner when global tracking is enabled', async () => {
    const dm = '256700000001@s.whatsapp.net';
    const owner = '256700000003@s.whatsapp.net';
    const sent = [];
    const sock = {
        user: { id: '256700000004@s.whatsapp.net' },
        getName: async (jid) => jid === group ? 'Garden group' : jid,
        sendMessage: async (jid, content) => sent.push({ jid, content })
    };

    setAuditFeatureEnabled('antidelete', true);
    assert.equal(getAuditFeatureEnabled('antidelete'), true);
    cacheMessageForAudit({
        key: { remoteJid: dm, id: 'message-1' },
        message: { conversation: 'please keep this message' },
        messageTimestamp: 1_790_741_400
    });

    await handleAuditMessageUpdates(sock, [{
        key: { remoteJid: dm, id: 'message-1' },
        update: {
            message: null,
            messageStubType: 1,
            key: { remoteJid: dm }
        }
    }], {
        store: { loadMessage: async () => null },
        config: { ownerNumber: owner.replace(/\D/g, ''), timeZone: 'Africa/Kampala' }
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].jid, owner);
    assert.match(sent[0].content.text, /DELETED TEXT MESSAGE/);
    assert.match(sent[0].content.text, /please keep this message/);
    assert.match(sent[0].content.text, /Date and time:/);

    setAuditFeatureEnabled('antidelete', false);
    assert.equal(getAuditFeatureEnabled('antidelete'), false);
});

test('forwards both versions of an edited DM globally', async () => {
    const dm = '256700000001@s.whatsapp.net';
    const sent = [];
    const sock = {
        user: { id: '256700000004@s.whatsapp.net' },
        getName: async (jid) => jid,
        sendMessage: async (jid, content) => sent.push({ jid, content })
    };

    setAuditFeatureEnabled('antiedit', true);
    cacheMessageForAudit({
        key: { remoteJid: dm, id: 'message-2' },
        message: { extendedTextMessage: { text: 'first version' } },
        messageTimestamp: 1_790_741_400
    });

    await handleAuditMessageUpdates(sock, [{
        key: { remoteJid: dm, id: 'message-2' },
        update: {
            message: { editedMessage: { message: { conversation: 'revised version' } } },
            messageTimestamp: 1_790_741_500
        }
    }], {
        store: { loadMessage: async () => null },
        config: { ownerNumber: '256700000003', timeZone: 'Africa/Kampala' }
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].jid, '256700000003@s.whatsapp.net');
    assert.match(sent[0].content.text, /EDITED TEXT MESSAGE/);
    assert.match(sent[0].content.text, /first version/);
    assert.match(sent[0].content.text, /revised version/);
    setAuditFeatureEnabled('antiedit', false);
});

test('posts a notice once before tracking messages in a group', async () => {
    const group = '120363000000000002@g.us';
    const owner = '256700000003@s.whatsapp.net';
    const sent = [];
    const sock = {
        user: { id: '256700000004@s.whatsapp.net' },
        getName: async (jid) => jid,
        sendMessage: async (jid, content) => sent.push({ jid, content })
    };

    setAuditFeatureEnabled('antiedit', false);
    setAuditFeatureEnabled('antidelete', true);
    assert.equal(await prepareGroupAuditMessageCapture(sock, group, { prefixes: ['.'] }), false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].jid, group);
    assert.match(sent[0].content.text, /global tracking/);
    assert.match(sent[0].content.text, /deleted plain-text messages/);
    assert.equal(await prepareGroupAuditMessageCapture(sock, group, { prefixes: ['.'] }), true);

    cacheMessageForAudit({
        key: { remoteJid: group, id: 'group-message', participant: '256700000001@s.whatsapp.net' },
        message: { conversation: 'a group message after the notice' },
        messageTimestamp: 1_790_741_400
    }, sock);
    await handleAuditMessageUpdates(sock, [{
        key: { remoteJid: group, id: 'group-message', participant: '256700000001@s.whatsapp.net' },
        update: {
            message: null,
            messageStubType: 1,
            key: { remoteJid: group, participant: '256700000002@s.whatsapp.net' }
        }
    }], { store: { loadMessage: async () => null }, config: { ownerNumber: '256700000003' } });
    assert.equal(sent[1].jid, owner);
    assert.match(sent[1].content.text, /a group message after the notice/);

    setAuditFeatureEnabled('antidelete', false);
    setAuditFeatureEnabled('antidelete', true);
    assert.equal(await prepareGroupAuditMessageCapture(sock, group, { prefixes: ['.'] }), false);
    markGroupAuditNoticeSent(group, 'antidelete');
    setAuditFeatureEnabled('antidelete', false);
});