import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import type { BotPlugin } from "../types";
import { getQuotedViewOnceMessage } from "../message";

async function toBuffer(
  stream: AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const viewOncePlugin: BotPlugin = {
  name: "viewonce",
  aliases: ["vv", "viewmedia"],
  description: "Reveal a replied-to view-once image or video",
  usage: "viewonce (reply to view-once media)",
  async handler(context) {
    const media = getQuotedViewOnceMessage(context.quotedMessage);
    if (!media) {
      await context.reply(
        `Reply to a view-once image or video with ${context.prefix}viewonce.`,
      );
      return;
    }

    const stream = await downloadContentFromMessage(media.message, media.kind);
    const buffer = await toBuffer(stream);
    if (media.kind === "image") {
      await context.sock.sendMessage(
        context.jid,
        { image: buffer, caption: "View-once media revealed." },
        { quoted: context.message },
      );
      return;
    }

    await context.sock.sendMessage(
      context.jid,
      {
        video: buffer,
        mimetype: media.message.mimetype ?? "video/mp4",
        caption: "View-once media revealed.",
      },
      { quoted: context.message },
    );
  },
};

export default viewOncePlugin;