import path from "node:path";

export type VisionProvider = "auto" | "groq" | "gemini" | "openai" | "xai" | "off";

function parsePrefixes(value: string | undefined): string[] {
  const fallback = [".", "!", "/", "£", "🇺🇬", "⛱️"];
  if (!value?.trim()) {
    return fallback;
  }

  const prefixes = value
    .split(",")
    .map((prefix) => prefix.trim())
    .filter(Boolean);

  return prefixes.length > 0 ? prefixes : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/\D/g, "");
}

const ownerNumber = normalizePhoneNumber(
  process.env["OWNER_NUMBER"] ?? "256706106326",
);

export const botConfig = {
  botName: process.env["BOT_NAME"] ?? "aijai-md",
  ownerName: process.env["OWNER_NAME"] ?? "Ali Jaiton",
  ownerNumber,
  pairingNumber: normalizePhoneNumber(
    process.env["PAIRING_NUMBER"] ?? ownerNumber,
  ),
  prefixes: parsePrefixes(process.env["PREFIXES"]),
  sessionDir: path.resolve(
    process.env["SESSION_DIR"] ?? path.join(process.cwd(), "session"),
  ),
  autoDescribeImages: parseBoolean(
    process.env["AUTO_DESCRIBE_IMAGES"],
    true,
  ),
  visionProvider: (process.env["VISION_PROVIDER"] ?? "auto").toLowerCase() as VisionProvider,
  visionModel: process.env["VISION_MODEL"],
  repositoryUrl: "https://github.com/realjumason-md/aijai-md",
} as const;