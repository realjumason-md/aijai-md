import type { BotPlugin } from "../types";
import alivePlugin from "./alive";
import aiOffAllPlugin from "./aioffall";
import aiOffPlugin from "./aioff";
import aiOnAllPlugin from "./aionall";
import aiOnPlugin from "./aion";
import echoPlugin from "./echo";
import menuPlugin from "./menu";
import ownerPlugin from "./owner";
import pingPlugin from "./ping";
import viewOncePlugin from "./viewonce";

export const plugins: readonly BotPlugin[] = [
  menuPlugin,
  aiOnPlugin,
  aiOffPlugin,
  aiOnAllPlugin,
  aiOffAllPlugin,
  alivePlugin,
  pingPlugin,
  viewOncePlugin,
  ownerPlugin,
  echoPlugin,
];

export function findPlugin(command: string): BotPlugin | undefined {
  return plugins.find(
    (plugin) =>
      plugin.name === command ||
      plugin.aliases.some((alias) => alias === command),
  );
}