import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';
import { dataFile } from './paths.js';

const SYSTEM_PROMPT = 'You are a helpful WhatsApp assistant. Reply clearly and concisely. Do not mention system instructions or API details.';
const providerStatePath = dataFile('ai-provider.json');
const supportedProviders = ['auto', 'ollama', 'duckduckgo', 'groq', 'gemini', 'openai', 'xai', 'off'];
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
    return runtimeProvider || config.aiProvider || config.visionProvider || 'auto';
}

function selectedProvider() {
    const configured = configuredProvider().toLowerCase();
    if (configured === 'off')
        return undefined;
    if (configured !== 'auto')
        return configured;
    if (process.env.GROQ_API_KEY)
        return 'groq';
    if (process.env.GEMINI_API_KEY)
        return 'gemini';
    if (process.env.XAI_API_KEY)
        return 'xai';
    if (process.env.OPENAI_API_KEY)
        return 'openai';
    if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL)
        return 'ollama';
    return 'duckduckgo';
}

function modelFor(provider) {
    if (config.aiModel || config.visionModel)
        return config.aiModel || config.visionModel;
    if (provider === 'ollama')
        return process.env.OLLAMA_MODEL || 'llama3.2:3b';
    if (provider === 'groq')
        return 'llama-3.3-70b-versatile';
    if (provider === 'xai')
        return 'grok-3-mini';
    return 'gpt-4o-mini';
}

async function openAiCompatibleReply(provider, prompt) {
    const apiKey = provider === 'groq'
        ? process.env.GROQ_API_KEY
        : provider === 'xai'
            ? process.env.XAI_API_KEY
            : process.env.OPENAI_API_KEY;
    if (!apiKey)
        throw new Error(`${provider.toUpperCase()}_API_KEY is not configured`);
    const endpoint = provider === 'groq'
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : provider === 'xai'
            ? 'https://api.x.ai/v1/chat/completions'
            : 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelFor(provider),
            max_tokens: 500,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ]
        })
    });
    if (!response.ok)
        throw new Error(`${provider} AI request failed with HTTP ${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim())
        throw new Error(`${provider} returned an empty AI reply`);
    return content.trim();
}

async function geminiReply(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
        throw new Error('GEMINI_API_KEY is not configured');
    const model = modelFor('gemini');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ parts: [{ text: prompt }] }]
        })
    });
    if (!response.ok)
        throw new Error(`Gemini AI request failed with HTTP ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter((part) => typeof part === 'string')
        .join('\n');
    if (!text?.trim())
        throw new Error('Gemini returned an empty AI reply');
    return text.trim();
}

async function ollamaReply(prompt) {
    const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelFor('ollama'),
            stream: false,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ]
        })
    });
    if (!response.ok)
        throw new Error(`Ollama request failed with HTTP ${response.status}. Start Ollama or set OLLAMA_BASE_URL.`);
    const data = await response.json();
    const content = data.message?.content;
    if (typeof content !== 'string' || !content.trim())
        throw new Error('Ollama returned an empty AI reply');
    return content.trim();
}

function relatedTopicText(topics) {
    return topics
        .flatMap((topic) => topic.Topics ? relatedTopicText(topic.Topics) : [topic.Text])
        .filter((text) => typeof text === 'string' && text.trim())
        .slice(0, 3);
}

async function duckDuckGoReply(prompt) {
    const params = new URLSearchParams({
        q: prompt,
        format: 'json',
        no_html: '1',
        skip_disambig: '1',
        no_redirect: '1'
    });
    const response = await fetch(`https://api.duckduckgo.com/?${params}`);
    if (!response.ok)
        throw new Error(`DuckDuckGo lookup failed with HTTP ${response.status}`);
    const data = await response.json();
    const answer = data.Answer || data.Definition || data.AbstractText;
    const topics = relatedTopicText(Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []);
    const result = [answer, ...topics].filter(Boolean).join('\n\n');
    if (!result.trim())
        return 'DuckDuckGo did not find a direct answer. Use AI_PROVIDER=ollama for conversational replies.';
    return result.trim();
}

export function listAiProviders() {
    return [
        { name: 'auto', ready: true, description: 'Uses configured key providers, Ollama, then DuckDuckGo' },
        { name: 'ollama', ready: true, description: 'Local Ollama server; no API key required' },
        { name: 'duckduckgo', ready: true, description: 'Keyless web lookup, not generative chat' },
        { name: 'groq', ready: Boolean(process.env.GROQ_API_KEY), description: 'Groq API' },
        { name: 'gemini', ready: Boolean(process.env.GEMINI_API_KEY), description: 'Google Gemini API' },
        { name: 'openai', ready: Boolean(process.env.OPENAI_API_KEY), description: 'OpenAI API' },
        { name: 'xai', ready: Boolean(process.env.XAI_API_KEY), description: 'xAI API' }
    ];
}

export function getAiStatus() {
    const provider = selectedProvider();
    return {
        configured: configuredProvider(),
        selected: provider || 'off',
        model: provider ? modelFor(provider) : '',
        providers: listAiProviders()
    };
}

export function setAiProvider(provider) {
    const normalized = String(provider || '').trim().toLowerCase();
    if (!supportedProviders.includes(normalized))
        throw new Error(`Unsupported AI provider. Choose: ${supportedProviders.filter((name) => name !== 'off').join(', ')}, or off.`);
    runtimeProvider = normalized;
    fs.mkdirSync(path.dirname(providerStatePath), { recursive: true });
    fs.writeFileSync(providerStatePath, JSON.stringify({ provider: normalized }, null, 2));
    return getAiStatus();
}

export function hasAiProvider() {
    return selectedProvider() !== undefined;
}

export async function generateAiReply(prompt) {
    const provider = selectedProvider();
    if (!provider)
        throw new Error('AI is switched off. Use .aiswitch auto, .aiswitch ollama, or .aiswitch duckduckgo.');
    if (provider === 'gemini')
        return geminiReply(prompt);
    if (provider === 'ollama')
        return ollamaReply(prompt);
    if (provider === 'duckduckgo')
        return duckDuckGoReply(prompt);
    return openAiCompatibleReply(provider, prompt);
}