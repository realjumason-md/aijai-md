import type { BotPlugin } from "../types";

const aiOffAllPlugin: BotPlugin = {
  name: "aioffall",
  aliases: [],
  description: "Turn off AI replies in all direct messages",
  usage: "aioffall",
  async handler(context) {
    await context.aiState.setGlobalDm(false);
    await context.reply(
      "AI replies are now OFF globally for direct messages. This replaces previous chat-specific settings.",
    );
  },
};

export default aiOffAllPlugin;