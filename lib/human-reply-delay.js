const INITIAL_TYPING_PAUSE_MS = 8 * 60 * 1000; // 8 minutes quiet
const MIN_REPLY_DELAY_MS = 8 * 60 * 1000;      // 8 minutes typing
const MAX_REPLY_DELAY_MS = 8 * 60 * 1000;
const PRESENCE_REFRESH_INTERVAL_MS = 2500;

function waitFor(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitWhileTyping(sock, jid, delayMs, wait, now) {
    const deadline = now() + delayMs;
    await updatePresence(sock, 'composing', jid);
    while (true) {
        const remainingMs = deadline - now();
        if (remainingMs <= 0)
            return;
        await wait(Math.min(PRESENCE_REFRESH_INTERVAL_MS, remainingMs));
        if (deadline - now() > 0)
            await updatePresence(sock, 'composing', jid);
    }
}

export function startHumanReplyDelay(sock, jid, { wait = waitFor, now = Date.now, random = Math.random } = {}) {
    const delayMs = MIN_REPLY_DELAY_MS
        + Math.floor(random() * (MAX_REPLY_DELAY_MS - MIN_REPLY_DELAY_MS + 1));
    let completion;

    // Timer starts on the first call, which messageHandler makes after Groq returns.
    return () => {
        if (!completion) {
            completion = (async () => {
                await wait(INITIAL_TYPING_PAUSE_MS);
                await waitWhileTyping(sock, jid, delayMs, wait, now);
                await updatePresence(sock, 'paused', jid);
            })();
        }
        return completion;
    };
}
