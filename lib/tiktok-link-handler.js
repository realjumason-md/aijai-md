import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const TIKTOK_HOSTS = new Set([
    'tiktok.com',
    'www.tiktok.com',
    'm.tiktok.com',
    'vm.tiktok.com',
    'vt.tiktok.com'
]);
const SHORT_LINK_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com']);
const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 90_000;
const MAX_STDERR_CHARS = 4_000;

let downloadInProgress = false;

function isTikTokPostUrl(url) {
    if (SHORT_LINK_HOSTS.has(url.hostname)) {
        return /^\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname);
    }

    return /^\/@[a-zA-Z0-9._-]+\/video\/\d+\/?$/.test(url.pathname)
        || /^\/t\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)
        || /^\/v\/\d+\/?$/.test(url.pathname);
}

export function findTikTokUrl(text = '') {
    if (typeof text !== 'string')
        return null;

    const candidates = text.match(/https?:\/\/[^\s<>"']+/giu) || [];
    for (const candidate of candidates) {
        const candidateUrl = candidate.replace(/[),.!?;:\]}]+$/u, '');
        if (candidateUrl.length > 2_048)
            continue;

        try {
            const url = new URL(candidateUrl);
            if (!['http:', 'https:'].includes(url.protocol)
                || !TIKTOK_HOSTS.has(url.hostname.toLowerCase())
                || url.username
                || url.password
                || url.port && url.port !== '443'
                || !isTikTokPostUrl(url)) {
                continue;
            }

            url.protocol = 'https:';
            url.hash = '';
            return url.toString();
        } catch {
            // Ignore malformed or non-TikTok links in the message.
        }
    }

    return null;
}

function downloadError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

async function runYtDlp(url, outputDir, {
    executable = process.env.YT_DLP_PATH || 'yt-dlp',
    timeoutMs = DOWNLOAD_TIMEOUT_MS,
    maxBytes = MAX_VIDEO_BYTES
} = {}) {
    const outputTemplate = path.join(outputDir, 'tiktok.%(ext)s');
    const maxMegabytes = Math.floor(maxBytes / (1024 * 1024));
    const args = [
        '--ignore-config',
        '--no-playlist',
        '--no-progress',
        '--socket-timeout', '15',
        '--retries', '1',
        '--format', 'best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--max-filesize', `${maxMegabytes}M`,
        '--output', outputTemplate,
        url
    ];

    await new Promise((resolve, reject) => {
        let stderr = '';
        let timedOut = false;
        let tooLarge = false;
        let settled = false;
        let sizeCheckPromise = null;

        let child;
        try {
            child = spawn(executable, args, {
                stdio: ['ignore', 'ignore', 'pipe'],
                windowsHide: true
            });
        } catch {
            reject(downloadError('downloader-missing'));
            return;
        }

        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeoutTimer);
            clearInterval(sizeTimer);
            if (error)
                reject(error);
            else
                resolve();
        };

        const checkOutputSize = () => {
            if (sizeCheckPromise)
                return sizeCheckPromise;
            sizeCheckPromise = (async () => {
                try {
                    const entries = await readdir(outputDir, { withFileTypes: true });
                    let totalBytes = 0;
                    for (const entry of entries) {
                        if (!entry.isFile())
                            continue;
                        totalBytes += (await stat(path.join(outputDir, entry.name))).size;
                        if (totalBytes > maxBytes) {
                            tooLarge = true;
                            child.kill('SIGKILL');
                            break;
                        }
                    }
                } catch {
                    // The downloader may not have created an output file yet.
                }
            })().finally(() => {
                sizeCheckPromise = null;
            });
            return sizeCheckPromise;
        };

        const timeoutTimer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);
        const sizeTimer = setInterval(() => {
            void checkOutputSize();
        }, 250);

        child.stderr?.on('data', (chunk) => {
            if (stderr.length < MAX_STDERR_CHARS)
                stderr += chunk.toString().slice(0, MAX_STDERR_CHARS - stderr.length);
        });
        child.once('error', (error) => {
            finish(downloadError(error.code === 'ENOENT' ? 'downloader-missing' : 'download-failed'));
        });
        child.once('close', async (code) => {
            if (settled)
                return;
            clearTimeout(timeoutTimer);
            clearInterval(sizeTimer);
            if (sizeCheckPromise)
                await sizeCheckPromise;
            await checkOutputSize();

            if (tooLarge) {
                finish(downloadError('too-large'));
            } else if (timedOut) {
                finish(downloadError('timeout'));
            } else if (code !== 0) {
                const requiresLogin = /login required|requiring login|private video|sign[- ]?in required|age[- ]?restricted/i.test(stderr);
                finish(downloadError(requiresLogin ? 'public-only' : 'download-failed'));
            } else {
                finish();
            }
        });
    });
}

export async function downloadTikTokVideo(url, options = {}) {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'aijai-tiktok-'));
    try {
        await runYtDlp(url, outputDir, options);
        const files = await readdir(outputDir);
        const videoFile = files.find((filename) => /\.mp4$/i.test(filename));
        if (!videoFile)
            throw downloadError('unsupported-format');

        const filePath = path.join(outputDir, videoFile);
        const fileInfo = await stat(filePath);
        if (!fileInfo.size || fileInfo.size > MAX_VIDEO_BYTES)
            throw downloadError(fileInfo.size > MAX_VIDEO_BYTES ? 'too-large' : 'download-failed');

        return await readFile(filePath);
    } finally {
        await rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
}

function publicFailureMessage(error) {
    switch (error?.code) {
        case 'too-large':
            return 'That TikTok video is too large to send (the limit is 32 MiB).';
        case 'timeout':
            return 'The TikTok download timed out. Try another public video link.';
        case 'public-only':
            return 'I can only fetch public TikTok videos that are accessible without signing in.';
        case 'downloader-missing':
            return 'TikTok downloads are temporarily unavailable because the downloader is not installed.';
        default:
            return 'I could not fetch that TikTok video. It may be private, unavailable, or blocked.';
    }
}

export async function handleTikTokLink(sock, message, url, {
    download = downloadTikTokVideo
} = {}) {
    const jid = message?.key?.remoteJid;
    const safeUrl = findTikTokUrl(url);
    if (!jid || !safeUrl)
        return false;

    const send = async (payload) => {
        try {
            await sock.sendMessage(jid, payload, { quoted: message });
        } catch {
            // WhatsApp send failures must not escape into the bot's message loop.
        }
    };

    if (downloadInProgress) {
        await send({ text: 'A TikTok download is already running. Try again in a moment.' });
        return true;
    }

    downloadInProgress = true;
    try {
        await send({ text: 'Fetching the public TikTok video…' });
        const video = await download(safeUrl);
        if (!Buffer.isBuffer(video) || video.length === 0)
            throw downloadError('download-failed');
        await send({ video, mimetype: 'video/mp4' });
    } catch (error) {
        await send({ text: publicFailureMessage(error) });
    } finally {
        downloadInProgress = false;
    }

    return true;
}
