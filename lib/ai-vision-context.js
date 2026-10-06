import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dataFile } from './paths.js';

const INDEX_VERSION = 1;
const DEFAULT_MAX_STORAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 500;
const MAX_TURN_HASH_CHARACTERS = 8_000;
const CONVERSATION_KEY_PATTERN = /^[a-f0-9]{64}$/;
const TURN_KEY_PATTERN = /^[a-f0-9]{64}$/;
const PHOTO_FILE_PATTERN = /^[a-f0-9]{64}-[a-f0-9-]{36}\.img$/;

function hash(value) {
    return createHash('sha256').update(value).digest('hex');
}

function hashTurn(userText, assistantText) {
    const normalizedUserText = String(userText || '').slice(0, MAX_TURN_HASH_CHARACTERS);
    const normalizedAssistantText = String(assistantText || '').slice(0, MAX_TURN_HASH_CHARACTERS);
    return hash(`${normalizedUserText}\0${normalizedAssistantText}`);
}

function isImageMimeType(mimeType) {
    return typeof mimeType === 'string' && /^image\/[a-z0-9.+-]+$/i.test(mimeType);
}

function entryIsValid(entry) {
    return Boolean(
        entry
        && typeof entry === 'object'
        && CONVERSATION_KEY_PATTERN.test(entry.conversationKey)
        && TURN_KEY_PATTERN.test(entry.turnKey)
        && PHOTO_FILE_PATTERN.test(entry.fileName)
        && entry.fileName.startsWith(`${entry.conversationKey}-`)
        && isImageMimeType(entry.mimeType)
        && Number.isSafeInteger(entry.byteLength)
        && entry.byteLength > 0
        && Number.isFinite(entry.savedAt)
    );
}

function trimEntries(entries, maxStorageBytes, maxEntries) {
    let totalBytes = [...entries.values()]
        .reduce((total, entry) => total + entry.byteLength, 0);

    while (entries.size > maxEntries || totalBytes > maxStorageBytes) {
        const oldestKey = entries.keys().next().value;
        if (!oldestKey)
            break;
        const oldestEntry = entries.get(oldestKey);
        entries.delete(oldestKey);
        totalBytes -= oldestEntry.byteLength;
    }
}

export class AiVisionContext {
    constructor({
        directory = dataFile('ai-vision-memory'),
        maxStorageBytes = DEFAULT_MAX_STORAGE_BYTES,
        maxEntries = DEFAULT_MAX_ENTRIES
    } = {}) {
        this.directory = directory;
        this.photosDirectory = path.join(directory, 'photos');
        this.indexPath = path.join(directory, 'index.json');
        this.maxStorageBytes = Math.max(1, Math.floor(Number(maxStorageBytes) || DEFAULT_MAX_STORAGE_BYTES));
        this.maxEntries = Math.max(1, Math.floor(Number(maxEntries) || DEFAULT_MAX_ENTRIES));
        this.entries = new Map();
        this.loadPromise = undefined;
        this.writeQueue = Promise.resolve();
    }

    load() {
        if (!this.loadPromise) {
            this.loadPromise = this.loadFromDisk().catch((error) => {
                this.loadPromise = undefined;
                throw error;
            });
        }
        return this.loadPromise;
    }

