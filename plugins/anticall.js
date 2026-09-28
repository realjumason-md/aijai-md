import fs from 'fs';
import path from 'node:path';
import { dataFile } from '../lib/paths.js';

const statePath = dataFile('anticall.json');

function readState() {
    try {
        if (!fs.existsSync(statePath))
            return { enabled: false };
        const data = JSON.parse(fs.readFileSync(statePath, 'utf8') || '{}');
        return { enabled: data.enabled === true };
    }
    catch {
        return { enabled: false };
    }
}

function writeState(enabled) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ enabled: !!enabled }, null, 2));
}

export default {
    command: 'anticall',
    aliases: ['acall', 'callblock'],
    category: 'owner',
    description: 'Enable or disable auto-blocking of incoming calls',
    usage: 'anticall <on|off|status>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const state = readState();
        const subcommand = context.args.join(' ').trim().toLowerCase();
        if (!['on', 'off', 'status'].includes(subcommand)) {
            await context.reply(
                '*ANTICALL SETTINGS*\n\n📵 Auto-block incoming calls\n\n' +
                '*Usage:*\n' +
                `• ${context.prefix}anticall on - Enable\n` +
                `• ${context.prefix}anticall off - Disable\n` +
                `• ${context.prefix}anticall status - Current status\n\n` +
                `*Current Status:* ${state.enabled ? '✅ ENABLED' : '❌ DISABLED'}`
            );
            return;
        }
        if (subcommand === 'status') {
            await context.reply(
                `📵 *Anticall Status*\n\nCurrent: ${state.enabled ? '✅ *ENABLED*' : '❌ *DISABLED*'}\n\n` +
                `${state.enabled ? 'All incoming calls will be rejected and blocked.' : 'Incoming calls are allowed.'}`
            );
            return;
        }
        const enabled = subcommand === 'on';
        writeState(enabled);
        await context.reply(
            `📵 *Anticall ${enabled ? 'ENABLED' : 'DISABLED'}*\n\n` +
            `${enabled ? '✅ Incoming calls will now be rejected and blocked automatically.' : '❌ Incoming calls are now allowed.'}`
        );
    },
    readState,
    writeState
};