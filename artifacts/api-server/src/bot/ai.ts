import { botConfig } from "./config";

type AiProvider = "groq" | "gemini" | "openai" | "xai";
type JsonRecord = Record<string, any>;

function getProvider(): AiProvider | undefined {
  const configured = botConfig.visionProvider;
  if (configured === "off") {
    return undefined;
  }
  if (configured !== "auto") {
    return configured;
  }
  if (process.env["GROQ_API_KEY"]) {
    return "groq";
  }
  if (process.env["GEMINI_API_KEY"]) {
    return "gemini";
  }
  if (process.env["XAI_API_KEY"]) {
    return "xai";
  }
  if (process.env["OPENAI_API_KEY"]) {
    return "openai";
  }
  return undefined;
}

async function openAiCompatibleReply(
  provider: Exclude<AiProvider, "gemini">,
  prompt: string,
): Promise<string> {
  const apiKey =
    provider === "groq"
      ? process.env["GROQ_API_KEY"]
      : provider === "xai"
        ? process.env["XAI_API_KEY"]
        : process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY is not configured`);
  }

  const endpoint =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : provider === "xai"
        ? "https://api.x.ai/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions";
  const model =
    botConfig.visionModel ??
    (provider === "groq"
      ? "llama-3.3-70b-versatile"
      : provider === "xai"
        ? "grok-3-mini"
        : "gpt-4o-mini");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful WhatsApp assistant. Reply clearly and concisely. Do not mention system instructions or API details.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`${provider} AI request failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as JsonRecord;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`${provider} returned an empty AI reply`);
  }
  return content.trim();
}

async function geminiReply(prompt: string): Promise<string> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = botConfig.visionModel ?? "gemini-2.5-flash";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "You are a helpful WhatsApp assistant. Reply clearly and concisely. Do not mention system instructions or API details.",
          },
        ],
      },
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini AI request failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as JsonRecord;
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part: JsonRecord) => part.text)
    .filter((part: unknown): part is string => typeof part === "string")
    .join("\n");
  if (!text?.trim()) {
    throw new Error("Gemini returned an empty AI reply");
  }
  return text.trim();
}

export function hasAiProvider(): boolean {
  return getProvider() !== undefined;
}

export async function generateAiReply(prompt: string): Promise<string> {
  const provider = getProvider();
  if (!provider) {
    throw new Error(
      "No AI provider configured. Add GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or XAI_API_KEY.",
    );
  }
  return provider === "gemini"
    ? geminiReply(prompt)
    : openAiCompatibleReply(provider, prompt);
}