import type { BotPlugin } from "../types";

const ownerPlugin: BotPlugin = {
  name: "owner",
  aliases: ["creator"],
  description: "Show bot owner information",
  usage: "owner",
  async handler(context) {
    await context.reply(
      `╭─〔 Owner 〕\n` +
        `│ Name: ${context.config.ownerName}\n` +
        `│ Number: +${context.config.ownerNumber}\n` +
        `│ WhatsApp: https://wa.me/${context.config.ownerNumber}\n` +
        `╰────────────`,
    );
  },
};

export default ownerPlugin;