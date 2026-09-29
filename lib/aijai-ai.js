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
const supportedProviders = ['ollama', 'off'];
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
    return runtimeProvider || (String(config.aiProvider).toLowerCase() === 'off' ? 'off' : 'ollama');
}

function selectedProvider() {
    return configuredProvider() === 'off' ? undefined : 'ollama';
}

function modelFor(hasImages = false) {
    if (hasImages)
        return config.visionModel || process.env.OLLAMA_VISION_MODEL || process.env.OLLAMA_MODEL || 'qwen2.5vl:3b';
    return config.aiModel || process.env.OLLAMA_MODEL || 'llama3.2:3b';
}

function normalizeInput(input) {
    if (typeof input === 'string')
        return { text: input.trim(), images: [] };
    const text = String(input?.text || '').trim();
    const images = Array.isArray(input?.images)
        ? input.images
            .map((image) => typeof image === 'string' ? image : image?.data)
            .filter((image) => typeof image === 'string' && image.length > 0)
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
            throw new Error('That image is too large for the local vision model.');
        chunks.push(chunk);
    }
    if (!chunks.length)
        return [];
    return [{
        data: Buffer.concat(chunks).toString('base64'),
        mimeType: imageMessage.mimetype || 'image/jpeg'
    }];
}

async function ollamaReply(input) {
    const { text, images } = normalizeInput(input);
    if (!text && !images.length)
        throw new Error('Send a message or image for Ollama to answer.');
    const baseUrl = (config.ollamaBaseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS) || 120000),
        body: JSON.stringify({
            model: modelFor(images.length > 0),
            stream: false,
            keep_alive: '5m',
            options: {
                temperature: Number(process.env.OLLAMA_TEMPERATURE) || 0.8,
                num_predict: Number(process.env.OLLAMA_MAX_TOKENS) || 600
            },
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: text, ...(images.length ? { images } : {}) }
            ]
        })
    });
    if (!response.ok) {
        const details = (await response.text()).trim().slice(0, 240);
        throw new Error(`Ollama request failed with HTTP ${response.status}${details ? `: ${details}` : ''}. Start Ollama and pull the configured model.`);
    }
    const data = await response.json();
    const content = data.message?.content;
    if (typeof content !== 'string' || !content.trim())
        throw new Error('Ollama returned an empty reply.');
    return content.trim();
}

export function listAiProviders() {
    return [
        { name: 'ollama', ready: true, description: 'Local Ollama chat and vision model' }
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
        throw new Error('Unsupported AI provider. Choose ollama or off.');
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
        throw new Error('AI is switched off. Use .aiswitch ollama to enable it.');
    return ollamaReply(input);
}