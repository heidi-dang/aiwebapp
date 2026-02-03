/**
 * Phase 4: Bridge client for VS Code extension communication
 *
 * The bridge API runs inside VS Code and provides workspace capabilities:
 * - File read/list operations
 * - Apply edits (structured)
 * - Run allowlisted tools
 * - Copilot edit generation
 */
export class BridgeClient {
    baseUrl;
    token;
    timeout;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
        this.token = config.token;
        this.timeout = config.timeout ?? 30000;
    }
    async request(method, path, body) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const res = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Bridge-Token': this.token
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Bridge request failed: ${res.status} ${text}`);
            }
            return res.json();
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    /**
     * Health check - verify bridge is running and workspace is open
     */
    async health() {
        return this.request('GET', '/health');
    }
    /**
     * List files in workspace matching glob pattern
     */
    async listFiles(glob, limit = 1000) {
        const params = new URLSearchParams({ glob, limit: String(limit) });
        const res = await this.request('GET', `/workspace/list?${params}`);
        return res.files.map((path) => ({ path }));
    }
    /**
     * Read file content
     */
    async readFile(path) {
        const params = new URLSearchParams({ path });
        return this.request('GET', `/workspace/read?${params}`);
    }
    /**
     * Apply structured edits to files
     */
    async applyEdits(edits) {
        const res = await this.request('POST', '/workspace/applyEdits', { edits });
        return { changedFiles: res.changedFiles };
    }
    /**
     * Run allowlisted tool/command
     */
    async runTool(tool, args) {
        return this.request('POST', '/tools/run', { tool, ...args });
    }
    /**
     * Generate edits via Copilot
     */
    async generateEdits(instruction, files) {
        return this.request('POST', '/copilot/generateEdits', {
            instruction,
            files,
            output: 'edits'
        });
    }
}
/**
 * Create bridge client from environment variables
 */
export function createBridgeClientFromEnv() {
    const baseUrl = process.env.BRIDGE_URL;
    const token = process.env.BRIDGE_TOKEN;
    if (!baseUrl || !token) {
        return null;
    }
    return new BridgeClient({ baseUrl, token });
}
