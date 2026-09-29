import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { printLog } from './print.js';
import { SESSION_DIR } from './paths.js';

const GITHUB_API = 'https://api.github.com';
const SESSION_FILE_VERSION = 1;
const SYNC_DELAY_MS = 5000;

let syncTimer;
let syncPromise = Promise.resolve();
let warnedAboutTokenEncryption = false;

class GithubApiError extends Error {
    constructor(status, message) {
        super(message);
        this.name = 'GithubApiError';
        this.status = status;
    }
}

function sessionStorageMode() {
    return String(process.env.SESSION_STORAGE || 'auto').trim().toLowerCase();
}

function githubSessionConfig() {
    const mode = sessionStorageMode();
    const token = String(process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '').trim();
    const configuredEncryptionKey = String(process.env.SESSION_ENCRYPTION_KEY || '').trim();
    const repository = String(process.env.GITHUB_SESSION_REPO || 'realjumason-md/aijai-md').trim();

    if (mode === 'local' || (mode === 'auto' && !token))
        return null;
    if (mode !== 'github' && mode !== 'auto')
        throw new Error(`Unsupported SESSION_STORAGE value "${mode}". Use local, github, or auto.`);
    if (!token) {
        throw new Error('GitHub session storage requires GITHUB_PERSONAL_ACCESS_TOKEN.');
    }
    if (!/^[^/]+\/[^/]+$/.test(repository)) {
        throw new Error('GITHUB_SESSION_REPO must use the owner/repository format.');
    }

    if (!configuredEncryptionKey && !warnedAboutTokenEncryption) {
        warnedAboutTokenEncryption = true;
        printLog(
            'warning',
            'SESSION_ENCRYPTION_KEY is not set; using the GitHub token as the encrypted session key. Set SESSION_ENCRYPTION_KEY for independent key rotation.'
        );
    }

    return {
        token,
        encryptionKey: configuredEncryptionKey || token,
        repository,
        branch: String(process.env.GITHUB_SESSION_BRANCH || 'bot-session').trim(),
        filePath: String(process.env.GITHUB_SESSION_PATH || '.runtime/whatsapp-session.enc').replace(/^\/+/, '')
    };
}

export function isGithubSessionStorageConfigured() {
    try {
        return githubSessionConfig() !== null;
    }
    catch {
        return false;
    }
}

function repositoryUrl(config, suffix = '') {
    return `${GITHUB_API}/repos/${config.repository}${suffix}`;
}

function encodedPath(filePath) {
    return filePath.split('/').map((part) => encodeURIComponent(part)).join('/');
}

async function githubRequest(config, method, url, body) {
    const response = await fetch(url, {
        method,
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${config.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) {
        const details = (await response.text()).trim().slice(0, 240);
        throw new GithubApiError(
            response.status,
            `GitHub session storage returned HTTP ${response.status}${details ? `: ${details}` : ''}`
        );
    }
    if (response.status === 204)
        return null;
    return response.json();
}

async function githubRequestOptional(config, method, url) {
    try {
        return await githubRequest(config, method, url);
    }
    catch (error) {
        if (error instanceof GithubApiError && error.status === 404)
            return null;
        throw error;
    }
}

async function ensureBranch(config) {
    const branchUrl = repositoryUrl(config, `/git/ref/heads/${encodeURIComponent(config.branch)}`);
    const existing = await githubRequestOptional(config, 'GET', branchUrl);
    if (existing)
        return existing.object.sha;

    const repository = await githubRequest(config, 'GET', repositoryUrl(config));
    const defaultBranch = repository.default_branch || 'main';
    const source = await githubRequest(
        config,
        'GET',
        repositoryUrl(config, `/git/ref/heads/${encodeURIComponent(defaultBranch)}`)
    );
    await githubRequest(config, 'POST', repositoryUrl(config, '/git/refs'), {
        ref: `refs/heads/${config.branch}`,
        sha: source.object.sha
    });
    return source.object.sha;
}

function encryptionKey(value) {
    return crypto.createHash('sha256').update(value).digest();
}

function collectSessionFiles(directory, relativeDirectory = '') {
    const files = {};
    if (!fs.existsSync(directory))
        return files;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink())
            continue;
        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.join(relativeDirectory, entry.name).split(path.sep).join('/');
        if (entry.isDirectory()) {
            Object.assign(files, collectSessionFiles(absolutePath, relativePath));
        }
        else if (entry.isFile()) {
            files[relativePath] = fs.readFileSync(absolutePath).toString('base64');
        }
    }
    return files;
}

