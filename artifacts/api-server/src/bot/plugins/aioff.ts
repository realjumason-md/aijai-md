import type { BotPlugin } from "../types";

const aiOffPlugin: BotPlugin = {
  name: "aioff",
  aliases: [],
  description: "Turn off AI replies in this chat",
  usage: "aioff",
  async handler(context) {
    await context.aiState.setChatOverride(context.jid, false);
    await context.reply("AI replies are now OFF in this chat.");
  },
};

export default aiOffPlugin;