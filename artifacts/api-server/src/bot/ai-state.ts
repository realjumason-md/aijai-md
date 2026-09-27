import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type StoredAiState = {
  globalDmEnabled: boolean;
  chatOverrides: Record<string, boolean>;
};

const EMPTY_STATE: StoredAiState = {
  globalDmEnabled: false,
  chatOverrides: {},
};

function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

export class AiStateStore {
  private state: StoredAiState = { ...EMPTY_STATE, chatOverrides: {} };
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(sessionDir: string) {
    this.filePath = path.join(sessionDir, "ai-settings.json");
  }

  async load(): Promise<void> {
    try {
      const stored = JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as Partial<StoredAiState>;
      this.state = {
        globalDmEnabled: stored.globalDmEnabled === true,
        chatOverrides: Object.fromEntries(
          Object.entries(stored.chatOverrides ?? {}).filter(
            ([, enabled]) => typeof enabled === "boolean",
          ),
        ),
      };
    } catch (error: unknown) {
      const code = error as { code?: string };
      if (code.code !== "ENOENT") {
        throw error;
      }
    }
  }

  isEnabled(jid: string): boolean {
    const override = this.state.chatOverrides[jid];
    if (typeof override === "boolean") {
      return override;
    }

    return !isGroupJid(jid) && this.state.globalDmEnabled;
  }

  setChatOverride(jid: string, enabled: boolean): Promise<void> {
    this.state.chatOverrides[jid] = enabled;
    return this.persist();
  }

  setGlobalDm(enabled: boolean): Promise<void> {
    this.state.globalDmEnabled = enabled;
    this.state.chatOverrides = {};
    return this.persist();
  }

  getGlobalDmEnabled(): boolean {
    return this.state.globalDmEnabled;
  }

  private persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
    });
    return this.writeQueue;
  }
}