const WORD_PATTERN = /\S+/gu;
const NATURAL_BOUNDARY_PATTERN = /[.!?]+(?:["'’”)\]]*)?(?=\s|$)|\n+/gu;
const MIN_TYPING_DELAY_MS = 7000;
const MAX_TYPING_DELAY_MS = 8000;
const PRESENCE_REFRESH_INTERVAL_MS = 2500;

function countWords(text) {
    return text.match(WORD_PATTERN)?.length || 0;
}

function findCutIndex(text, targetWords, minWords, maxWords) {
    const words = [...text.matchAll(WORD_PATTERN)];
    let closestBoundary;
    let closestDistance = Infinity;

    for (const match of text.matchAll(NATURAL_BOUNDARY_PATTERN)) {
        const cutIndex = match.index + match[0].length;
        const wordsBefore = countWords(text.slice(0, cutIndex));
        if (wordsBefore < minWords || wordsBefore > maxWords)
            continue;

        const distance = Math.abs(wordsBefore - targetWords);
        if (distance < closestDistance) {
            closestBoundary = cutIndex;
            closestDistance = distance;
        }
    }

    if (closestBoundary !== undefined)
        return closestBoundary;

    const fallbackTarget = Math.min(maxWords, Math.max(minWords, targetWords));
    const fallbackWord = words[fallbackTarget - 1];
    return fallbackWord.index + fallbackWord[0].length;
}

export function splitAiReply(reply) {
    const text = String(reply || '').trim();
    const totalWords = countWords(text);
    if (!text)
        return [];
    if (totalWords <= 30)
        return [text];

    const partCount = Math.ceil(totalWords / 30);
    const parts = [];
    let remaining = text;
    let remainingWords = totalWords;

    for (let partIndex = 0; partIndex < partCount - 1; partIndex += 1) {
        const remainingParts = partCount - partIndex;
        const targetWords = Math.ceil(remainingWords / remainingParts);
        const minWords = Math.max(1, remainingWords - ((remainingParts - 1) * 30));
        const maxWords = Math.min(30, remainingWords - (remainingParts - 1));
        const cutIndex = findCutIndex(remaining, targetWords, minWords, maxWords);
        parts.push(remaining.slice(0, cutIndex).trim());
        remaining = remaining.slice(cutIndex).trim();
        remainingWords = countWords(remaining);
    }

    if (remaining)
        parts.push(remaining);
    return parts;
}

function waitFor(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function typingDelayFor() {
    return MIN_TYPING_DELAY_MS
        + Math.floor(Math.random() * (MAX_TYPING_DELAY_MS - MIN_TYPING_DELAY_MS + 1));
}

async function waitWhileTyping(sock, jid, delayMs, wait, now) {
    const deadline = now() + delayMs;
    while (true) {
        const remainingMs = deadline - now();
        if (remainingMs <= 0)
            return;

        await wait(Math.min(PRESENCE_REFRESH_INTERVAL_MS, remainingMs));
        if (deadline - now() > 0)
            await updatePresence(sock, 'composing', jid);
    }
}

async function updatePresence(sock, state, jid) {
    if (typeof sock.sendPresenceUpdate !== 'function')
        return;
    try {
        await sock.sendPresenceUpdate(state, jid);
    } catch {
        // Presence is best-effort; sending the reply is the important operation.
    }
}

export async function sendAiReplyInParts(sock, jid, reply, sendPart, { wait = waitFor, now = Date.now } = {}) {
    if (typeof sendPart !== 'function')
        throw new TypeError('sendPart must be a function.');

    const parts = splitAiReply(reply);
    try {
        for (let index = 0; index < parts.length; index += 1) {
            if (index > 0) {
                await updatePresence(sock, 'composing', jid);
                await waitWhileTyping(sock, jid, typingDelayFor(), wait, now);
            }
            await sendPart(parts[index], index);
        }
    } finally {
        if (parts.length > 1)
            await updatePresence(sock, 'paused', jid);
    }
    return parts;
}

export async function sendAutomaticAiReply(sock, jid, reply, sendPart, options) {
    if (typeof sendPart !== 'function')
        throw new TypeError('sendPart must be a function.');

    const parts = splitAiReply(reply);
    if (parts.length <= 1) {
        if (parts.length === 1)
            await sendPart(parts[0], 0);
        return parts;
    }

    return sendAiReplyInParts(sock, jid, reply, sendPart, options);
}