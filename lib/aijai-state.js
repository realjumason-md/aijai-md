import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const emptyState = {
    globalDmEnabled: false,
    chatOverrides: {}
};

class AiStateStore {
    constructor(sessionDir = path.join(process.cwd(), 'session')) {
        this.filePath = path.join(sessionDir, 'ai-settings.json');
        this.state = { ...emptyState, chatOverrides: {} };
        this.writeQueue = Promise.resolve();
    }

    async load() {
        try {
            const stored = JSON.parse(await readFile(this.filePath, 'utf8'));
            this.state = {
                globalDmEnabled: stored.globalDmEnabled === true,
                chatOverrides: Object.fromEntries(
                    Object.entries(stored.chatOverrides || {}).filter(([, enabled]) => typeof enabled === 'boolean')
                )
            };
        }
        catch (error) {
            if (error?.code !== 'ENOENT')
                throw error;
        }
    }

    isEnabled(jid) {
        const override = this.state.chatOverrides[jid];
        if (typeof override === 'boolean')
            return override;
        return !jid.endsWith('@g.us') && this.state.globalDmEnabled;
    }

    setChatOverride(jid, enabled) {
        this.state.chatOverrides[jid] = enabled;
        return this.persist();
    }

    setGlobalDm(enabled) {
        this.state.globalDmEnabled = enabled;
        this.state.chatOverrides = {};
        return this.persist();
    }

    persist() {
        this.writeQueue = this.writeQueue.then(async () => {
            await mkdir(path.dirname(this.filePath), { recursive: true });
            await writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
        });
        return this.writeQueue;
    }
}

export const aijaiState = new AiStateStore();