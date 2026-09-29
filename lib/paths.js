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
    const production = String(process.env.NODE_ENV).toLowerCase() === 'production' ||
        Boolean(process.env.RAILWAY_ENVIRONMENT ||
            process.env.RAILWAY_ENVIRONMENT_NAME ||
            process.env.RAILWAY_PROJECT_ID ||
            process.env.RAILWAY_SERVICE_ID);
    const sessionMode = String(process.env.SESSION_STORAGE || 'auto').trim().toLowerCase();
    // A separate SESSION_ENCRYPTION_KEY is preferred, but the GitHub token is
    // also a secret and can safely keep the session backup usable when the
    // hosting provider only exposes that one configured secret.
    const hasGithubSessionConfig = Boolean(process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
    if (sessionMode === 'local' || !production || hasExplicitStorage || (sessionMode === 'auto' && hasGithubSessionConfig))
        return null;
    if (sessionMode === 'github' && !hasGithubSessionConfig) {
        return 'GitHub session storage requires GITHUB_PERSONAL_ACCESS_TOKEN.';
    }
    // In auto mode, allow a local fallback so the service can boot on hosts
    // where persistent storage has not been configured yet. A volume or
    // encrypted GitHub backup should still be configured before pairing in
    // production if the WhatsApp session must survive redeployments.
    if (sessionMode === 'auto')
        return null;
    return 'Persistent storage is not configured. Attach a Railway volume or configure encrypted GitHub session storage before pairing WhatsApp.';
}
