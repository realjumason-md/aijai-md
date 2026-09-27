import type { proto, WAMessage } from "@whiskeysockets/baileys";

type MessageRecord = Record<string, any>;

export type ParsedCommand = {
  prefix: string;
  command: string;
  args: string[];
};

export function getMessageBody(message: WAMessage): string {
  const content = message.message as MessageRecord | null | undefined;
  if (!content) {
    return "";
  }

  return (
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    content.documentMessage?.caption ??
    content.documentWithCaptionMessage?.message?.documentMessage?.caption ??
    ""
  );
}

export function getQuotedMessage(
  message: WAMessage,
): proto.IMessage | undefined {
  const content = message.message as MessageRecord | null | undefined;
  return content?.extendedTextMessage?.contextInfo?.quotedMessage;
}

export function parseCommand(
  body: string,
  prefixes: readonly string[],
): ParsedCommand | undefined {
  const text = body.trim();
  const prefix = [...prefixes]
    .sort((left, right) => right.length - left.length)
    .find((candidate) => text.startsWith(candidate));

  if (!prefix) {
    return undefined;
  }

  const withoutPrefix = text.slice(prefix.length).trim();
  if (!withoutPrefix) {
    return undefined;
  }

  const [command = "", ...args] = withoutPrefix.split(/\s+/);
  return {
    prefix,
    command: command.toLowerCase(),
    args,
  };
}

export function getMessageJid(message: WAMessage): string | undefined {
  return message.key?.remoteJid ?? undefined;
}

export function getSenderJid(message: WAMessage): string {
  return message.key?.participant ?? message.key?.remoteJid ?? "";
}

export function getImageMessage(
  message: WAMessage | proto.IMessage,
): MessageRecord | undefined {
  const content = "message" in message ? message.message : message;
  const record = content as MessageRecord | null | undefined;
  return record?.imageMessage;
}

export function getQuotedViewOnceMessage(
  quotedMessage: proto.IMessage | undefined,
): { kind: "image" | "video"; message: MessageRecord } | undefined {
  const record = quotedMessage as MessageRecord | undefined;
  const viewOnce =
    record?.viewOnceMessage?.message ??
    record?.viewOnceMessageV2?.message ??
    record?.viewOnceMessageV2Extension?.message;

  if (viewOnce?.imageMessage) {
    return { kind: "image", message: viewOnce.imageMessage };
  }

  if (viewOnce?.videoMessage) {
    return { kind: "video", message: viewOnce.videoMessage };
  }

  return undefined;
}