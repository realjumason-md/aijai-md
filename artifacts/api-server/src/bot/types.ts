import type { proto, WASocket, WAMessage } from "@whiskeysockets/baileys";
import type { botConfig } from "./config";
import type { AiStateStore } from "./ai-state";

export type BotConfig = typeof botConfig;

export type CommandContext = {
  sock: WASocket;
  message: WAMessage;
  jid: string;
  senderJid: string;
  body: string;
  command: string;
  args: string[];
  prefix: string;
  quotedMessage?: proto.IMessage;
  receivedAt: number;
  startedAt: number;
  config: BotConfig;
  plugins: readonly BotPlugin[];
  aiState: AiStateStore;
  reply: (text: string) => Promise<void>;
};

export type BotPlugin = {
  name: string;
  aliases: readonly string[];
  description: string;
  usage: string;
  handler: (context: CommandContext) => Promise<void>;
};