function encryptSession(files, secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
    const plaintext = Buffer.from(JSON.stringify({
        version: SESSION_FILE_VERSION,
        files
    }), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return JSON.stringify({
        version: SESSION_FILE_VERSION,
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: encrypted.toString('base64')
    });
}

function decryptSession(serialized, secret) {
    const envelope = JSON.parse(serialized);
    if (envelope.version !== SESSION_FILE_VERSION || envelope.algorithm !== 'aes-256-gcm')
        throw new Error('Unsupported encrypted WhatsApp session format.');

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        encryptionKey(secret),
        Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64')),
        decipher.final()
    ]);
    const payload = JSON.parse(decrypted.toString('utf8'));
    if (payload.version !== SESSION_FILE_VERSION || !payload.files || typeof payload.files !== 'object')
        throw new Error('Encrypted WhatsApp session payload is invalid.');
    return payload.files;
}

function restoreFiles(files) {
    if (typeof files['creds.json'] !== 'string') {
        throw new Error('Encrypted WhatsApp session does not contain creds.json.');
    }
    try {
        const creds = JSON.parse(Buffer.from(files['creds.json'], 'base64').toString('utf8'));
        if (creds?.registered !== true) {
            throw new Error('Encrypted WhatsApp session is not registered.');
        }
    }
    catch (error) {
        throw new Error(`Encrypted WhatsApp session credentials are invalid: ${error.message}`);
    }

    const root = path.resolve(SESSION_DIR);
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });

    for (const [relativePath, encodedContent] of Object.entries(files)) {
        if (typeof encodedContent !== 'string')
            throw new Error('Encrypted WhatsApp session contained invalid file data.');
        const target = path.resolve(root, relativePath);
        if (target !== root && !target.startsWith(`${root}${path.sep}`))
            throw new Error('Encrypted WhatsApp session contained an unsafe path.');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, Buffer.from(encodedContent, 'base64'), { mode: 0o600 });
    }
}

export async function verifyGithubSessionStorage() {
    const config = githubSessionConfig();
    if (config)
        await ensureBranch(config);
}

async function readRemoteSession(config) {
    const url = `${repositoryUrl(config, `/contents/${encodedPath(config.filePath)}`)}?ref=${encodeURIComponent(config.branch)}`;
    const file = await githubRequestOptional(config, 'GET', url);
    if (!file)
        return null;
    if (file.type !== 'file' || typeof file.content !== 'string')
        throw new Error('GitHub session path is not a file.');
    return Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8');
}

export async function restoreGithubSession() {
    const config = githubSessionConfig();
    if (!config || fs.existsSync(path.join(SESSION_DIR, 'creds.json')))
        return false;

    const serialized = await readRemoteSession(config);
    if (!serialized)
        return false;
    restoreFiles(decryptSession(serialized, config.encryptionKey));
    printLog('success', 'Restored the encrypted WhatsApp session from GitHub.');
    return true;
}

export async function clearGithubSessionBackup() {
    const config = githubSessionConfig();
    if (!config)
        return false;

    const current = await githubRequestOptional(
        config,
        'GET',
        `${repositoryUrl(config, `/contents/${encodedPath(config.filePath)}`)}?ref=${encodeURIComponent(config.branch)}`
    );
    if (!current?.sha)
        return false;

    await githubRequest(
        config,
        'DELETE',
        repositoryUrl(config, `/contents/${encodedPath(config.filePath)}`),
        {
            message: 'Remove logged-out WhatsApp session',
            sha: current.sha,
            branch: config.branch
        }
    );
    printLog('info', 'Removed the logged-out WhatsApp session backup from GitHub.');
    return true;
}

async function uploadGithubSession() {
    const config = githubSessionConfig();
    if (!config)
        return;

    const files = collectSessionFiles(SESSION_DIR);
    if (!files['creds.json'])
        return;
    try {
        const creds = JSON.parse(Buffer.from(files['creds.json'], 'base64').toString('utf8'));
        // Never replace the last known-good backup with a half-paired or
        // logged-out state. That would make the next redeploy ask for a code.
        if (creds?.registered !== true)
            return;
    }
    catch {
        return;
    }

    await ensureBranch(config);
    const current = await githubRequestOptional(
        config,
        'GET',
        `${repositoryUrl(config, `/contents/${encodedPath(config.filePath)}`)}?ref=${encodeURIComponent(config.branch)}`
    );
    const body = {
        message: 'Update encrypted WhatsApp session',
        content: Buffer.from(encryptSession(files, config.encryptionKey), 'utf8').toString('base64'),
        branch: config.branch
    };
    if (current?.sha)
        body.sha = current.sha;
    await githubRequest(config, 'PUT', repositoryUrl(config, `/contents/${encodedPath(config.filePath)}`), body);
}

export function scheduleGithubSessionSync() {
    if (!isGithubSessionStorageConfigured() || syncTimer)
        return;
    syncTimer = setTimeout(() => {
        syncTimer = undefined;
        syncPromise = syncPromise
            .then(uploadGithubSession)
            .catch((error) => printLog('error', `Could not back up the WhatsApp session: ${error.message}`));
    }, SYNC_DELAY_MS);
}

export async function flushGithubSessionSync() {
    if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = undefined;
    }
    syncPromise = syncPromise.then(uploadGithubSession);
    await syncPromise;
}