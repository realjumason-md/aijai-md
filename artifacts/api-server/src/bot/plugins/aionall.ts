import type { BotPlugin } from "../types";

const aiOnAllPlugin: BotPlugin = {
  name: "aionall",
  aliases: [],
  description: "Turn on AI replies in all direct messages",
  usage: "aionall",
  async handler(context) {
    await context.aiState.setGlobalDm(true);
    await context.reply(
      "AI replies are now ON globally for direct messages. This replaces previous chat-specific settings.",
    );
  },
};

export default aiOnAllPlugin;