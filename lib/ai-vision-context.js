const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_FOLLOW_UPS = 5;
const DEFAULT_MAX_CONVERSATIONS = 24;
const DEFAULT_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_HISTORY_MESSAGE_CHARACTERS = 8_000;

function decodedBase64Bytes(data) {
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor(data.length * 3 / 4) - padding);
}

export class AiVisionContext {
    constructor({
        ttlMs = DEFAULT_TTL_MS,
        maxFollowUps = DEFAULT_MAX_FOLLOW_UPS,
        maxConversations = DEFAULT_MAX_CONVERSATIONS,
        maxImageBytes = DEFAULT_MAX_IMAGE_BYTES
    } = {}) {
        this.ttlMs = ttlMs;
        this.maxFollowUps = maxFollowUps;
        this.maxConversations = maxConversations;
        this.maxImageBytes = maxImageBytes;
        this.entries = new Map();
    }

    remember(conversationId, { images, userText, assistantText }, now = Date.now()) {
        const id = String(conversationId || '').trim();
        const image = Array.isArray(images) ? images[images.length - 1] : undefined;
        if (!id || typeof image?.data !== 'string' || !image.data) {
            this.clear(id);
            return false;
        }
        if (decodedBase64Bytes(image.data) > this.maxImageBytes) {
            this.clear(id);
            return false;
        }

        this.clear(id);
        this.entries.set(id, {
            image: {
                data: image.data,
                mimeType: image.mimeType || 'image/jpeg'
            },
            userText: String(userText || '').slice(0, MAX_HISTORY_MESSAGE_CHARACTERS),
            assistantText: String(assistantText || '').slice(0, MAX_HISTORY_MESSAGE_CHARACTERS),
            expiresAt: now + this.ttlMs,
            remainingFollowUps: this.maxFollowUps
        });

        while (this.entries.size > this.maxConversations)
            this.entries.delete(this.entries.keys().next().value);
        return true;
    }

    attach(conversationId, history, now = Date.now()) {
        const id = String(conversationId || '').trim();
        const messages = Array.isArray(history) ? history : [];
        const entry = this.entries.get(id);
        if (!entry)
            return { history: messages, attached: false };
        if (entry.expiresAt <= now || entry.remainingFollowUps <= 0) {
            this.clear(id);
            return { history: messages, attached: false };
        }

        let userIndex = -1;
        for (let index = messages.length - 2; index >= 0; index -= 1) {
            const userMessage = messages[index];
            const assistantMessage = messages[index + 1];
            if (userMessage?.role === 'user'
                && assistantMessage?.role === 'assistant'
                && typeof userMessage.content === 'string'
                && typeof assistantMessage.content === 'string'
                && userMessage.content === entry.userText.slice(0, userMessage.content.length)
                && assistantMessage.content === entry.assistantText.slice(0, assistantMessage.content.length)) {
                userIndex = index;
                break;
            }
        }

        if (userIndex === -1) {
            this.clear(id);
            return { history: messages, attached: false };
        }

        const updatedHistory = messages.map((message) => ({ ...message }));
        updatedHistory[userIndex] = {
            role: 'user',
            content: [
                { type: 'text', text: entry.userText },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:${entry.image.mimeType};base64,${entry.image.data}`
                    }
                }
            ]
        };

        return { history: updatedHistory, attached: true };
    }

    consume(conversationId) {
        const id = String(conversationId || '').trim();
        const entry = this.entries.get(id);
        if (!entry)
            return;

        entry.remainingFollowUps -= 1;
        this.clear(id);
        if (entry.remainingFollowUps > 0)
            this.entries.set(id, entry);
    }

    clear(conversationId) {
        const id = String(conversationId || '').trim();
        if (id)
            this.entries.delete(id);
    }
}
