import type { BotPlugin } from "../types";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
}

const alivePlugin: BotPlugin = {
  name: "alive",
  aliases: ["status", "bot"],
  description: "Show that the bot is online and its uptime",
  usage: "alive",
  async handler(context) {
    await context.reply(
      `╭─〔 ${context.config.botName} 〕\n` +
        `│ Online: yes\n` +
        `│ Uptime: ${formatUptime(process.uptime())}\n` +
        `╰────────────`,
    );
  },
};

export default alivePlugin;