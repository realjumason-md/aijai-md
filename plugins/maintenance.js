import fs from 'node:fs';
import path from 'node:path';
import commandHandler from '../lib/commandHandler.js';
import { dataFile } from '../lib/paths.js';

const statePath = dataFile('maintenance.json');

function readState() {
    try {
        if (!fs.existsSync(statePath))
            return { enabled: false };
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8') || '{}');
        return { enabled: state.enabled === true };
    }
    catch {
        return { enabled: false };
    }
}

function writeState(enabled) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ enabled: Boolean(enabled) }, null, 2));
    commandHandler.setMaintenanceMode(enabled);
}

const initialState = readState();
commandHandler.setMaintenanceMode(initialState.enabled);

export default {
    command: 'maintenance',
    aliases: [
        'maintainancemode',
        'maintainance',
        'maintainance-mode',
        'mtnc',
        'lockdown'
    ],
    category: 'owner',
    description: 'Turn maintenance mode on or off',
    usage: 'maintenance <on|off|status>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const action = args[0]?.toLowerCase();
        const state = readState();

        if (!action || action === 'status') {
            await context.reply(
                `🛠️ *Maintenance mode:* ${state.enabled ? '✅ ON' : '❌ OFF'}\n\n` +
                `Use ${context.prefix || '.'}maintenance on/off.`
            );
            return;
        }

        if (action !== 'on' && action !== 'off') {
            await context.reply(
                `❌ Usage: ${context.prefix || '.'}maintenance on|off|status`
            );
            return;
        }

        const enabled = action === 'on';
        writeState(enabled);
        await context.reply(
            enabled
                ? '🛠️ *Maintenance mode enabled.*\nNon-owner commands are temporarily disabled.'
                : '✅ *Maintenance mode disabled.*\nAll commands are active again.'
        );
    },
    readState,
    writeState
};