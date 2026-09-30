import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dataFile } from './paths.js';

const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARACTERS = 24_000;
const MAX_MESSAGE_CHARACTERS = 8_000;
const MAX_CONVERSATIONS = 500;

function normalizeMessage(message, role) {
    if (message?.role !== role || typeof message.content !== 'string')
        return undefined;
    return {
        role,
        content: message.content.slice(0, MAX_MESSAGE_CHARACTERS)
    };
}

function trimHistory(messages) {
    const trimmed = [];
    for (let index = 0; index + 1 < messages.length; index += 2) {
        const userMessage = normalizeMessage(messages[index], 'user');
        const assistantMessage = normalizeMessage(messages[index + 1], 'assistant');
        if (userMessage && assistantMessage)
            trimmed.push(userMessage, assistantMessage);
    }

    const characterCount = () => trimmed.reduce((total, message) => total + message.content.length, 0);
    while (trimmed.length > MAX_HISTORY_MESSAGES || characterCount() > MAX_HISTORY_CHARACTERS)
        trimmed.splice(0, 2);
    return trimmed;
}

export class AiConversationStore {
    constructor(filePath = dataFile('ai-conversations.json')) {
        this.filePath = filePath;
        this.histories = new Map();
        this.conversationQueues = new Map();
        this.loadPromise = undefined;
        this.writeQueue = Promise.resolve();
    }

    async loadFromDisk() {
        try {
            const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                throw new Error('The history file must contain a JSON object.');

            for (const [conversationId, messages] of Object.entries(parsed)) {
                if (conversationId && Array.isArray(messages)) {
                    const history = trimHistory(messages);
                    if (history.length)
                        this.histories.set(conversationId, history);
                }
            }
            while (this.histories.size > MAX_CONVERSATIONS)
                this.histories.delete(this.histories.keys().next().value);
        }
        catch (error) {
            if (error?.code === 'ENOENT')
                return;
            throw new Error(`Could not load AI conversation history: ${error.message}`, { cause: error });
        }
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

    async respond(conversationId, userText, createReply) {
        const id = String(conversationId || '').trim();
        if (!id)
            return createReply([]);

        const previous = this.conversationQueues.get(id) || Promise.resolve();
        const current = previous.catch(() => {}).then(async () => {
            await this.load();
            const history = this.histories.get(id) || [];
            const reply = await createReply(history.map((message) => ({ ...message })));
            if (typeof reply !== 'string' || !reply.trim())
                throw new Error('AI returned an empty reply; conversation history was not saved.');

            const updatedHistory = trimHistory([
                ...history,
                { role: 'user', content: String(userText || '') },
                { role: 'assistant', content: reply }
            ]);
            this.histories.delete(id);
            this.histories.set(id, updatedHistory);
            while (this.histories.size > MAX_CONVERSATIONS)
                this.histories.delete(this.histories.keys().next().value);
            await this.persist();
            return reply;
        });

        this.conversationQueues.set(id, current);
        try {
            return await current;
        }
        finally {
            if (this.conversationQueues.get(id) === current)
                this.conversationQueues.delete(id);
        }
    }

    persist() {
        this.writeQueue = this.writeQueue.catch(() => {}).then(async () => {
            const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
            await mkdir(path.dirname(this.filePath), { recursive: true });
            try {
                await writeFile(
                    temporaryPath,
                    JSON.stringify(Object.fromEntries(this.histories), null, 2),
                    { encoding: 'utf8', mode: 0o600 }
                );
                await rename(temporaryPath, this.filePath);
            }
            catch (error) {
                await unlink(temporaryPath).catch(() => {});
                throw new Error(`Could not save AI conversation history: ${error.message}`, { cause: error });
            }
        });
        return this.writeQueue;
    }
}

export const aiConversationStore = new AiConversationStore();