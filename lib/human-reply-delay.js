const INITIAL_TYPING_PAUSE_MS = 5000;
const MIN_REPLY_DELAY_MS = 3000;
const MAX_REPLY_DELAY_MS = 12000;

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

export function startHumanReplyDelay(sock, jid, { wait = waitFor, random = Math.random } = {}) {
    const delayMs = MIN_REPLY_DELAY_MS
        + Math.floor(random() * (MAX_REPLY_DELAY_MS - MIN_REPLY_DELAY_MS + 1));
    let completion;

    return () => {
        if (!completion) {
            completion = (async () => {
                await wait(INITIAL_TYPING_PAUSE_MS);
                await updatePresence(sock, 'composing', jid);
                await wait(delayMs);
                await updatePresence(sock, 'paused', jid);
            })();
        }
        return completion;
    };
}