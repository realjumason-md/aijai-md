import path from 'node:path';

// Set BOT_STORAGE_DIR to a Railway volume mount (for example /data). When it is
// absent, local development continues to use the repository directory.
const configuredStorageRoot = process.env.BOT_STORAGE_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || process.cwd();
export const STORAGE_DIR = path.resolve(configuredStorageRoot);
export const DATA_DIR = path.join(STORAGE_DIR, 'data');
export const ASSETS_DIR = path.join(process.cwd(), 'assets');
export const TEMP_DIR = path.join(STORAGE_DIR, 'temp');
export const SESSION_DIR = path.join(STORAGE_DIR, 'session');
export const dataFile = (filename) => path.join(DATA_DIR, filename);
