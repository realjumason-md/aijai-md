import fs from 'node:fs';
import path from 'node:path';
import commandHandler from '../lib/commandHandler.js';
import { dataFile } from '../lib/paths.js';

const statePath = dataFile('maintenance.json');
const MAX_MAINTENANCE_MINUTES = 24 * 60;
let maintenanceTimer = null;

function readState() {
    try {
        if (!fs.existsSync(statePath))
            return { enabled: false, expiresAt: null };
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8') || '{}');
        const expiresAt = Number(state.expiresAt);
        return {
            enabled: state.enabled === true,
            expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null
        };
    }
    catch {
        return { enabled: false, expiresAt: null };
    }
}

function clearMaintenanceTimer() {
    if (!maintenanceTimer)
        return;
    clearTimeout(maintenanceTimer);
    maintenanceTimer = null;
}

function scheduleMaintenanceOff(expiresAt) {
    clearMaintenanceTimer();
    if (!Number.isFinite(expiresAt))
        return;

    const delay = expiresAt - Date.now();
    if (delay <= 0) {
        writeState(false);
        return;
    }

    maintenanceTimer = setTimeout(() => writeState(false), delay);
    maintenanceTimer.unref?.();
}

function writeState(enabled, expiresAt = null) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const state = {
        enabled: Boolean(enabled),
        expiresAt: enabled && Number.isFinite(expiresAt) ? expiresAt : null
    };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    commandHandler.setMaintenanceMode(state.enabled);

    clearMaintenanceTimer();
    if (state.enabled && state.expiresAt)
        scheduleMaintenanceOff(state.expiresAt);
}

const initialState = readState();
if (initialState.enabled && initialState.expiresAt && initialState.expiresAt <= Date.now()) {
    writeState(false);
} else {
    commandHandler.setMaintenanceMode(initialState.enabled);
    if (initialState.enabled && initialState.expiresAt)
        scheduleMaintenanceOff(initialState.expiresAt);
}

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
    description: 'Enable maintenance mode permanently or for a limited time',
    usage: 'maintenance <on|off|status|minutes|stop>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const action = args[0]?.toLowerCase();
        const state = readState();

        if (!action || action === 'status') {
            const remainingMinutes = state.enabled && state.expiresAt
                ? Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 60000))
                : null;
            await context.reply(
                `🛠️ *Maintenance mode:* ${state.enabled ? '✅ ON' : '❌ OFF'}` +
                `${remainingMinutes === null ? '' : `\n⏳ Automatically turns off in ${remainingMinutes} minute(s).`}\n\n` +
                `Use ${context.prefix || '.'}maintenance on, off, status, or a duration in minutes (1-${MAX_MAINTENANCE_MINUTES}).`
            );
            return;
        }

        if (action === 'off' || action === 'stop') {
            writeState(false);
            await context.reply('✅ *Maintenance mode disabled.*\nAll commands are active again.');
            return;
        }

        if (action === 'on') {
            writeState(true);
            await context.reply('🛠️ *Maintenance mode enabled.*\nNon-owner commands are temporarily disabled.');
            return;
        }

        const requestedMinutes = Number(action);
        if (!/^\d+$/.test(action) || requestedMinutes < 1 || requestedMinutes > MAX_MAINTENANCE_MINUTES) {
            await context.reply(
                `❌ Usage: ${context.prefix || '.'}maintenance on|off|status|minutes|stop\n` +
                `Duration must be a whole number from 1 to ${MAX_MAINTENANCE_MINUTES} minutes.`
            );
            return;
        }

        const expiresAt = Date.now() + requestedMinutes * 60 * 1000;
        writeState(true, expiresAt);
        await context.reply(
            `🛠️ *Maintenance mode enabled for ${requestedMinutes} minute(s).*` +
            `\nIt will turn off automatically. Use ${context.prefix || '.'}maintenance stop to end it early.`
        );
    },
    readState,
    writeState
};