    async loadFromDisk() {
        await mkdir(this.photosDirectory, { recursive: true, mode: 0o700 });

        let parsed;
        try {
            parsed = JSON.parse(await readFile(this.indexPath, 'utf8'));
        }
        catch (error) {
            if (error?.code === 'ENOENT') {
                this.entries = new Map();
                await this.removeOrphanPhotos();
                return;
            }
            throw new Error(`Could not load saved AI photo context: ${error.message}`, { cause: error });
        }

        if (!parsed || parsed.version !== INDEX_VERSION || !Array.isArray(parsed.entries))
            throw new Error('Could not load saved AI photo context: the index format is invalid.');

        const validEntries = [];
        for (const candidate of parsed.entries) {
            if (!entryIsValid(candidate) || candidate.byteLength > this.maxStorageBytes)
                continue;

            let fileStats;
            try {
                fileStats = await stat(path.join(this.photosDirectory, candidate.fileName));
            }
            catch (error) {
                if (error?.code === 'ENOENT')
                    continue;
                throw new Error(`Could not check a saved AI photo: ${error.message}`, { cause: error });
            }
            if (!fileStats.isFile() || fileStats.size <= 0 || fileStats.size > this.maxStorageBytes)
                continue;

            validEntries.push({ ...candidate, byteLength: fileStats.size });
        }

        validEntries.sort((left, right) => left.savedAt - right.savedAt);
        const loadedEntries = new Map();
        for (const entry of validEntries) {
            loadedEntries.set(entry.fileName, entry);
        }
        trimEntries(loadedEntries, this.maxStorageBytes, this.maxEntries);
        this.entries = loadedEntries;
        await this.persistEntries(this.entries);
        await this.removeOrphanPhotos();
    }

    serialize(operation) {
        const current = this.writeQueue.catch(() => {}).then(operation);
        this.writeQueue = current.catch(() => {});
        return current;
    }

