import type { BotPlugin } from "../types";

const echoPlugin: BotPlugin = {
  name: "echo",
  aliases: [],
  description: "Repeat the message",
  usage: "echo <message>",
  async handler(context) {
    const text = context.args.join(" ").trim();
    await context.reply(text || `Usage: ${context.prefix}${this.usage}`);
  },
};

export default echoPlugin;