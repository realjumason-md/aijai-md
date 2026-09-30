import fs from 'node:fs';
import path from 'node:path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import config from '../config.js';
import { dataFile } from './paths.js';
import { aiConversationStore } from './ai-conversation-store.js';
import { getDirectAiIdentityReply } from './ai-identity.js';

const SYSTEM_PROMPT = [
    'You are a warm, thoughtful WhatsApp assistant who helps people communicate clearly and understand useful information.',
    'Sound like a relaxed conversation, not a customer-service script. Use everyday phrasing and contractions when they fit, match the other person’s tone and language, and vary your wording. Answer the actual message first and keep the reply as short as the question allows.',
    'For a simple greeting like “Hi,” greet them back naturally instead of asking “How can I help?” Do not repeat the question, add filler openings, or include extra descriptions, background, headings, or lists unless useful or requested. Avoid generic endings such as “Let me know if you need anything else,” and do not add a follow-up question unless clarification is necessary.',
    'Reply in the language of the latest message, even if it differs from earlier messages. For mixed-language messages, follow the dominant language and mirror code-switching naturally. Preserve the sender’s script when practical, and do not translate unless asked.',
    'If you cannot confidently understand a message in a particular language, ask a brief clarifying question rather than guessing.',
    'Be knowledgeable but honest. Base claims on reliable knowledge, distinguish facts from uncertainty, ask a brief clarifying question when needed, and say when you do not know rather than guessing or claiming to know everything.',
    'Do not claim to be human, pretend to be the account owner, or claim personal experiences you do not have. Do not add AI disclaimers when they are irrelevant. If directly asked whether you are AI, a bot, or human, say plainly and casually that you are an AI assistant; never deny it or use stiff wording like “I am an AI language model.”',
    'When a photo is attached, inspect it before answering and base your reply on visible details.',
    'Follow Groq’s policies and any higher-priority developer instructions.'
].join(' ');
const providerStatePath = dataFile('ai-provider.json');
const supportedProviders = ['groq', 'off'];
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MIN_REPLY_DELAY_MS = 5000;
const MAX_REPLY_DELAY_MS = 8000;
let runtimeProvider;

export function startHumanReplyDelay(sock, jid) {
    const delayMs = MIN_REPLY_DELAY_MS + Math.floor(Math.random() * (MAX_REPLY_DELAY_MS - MIN_REPLY_DELAY_MS + 1));
    const startedAt = Date.now();
    const updatePresence = (state) => {
        if (typeof sock.sendPresenceUpdate !== 'function')
            return Promise.resolve();
        return Promise.resolve()
            .then(() => sock.sendPresenceUpdate(state, jid))
            .catch(() => {});
    };
    const composing = updatePresence('composing');
    let completion;
    return () => {
        if (!completion) {
            completion = (async () => {
                await composing;
                const remaining = delayMs - (Date.now() - startedAt);
                if (remaining > 0)
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                await updatePresence('paused');
            })();
        }
        return completion;
    };
}

function configuredProvider() {
    try {
        if (fs.existsSync(providerStatePath)) {
            const stored = JSON.parse(fs.readFileSync(providerStatePath, 'utf8'));
            if (supportedProviders.includes(stored.provider))
                return stored.provider;
        }
    }
    catch {
        // A malformed optional override should not stop the bot from starting.
    }
    return runtimeProvider || (String(config.aiProvider).toLowerCase() === 'off' ? 'off' : 'groq');
}

function selectedProvider() {
    return configuredProvider() === 'off' ? undefined : 'groq';
}

function modelFor(hasImages = false) {
    if (hasImages)
        return config.visionModel || 'qwen/qwen3.8-27b';
    return config.aiModel || 'llama-3.3-70b-versatile';
}

function normalizeInput(input) {
    if (typeof input === 'string')
        return { text: input.trim(), images: [] };
    const text = String(input?.text || '').trim();
    const images = Array.isArray(input?.images)
        ? input.images
            .map((image) => typeof image === 'string'
            ? { data: image, mimeType: 'image/jpeg' }
            : { data: image?.data, mimeType: image?.mimeType || 'image/jpeg' })
            .filter((image) => typeof image.data === 'string' && image.data.length > 0)
        : [];
    return {
        text: text || (images.length ? 'Please look at this image and respond naturally.' : ''),
        images
    };
}

