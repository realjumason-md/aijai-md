import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config.js';

const pluginsDir = path.join(process.cwd(), 'plugins');
let activeUpdate = null;

function normalizePluginName(value) {
    const base = path.basename(value || '').trim();
    if (!base)
        return null;
    const name = base.endsWith('.js') ? base : `${base}.js`;
    return /^[a-zA-Z0-9_-]+\.js$/.test(name) ? name : null;
}

async function listLocalPlugins() {
    const files = await fs.readdir(pluginsDir);
    return files.filter((file) => file.endsWith('.js')).sort();
}

async function performPluginUpdate(requestedNames = []) {
    const requested = requestedNames.map(normalizePluginName).filter(Boolean);
    const names = requested.length ? [...new Set(requested)] : await listLocalPlugins();
    const repo = config.pluginRepo || 'realjumason-md/aijai-md';
    const branch = config.pluginBranch || 'main';
    const changed = [];
    const failed = [];
    await fs.mkdir(pluginsDir, { recursive: true });

    for (const name of names) {
        const url = `https://raw.githubusercontent.com/${repo}/${branch}/plugins/${name}`;
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'aijai-md-plugin-updater' } });
            if (!response.ok)
                throw new Error(`GitHub returned ${response.status}`);
            const source = await response.text();
            if (!source.includes('export default'))
                throw new Error('file does not look like an ES module plugin');
            const temporaryPath = path.join(pluginsDir, `.${name}.${process.pid}.tmp`);
            await fs.writeFile(temporaryPath, source, 'utf8');
            await fs.rename(temporaryPath, path.join(pluginsDir, name));
            changed.push(name);
        }
        catch (error) {
            failed.push(`${name}: ${error.message}`);
        }
    }
    return { changed, failed, branch, repo };
}

export async function updatePlugins(requestedNames = []) {
    if (activeUpdate)
        return activeUpdate;
    activeUpdate = performPluginUpdate(requestedNames);
    try {
        return await activeUpdate;
    }
    finally {
        activeUpdate = null;
    }
}