    async persistEntries(entries) {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const temporaryPath = `${this.indexPath}.${process.pid}.${randomUUID()}.tmp`;
        const contents = JSON.stringify({
            version: INDEX_VERSION,
            entries: [...entries.values()]
        });
        try {
            await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 });
            await rename(temporaryPath, this.indexPath);
        }
        catch (error) {
            await unlink(temporaryPath).catch(() => {});
            throw new Error(`Could not save AI photo context index: ${error.message}`, { cause: error });
        }
    }

    async removeOrphanPhotos() {
        const referencedFiles = new Set([...this.entries.values()].map((entry) => entry.fileName));
        const files = await readdir(this.photosDirectory, { withFileTypes: true });
        for (const file of files) {
            if (file.isFile() && !referencedFiles.has(file.name))
                await unlink(path.join(this.photosDirectory, file.name)).catch((error) => {
                    if (error?.code !== 'ENOENT')
                        console.error(`Could not remove an unused AI photo file: ${error.message}`);
                });
        }
    }

    async removeEntries(fileNames) {
        const updatedEntries = new Map(this.entries);
        for (const fileName of fileNames)
            updatedEntries.delete(fileName);
        if (updatedEntries.size === this.entries.size)
            return false;
        await this.persistEntries(updatedEntries);
        this.entries = updatedEntries;
        await this.removeOrphanPhotos();
        return true;
    }

    async removeEntry(fileName) {
        return this.removeEntries([fileName]);
    }

    async remember(conversationId, { images, userText, assistantText } = {}) {
        await this.load();
        const id = String(conversationId || '').trim();
        if (!id)
            return false;

        return this.serialize(async () => {
            const conversationKey = hash(id);
            const image = Array.isArray(images) ? images[images.length - 1] : undefined;
            const imageBytes = typeof image?.data === 'string'
                ? Buffer.from(image.data, 'base64')
                : Buffer.alloc(0);
            if (!imageBytes.length || imageBytes.length > this.maxStorageBytes) {
                return false;
            }

            const photoId = randomUUID();
            const fileName = `${conversationKey}-${photoId}.img`;
            const imagePath = path.join(this.photosDirectory, fileName);
            const temporaryImagePath = `${imagePath}.tmp`;
            const mimeType = isImageMimeType(image.mimeType)
                ? image.mimeType
                : 'image/jpeg';
            const entry = {
                conversationKey,
                turnKey: hashTurn(userText, assistantText),
                fileName,
                mimeType,
                byteLength: imageBytes.length,
                savedAt: Date.now()
            };

            await mkdir(this.photosDirectory, { recursive: true, mode: 0o700 });
            try {
                await writeFile(temporaryImagePath, imageBytes, { mode: 0o600 });
                await rename(temporaryImagePath, imagePath);
            }
            catch (error) {
                await unlink(temporaryImagePath).catch(() => {});
                throw new Error(`Could not save AI photo context: ${error.message}`, { cause: error });
            }

            const updatedEntries = new Map(this.entries);
            updatedEntries.set(fileName, entry);
            trimEntries(updatedEntries, this.maxStorageBytes, this.maxEntries);
            try {
                await this.persistEntries(updatedEntries);
            }
            catch (error) {
                await unlink(imagePath).catch(() => {});
                throw error;
            }

            this.entries = updatedEntries;
            await this.removeOrphanPhotos();
            return true;
        });
    }

    async attach(conversationId, history) {
        await this.load();
        const id = String(conversationId || '').trim();
        const messages = Array.isArray(history) ? history : [];
        if (!id)
            return { history: messages, images: [], attached: false };

        return this.serialize(async () => {
            const conversationKey = hash(id);
            const entries = [...this.entries.values()]
                .filter((entry) => entry.conversationKey === conversationKey);
            if (!entries.length)
                return { history: messages, images: [], attached: false };

            const updatedHistory = messages.map((message) => ({ ...message }));
            const fallbackImages = [];
            const staleEntries = [];
            for (let photoIndex = 0; photoIndex < entries.length; photoIndex += 1) {
                const entry = entries[photoIndex];
                let imageBytes;
                try {
                    imageBytes = await readFile(path.join(this.photosDirectory, entry.fileName));
                }
                catch (error) {
                    if (error?.code !== 'ENOENT')
                        throw new Error(`Could not read saved AI photo context: ${error.message}`, { cause: error });
                    staleEntries.push(entry.fileName);
                    continue;
                }
                if (!imageBytes.length || imageBytes.length !== entry.byteLength) {
                    staleEntries.push(entry.fileName);
                    continue;
                }

                let userIndex = -1;
                for (let index = messages.length - 2; index >= 0; index -= 1) {
                    const userMessage = messages[index];
                    const assistantMessage = messages[index + 1];
                    if (userMessage?.role === 'user'
                        && assistantMessage?.role === 'assistant'
                        && typeof userMessage.content === 'string'
                        && typeof assistantMessage.content === 'string'
                        && hashTurn(userMessage.content, assistantMessage.content) === entry.turnKey) {
                        userIndex = index;
                        break;
                    }
                }

                const image = {
                    data: imageBytes.toString('base64'),
                    mimeType: entry.mimeType
                };
                if (userIndex === -1) {
                    fallbackImages.push({
                        ...image,
                        contextText: `Earlier saved photo ${photoIndex + 1} of ${entries.length} from this chat.`
                    });
                    continue;
                }

                const previousContent = updatedHistory[userIndex].content;
                const content = Array.isArray(previousContent)
                    ? previousContent
                    : [{ type: 'text', text: previousContent }];
                updatedHistory[userIndex] = {
                    role: 'user',
                    content: [
                        ...content,
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${entry.mimeType};base64,${image.data}`
                            }
                        }
                    ]
                };
            }
            if (staleEntries.length)
                await this.removeEntries(staleEntries);

            const attached = fallbackImages.length > 0
                || entries.some((entry) => updatedHistory.some((message) => Array.isArray(message.content)
                    && message.content.some((part) => part?.type === 'image_url')));
            return {
                history: updatedHistory,
                images: fallbackImages,
                attached
            };
        });
    }

    async clear(conversationId) {
        await this.load();
        const id = String(conversationId || '').trim();
        if (!id)
            return false;
        const conversationKey = hash(id);
        return this.serialize(() => this.removeEntries(
            [...this.entries.values()]
                .filter((entry) => entry.conversationKey === conversationKey)
                .map((entry) => entry.fileName)
        ));
    }
}
