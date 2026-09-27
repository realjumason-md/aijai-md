import makeWASocket, {
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { logger } from "../lib/logger";
import { botConfig } from "./config";
import {
  getImageMessage,
  getMessageBody,
  getMessageJid,
  getQuotedMessage,
  getSenderJid,
  parseCommand,
} from "./message";
import { findPlugin, plugins } from "./plugins";
import { describeImage, hasVisionProvider } from "./vision";

const baileysLogger = pino({ level: "silent" });

function connectionStatusCode(error: unknown): number | undefined {
  const candidate = error as { output?: { statusCode?: number } } | undefined;
  return candidate?.output?.statusCode;
}

function formatReconnectDelay(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.min(attempt, 4));
}

class WhatsAppBot {
  private socket: WASocket | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnectAttempt = 0;
  private connecting = false;
  private stopped = false;
  private pairingRequested = false;

  async start(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting) {
      return;
    }

    this.connecting = true;
    try {
      const { state, saveCreds } = await useMultiFileAuthState(
        botConfig.sessionDir,
      );
      const socket = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
        },
        browser: Browsers.ubuntu("Chrome"),
        logger: baileysLogger,
        markOnlineOnConnect: false,
        printQRInTerminal: false,
        syncFullHistory: false,
      });

      this.socket = socket;
      this.pairingRequested = state.creds.registered;
      socket.ev.on("creds.update", saveCreds);
      socket.ev.on("connection.update", (update) => {
        void this.handleConnectionUpdate(update, socket, state.creds.registered);
      });
      socket.ev.on("messages.upsert", (event) => {
        if (event.type !== "notify") {
          return;
        }
        for (const message of event.messages) {
          void this.handleMessage(message);
        }
      });
    } finally {
      this.connecting = false;
    }
  }

  private async handleConnectionUpdate(
    update: {
      connection?: "close" | "connecting" | "open";
      lastDisconnect?: { error?: unknown };
    },
    socket: WASocket,
    wasRegistered: boolean,
  ): Promise<void> {
    if (update.connection === "open") {
      this.reconnectAttempt = 0;
      logger.info(
        { botName: botConfig.botName, sessionDir: botConfig.sessionDir },
        "WhatsApp bot connected",
      );
      return;
    }

    if (
      !wasRegistered &&
      !this.pairingRequested &&
      (update.connection === "connecting" || update.connection === undefined)
    ) {
      this.pairingRequested = true;
      setTimeout(() => {
        void this.requestPairingCode(socket);
      }, 1_500);
    }

    if (update.connection !== "close") {
      return;
    }

    const statusCode = connectionStatusCode(update.lastDisconnect?.error);
    if (statusCode === DisconnectReason.loggedOut) {
      logger.error(
        "WhatsApp session was logged out. Delete the session folder and pair again.",
      );
      return;
    }

    const delay = formatReconnectDelay(this.reconnectAttempt++);
    logger.warn({ delay, statusCode }, "WhatsApp connection closed; reconnecting");
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.connect().catch((error: unknown) => {
        logger.error({ err: error }, "WhatsApp reconnect failed");
      });
    }, delay);
  }

  private async requestPairingCode(socket: WASocket): Promise<void> {
    if (!botConfig.pairingNumber) {
      logger.error("PAIRING_NUMBER is missing; cannot request a pairing code");
      return;
    }

    try {
      const code = await socket.requestPairingCode(botConfig.pairingNumber);
      logger.info(
        { pairingCode: code },
        "WHATSAPP PAIRING CODE — enter this code on your phone",
      );
    } catch (error) {
      this.pairingRequested = false;
      logger.error({ err: error }, "Could not request WhatsApp pairing code");
    }
  }

  private async handleMessage(message: WAMessage): Promise<void> {
    if (message.key.fromMe || message.key.remoteJid === "status@broadcast") {
      return;
    }

    const jid = getMessageJid(message);
    if (!jid) {
      return;
    }

    const body = getMessageBody(message);
    const parsed = parseCommand(body, botConfig.prefixes);
    const imageMessage = getImageMessage(message);

    if (!parsed) {
      if (imageMessage && botConfig.autoDescribeImages) {
        await this.handleImage(message, jid);
      }
      return;
    }

    const plugin = findPlugin(parsed.command);
    if (!plugin) {
      return;
    }

    const context = {
      sock: this.socket ?? (undefined as never),
      message,
      jid,
      senderJid: getSenderJid(message),
      body,
      command: parsed.command,
      args: parsed.args,
      prefix: parsed.prefix,
      quotedMessage: getQuotedMessage(message),
      receivedAt: Date.now(),
      startedAt: Date.now(),
      config: botConfig,
      plugins,
      reply: async (text: string) => {
        await this.socket?.sendMessage(jid, { text }, { quoted: message });
      },
    };

    try {
      await plugin.handler(context);
    } catch (error) {
      logger.error(
        { err: error, command: parsed.command, jid },
        "WhatsApp command failed",
      );
      await context.reply("Something went wrong while running that command.");
    }
  }

  private async handleImage(
    message: WAMessage,
    jid: string,
  ): Promise<void> {
    if (!hasVisionProvider()) {
      await this.socket?.sendMessage(
        jid,
        {
          text: "Image received. Add GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or XAI_API_KEY to enable image understanding.",
        },
        { quoted: message },
      );
      return;
    }

    try {
      const description = await describeImage(message);
      if (description) {
        await this.socket?.sendMessage(
          jid,
          { text: `Image analysis:\n\n${description}` },
          { quoted: message },
        );
      }
    } catch (error) {
      logger.error({ err: error, jid }, "Image understanding failed");
      await this.socket?.sendMessage(
        jid,
        { text: "I received the image, but I could not analyze it right now." },
        { quoted: message },
      );
    }
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
  }
}

let bot: WhatsAppBot | undefined;

export async function startWhatsAppBot(): Promise<void> {
  if (!bot) {
    bot = new WhatsAppBot();
  }
  await bot.start();
}