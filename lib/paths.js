import path from 'node:path';

// Railway sets RAILWAY_VOLUME_MOUNT_PATH automatically when a volume is
// attached. BOT_STORAGE_DIR remains available for other hosting providers.
const configuredStorageRoot = process.env.BOT_STORAGE_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || process.cwd();
export const hasExplicitStorage = Boolean(process.env.BOT_STORAGE_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH);
export const STORAGE_DIR = path.resolve(configuredStorageRoot);
export const DATA_DIR = path.join(STORAGE_DIR, 'data');
export const ASSETS_DIR = path.join(process.cwd(), 'assets');
export const TEMP_DIR = path.join(STORAGE_DIR, 'temp');
export const SESSION_DIR = path.join(STORAGE_DIR, 'session');
export const dataFile = (filename) => path.join(DATA_DIR, filename);

export function storageConfigurationError() {
    if (String(process.env.NODE_ENV).toLowerCase() !== 'production' || hasExplicitStorage)
        return null;
    return 'Persistent storage is not configured. Attach a Railway volume to this service before pairing WhatsApp. The bot will not start without it.';
}
