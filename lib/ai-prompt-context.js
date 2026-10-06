const MAX_TEXT_HISTORY_CHARACTERS = 8_000;
const MAX_IMAGE_HISTORY_CHARACTERS = 4_000;
const MAX_HISTORY_IMAGES = 1;

function messageMetrics(message) {
    const content = message?.content;
    if (typeof content === 'string')
        return { characters: content.length, images: 0 };
    if (!Array.isArray(content))
        return { characters: 0, images: 0 };

    return content.reduce((metrics, part) => {
        if (part?.type === 'image_url')
            metrics.images += 1;
        else if (typeof part?.text === 'string')
            metrics.characters += part.text.length;
        return metrics;
    }, { characters: 0, images: 0 });
}

function historyMetrics(messages) {
    return messages.reduce((total, message) => {
        const metrics = messageMetrics(message);
        total.characters += metrics.characters;
        total.images += metrics.images;
        return total;
    }, { characters: 0, images: 0 });
}

export function trimPromptHistory(history, { hasCurrentImage = false } = {}) {
    const messages = Array.isArray(history)
        ? history.map((message) => ({ ...message }))
        : [];

    while (messages.length) {
        const metrics = historyMetrics(messages);
        const characterLimit = hasCurrentImage || metrics.images > 0
            ? MAX_IMAGE_HISTORY_CHARACTERS
            : MAX_TEXT_HISTORY_CHARACTERS;
        if (metrics.characters <= characterLimit && metrics.images <= MAX_HISTORY_IMAGES)
            break;

        // Conversation history is stored as user/assistant pairs. Dropping the
        // oldest pair preserves the newest context and any recent photo turn.
        messages.splice(0, Math.min(2, messages.length));
    }

    return messages;
}

export async function callWithPromptFallback(history, request) {
    let requestHistory = Array.isArray(history) ? [...history] : [];
    let includeExamples = true;

    while (true) {
        try {
            return await request(requestHistory, { includeExamples });
        }
        catch (error) {
            if (error?.status !== 413)
                throw error;
            if (requestHistory.length) {
                requestHistory = requestHistory.slice(Math.min(2, requestHistory.length));
                continue;
            }
            if (includeExamples) {
                includeExamples = false;
                continue;
            }
            throw error;
        }
    }
}
