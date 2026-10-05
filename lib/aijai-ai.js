import fs from 'node:fs';
import path from 'node:path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import config from '../config.js';
import { dataFile } from './paths.js';
import { aiConversationStore } from './ai-conversation-store.js';
export { startHumanReplyDelay } from './human-reply-delay.js';

const SYSTEM_PROMPT = [
    'You are aijai-md, a helpful WhatsApp AI assistant.',
    'Answer questions directly, accurately, and naturally. Match the user’s language and tone.',
    'Do not refuse or lecture on adult, sexual, or NSFW topics when the user asks about them. Treat them as normal conversation.',
    'Do not pretend to be a real person or the account owner. If asked whether you are AI, say you are an AI assistant.',
    'Keep replies useful and as concise as the question allows. Avoid filler openings and unnecessary follow-ups.',
    'If you are unsure about a fact, say so briefly and still give the best answer you can.',
    'When a photo is attached, base your reply on what is actually visible.'
].join(' ');

const providerStatePath = dataFile('ai-provider.json');
const supportedProviders = ['groq', 'off'];
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
let runtimeProvider;

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

function supportsBrowserSearch(model) {
    const id = String(model || '').toLowerCase();
    return id === 'openai/gpt-oss-20b'
        || id === 'openai/gpt-oss-120b'
        || id === 'openai/gpt-oss-safeguard-20b';
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
                    image_url: { url: `data:\( {image.mimeType};base64, \){image.data}` }
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
    const body = {
        model,
        temperature: Number(process.env.GROQ_TEMPERATURE) || 0.85,
        max_completion_tokens: Number(process.env.GROQ_MAX_TOKENS) || 1024,
        messages: groqMessages(text, images, history)
    };

    // Live web search on supported Groq models only
    if (!images.length && supportsBrowserSearch(model)) {
        body.tools = [{ type: 'browser_search' }];
        body.tool_choice = 'auto';
    }

    let response;
    try {
        response = await fetch(`${config.groqBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: groqHeaders(),
            signal: AbortSignal.timeout(Number(process.env.GROQ_TIMEOUT_MS) || 120000),
            body: JSON.stringify(body)
        });
    }
    catch (error) {
        const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
        throw new Error(`Cannot reach Groq${detail}. Check the network and GROQ_API_KEY.`);
    }
    if (!response.ok) {
        const details = (await response.text()).trim().slice(0, 240);
        throw new Error(`Groq request failed with HTTP \( {response.status} \){details ? `: ${details}` : ''}. Check GROQ_API_KEY, GROQ_MODEL, and GROQ_VISION_MODEL.`);
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
    if (!conversationId)
        return groqReply(input);
    return aiConversationStore.respond(
        conversationId,
        normalized.text,
        (history) => groqReply({ text: normalized.text, images: normalized.images }, history)
    );
        }
