import type { BotPlugin } from "../types";

const menuPlugin: BotPlugin = {
  name: "menu",
  aliases: ["list", "help", "h", "commands"],
  description: "Show all available commands",
  usage: "menu",
  async handler(context) {
    const lines = context.plugins.map((plugin) => {
      const aliases = plugin.aliases.length > 0
        ? ` (${plugin.aliases.join(", ")})`
        : "";
      return `• ${context.prefix}${plugin.name}${aliases}\n  ${plugin.description}`;
    });

    await context.reply(
      `╭─〔 ${context.config.botName} 〕\n` +
        `│ Commands\n` +
        `╰────────────\n\n` +
        lines.join("\n\n") +
        `\n\nUse ${context.prefix}command to run one.`,
    );
  },
};

export default menuPlugin;