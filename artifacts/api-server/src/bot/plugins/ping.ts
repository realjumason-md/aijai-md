import type { BotPlugin } from "../types";

const pingPlugin: BotPlugin = {
  name: "ping",
  aliases: ["p", "pong"],
  description: "Check response speed",
  usage: "ping",
  async handler(context) {
    const latency = Date.now() - context.receivedAt;
    await context.reply(`Pong! ${latency} ms`);
  },
};

export default pingPlugin;