import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import type { proto, WAMessage } from "@whiskeysockets/baileys";
import { botConfig, type VisionProvider } from "./config";
import { getImageMessage } from "./message";

type ImagePayload = {
  buffer: Buffer;
  mimeType: string;
};

type JsonRecord = Record<string, any>;

async function streamToBuffer(
  stream: AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function downloadImage(
  message: WAMessage | proto.IMessage,
): Promise<ImagePayload | undefined> {
  const image = getImageMessage(message);
  if (!image) {
    return undefined;
  }

  const stream = await downloadContentFromMessage(image, "image");
  return {
    buffer: await streamToBuffer(stream),
    mimeType: image.mimetype ?? "image/jpeg",
  };
}

function selectedProvider(): Exclude<VisionProvider, "auto" | "off"> | undefined {
  if (botConfig.visionProvider === "off") {
    return undefined;
  }

  if (botConfig.visionProvider !== "auto") {
    return botConfig.visionProvider;
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

async function requestOpenAiCompatible(
  provider: "groq" | "openai" | "xai",
  payload: ImagePayload,
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

  const baseUrl =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : provider === "xai"
        ? "https://api.x.ai/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions";
  const model =
    botConfig.visionModel ??
    (provider === "groq"
      ? "meta-llama/llama-4-scout-17b-16e-instruct"
      : provider === "xai"
        ? "grok-2-vision-1212"
        : "gpt-4o-mini");

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this image clearly and briefly. Mention visible text, objects, people, setting, and important details. If there is no readable text, say so.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${payload.mimeType};base64,${payload.buffer.toString("base64")}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`${provider} vision request failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as JsonRecord;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`${provider} returned an empty image description`);
  }

  return content.trim();
}

async function requestGemini(payload: ImagePayload): Promise<string> {
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
      contents: [
        {
          parts: [
            {
              text: "Describe this image clearly and briefly. Mention visible text, objects, people, setting, and important details. If there is no readable text, say so.",
            },
            {
              inline_data: {
                mime_type: payload.mimeType,
                data: payload.buffer.toString("base64"),
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini vision request failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as JsonRecord;
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part: JsonRecord) => part.text)
    .filter((part: unknown): part is string => typeof part === "string")
    .join("\n");

  if (!text?.trim()) {
    throw new Error("Gemini returned an empty image description");
  }

  return text.trim();
}

export async function describeImage(
  message: WAMessage | proto.IMessage,
): Promise<string | undefined> {
  const payload = await downloadImage(message);
  if (!payload) {
    return undefined;
  }

  const provider = selectedProvider();
  if (!provider) {
    return undefined;
  }

  return provider === "gemini"
    ? requestGemini(payload)
    : requestOpenAiCompatible(provider, payload);
}

export function hasVisionProvider(): boolean {
  return selectedProvider() !== undefined;
}