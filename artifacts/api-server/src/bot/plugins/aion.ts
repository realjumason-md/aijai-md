import type { BotPlugin } from "../types";

const aiOnPlugin: BotPlugin = {
  name: "aion",
  aliases: [],
  description: "Turn on AI replies in this chat",
  usage: "aion",
  async handler(context) {
    await context.aiState.setChatOverride(context.jid, true);
    await context.reply("AI replies are now ON in this chat.");
  },
};

export default aiOnPlugin;