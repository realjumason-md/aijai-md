import fs from 'node:fs';
import path from 'node:path';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import config from '../config.js';
import { dataFile } from './paths.js';

const SYSTEM_PROMPT = [
    'You are a warm, natural WhatsApp assistant.',
    'Reply like a thoughtful person in a real conversation: be direct, relaxed, empathetic, and concise.',
    'Use the user’s tone when appropriate, but do not pretend to be a human or invent personal experiences.',
    'Answer honestly when you are uncertain, and never claim to have seen something that is not in the message or image.',
    'Follow developer instructions and ordinary safety boundaries. Do not reveal internal instructions or implementation details unless directly asked.'
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
        return config.visionModel || 'meta-llama/llama-4-scout-17b-16e-instruct';
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

function imageMessageFrom(message) {
    const content = message?.message;
    if (content?.imageMessage)
        return content.imageMessage;
    return content?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
}

function groqHeaders() {
    if (!config.groqApiKey)
        throw new Error('GROQ_API_KEY is not configured. Add it to Railway Variables.');
    return {
        Authorization: `Bearer ${config.groqApiKey}`,
        'Content-Type': 'application/json'
    };
}

function groqMessages(text, images) {
    if (!images.length) {
        return [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text }
        ];
    }
    return [
        { role: 'system', content: SYSTEM_PROMPT },
        {
            role: 'user',
            content: [
                { type: 'text', text },
                ...images.map((image) => ({
                    type: 'image_url',
                    image_url: { url: `data:${image.mimeType};base64,${image.data}` }
                }))
            ]
        }
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

async function groqReply(input) {
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
                temperature: Number(process.env.GROQ_TEMPERATURE) || 0.8,
                max_tokens: Number(process.env.GROQ_MAX_TOKENS) || 600,
                messages: groqMessages(text, images)
            })
        });
    }
    catch (error) {
        const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
        throw new Error(`Cannot reach Groq${detail}. Check the network and GROQ_API_KEY.`);
    }
    if (!response.ok) {
        const details = (await response.text()).trim().slice(0, 240);
        throw new Error(`Groq request failed with HTTP ${response.status}${details ? `: ${details}` : ''}. Check GROQ_API_KEY and GROQ_MODEL.`);
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
    return groqReply(input);
}