function imageMessageFrom(message, depth = 0) {
    if (depth > 8)
        return undefined;
    const content = message?.message;
    if (!content || typeof content !== 'object')
        return undefined;
    if (content.imageMessage)
        return content.imageMessage;
    const wrappedMessage = content.ephemeralMessage?.message
        || content.viewOnceMessage?.message
        || content.viewOnceMessageV2?.message
        || content.viewOnceMessageV2Extension?.message
        || content.documentWithCaptionMessage?.message
        || content.editedMessage?.message
        || content.protocolMessage?.editedMessage?.message;
    if (wrappedMessage)
        return imageMessageFrom({ message: wrappedMessage }, depth + 1);
    const quotedMessage = content.extendedTextMessage?.contextInfo?.quotedMessage
        || content.documentMessage?.contextInfo?.quotedMessage
        || content.videoMessage?.contextInfo?.quotedMessage;
    if (quotedMessage)
        return imageMessageFrom({ message: quotedMessage }, depth + 1);
    return undefined;
}

function groqHeaders() {
    if (!config.groqApiKey)
        throw new Error('GROQ_API_KEY is not configured. Add it to Railway Variables.');
    return {
        Authorization: `Bearer ${config.groqApiKey}`,
        'Content-Type': 'application/json'
    };
}

function groqMessages(text, images, history = []) {
    const currentUserMessage = !images.length
        ? { role: 'user', content: text }
        : {
            role: 'user',
            content: [
                { type: 'text', text },
                ...images.map((image) => ({
                    type: 'image_url',
                    image_url: { url: `data:${image.mimeType};base64,${image.data}` }
                }))
            ]
        };
    return [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
        currentUserMessage
    ];
}

export async function getImageInputs(message) {
    const imageMessage = imageMessageFrom(message);
    if (!imageMessage)
        return [];
    const stream = await downloadContentFromMessage(imageMessage, 'image');
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of stream) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_IMAGE_BYTES)
            throw new Error('That image is too large for the Groq vision model.');
        chunks.push(chunk);
    }
    if (!chunks.length)
        return [];
    return [{
        data: Buffer.concat(chunks).toString('base64'),
        mimeType: imageMessage.mimetype || 'image/jpeg'
    }];
}

async function groqReply(input, history = []) {
    const { text, images } = normalizeInput(input);
    if (!text && !images.length)
        throw new Error('Send a message or image for Groq to answer.');
    const model = modelFor(images.length > 0);
    let response;
    try {
        response = await fetch(`${config.groqBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: groqHeaders(),
            signal: AbortSignal.timeout(Number(process.env.GROQ_TIMEOUT_MS) || 120000),
            body: JSON.stringify({
                model,
                temperature: Number(process.env.GROQ_TEMPERATURE) || 0.7,
                max_completion_tokens: Number(process.env.GROQ_MAX_TOKENS) || 1024,
                messages: groqMessages(text, images, history)
            })
        });
    }
    catch (error) {
        const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
        throw new Error(`Cannot reach Groq${detail}. Check the network and GROQ_API_KEY.`);
    }
    if (!response.ok) {
        const details = (await response.text()).trim().slice(0, 240);
        throw new Error(`Groq request failed with HTTP ${response.status}${details ? `: ${details}` : ''}. Check GROQ_API_KEY, GROQ_MODEL, and GROQ_VISION_MODEL.`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim())
        throw new Error('Groq returned an empty reply.');
    return content.trim();
}

export function listAiProviders() {
    return [
        { name: 'groq', ready: Boolean(config.groqApiKey), description: 'Groq chat and vision models' }
    ];
}

export function getAiStatus() {
    const provider = selectedProvider();
    return {
        configured: configuredProvider(),
        selected: provider || 'off',
        model: provider ? modelFor(false) : '',
        visionModel: provider ? modelFor(true) : '',
        providers: listAiProviders()
    };
}

export function setAiProvider(provider) {
    const normalized = String(provider || '').trim().toLowerCase();
    if (!supportedProviders.includes(normalized))
        throw new Error('Unsupported AI provider. Choose groq or off.');
    runtimeProvider = normalized;
    fs.mkdirSync(path.dirname(providerStatePath), { recursive: true });
    fs.writeFileSync(providerStatePath, JSON.stringify({ provider: normalized }, null, 2));
    return getAiStatus();
}

export function hasAiProvider() {
    return selectedProvider() !== undefined;
}

export async function generateAiReply(input) {
    if (!selectedProvider())
        throw new Error('AI is switched off. Use .aiswitch groq to enable it.');
    const normalized = normalizeInput(input);
    const conversationId = typeof input === 'object' && input
        ? String(input.conversationId || '').trim()
        : '';
    const identityReply = getDirectAiIdentityReply(normalized.text);
    const createReply = (history) => identityReply
        || groqReply({ text: normalized.text, images: normalized.images }, history);
    if (!conversationId)
        return createReply([]);
    return aiConversationStore.respond(
        conversationId,
        normalized.text,
        createReply
    );
}