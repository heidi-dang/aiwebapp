import { requireOptionalBearerAuth } from '../auth.js';
import { promises as fs } from 'node:fs';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import glob from 'glob';
import path from 'node:path';
const exec = promisify(execCb);
async function grepSearchSafe(args) {
    const query = args.query;
    const maxMatches = args.maxMatches;
    const include = args.includePattern;
    const entries = await new Promise((resolve, reject) => {
        const pattern = include || '**/*';
        glob(pattern, { cwd: process.cwd(), nodir: true }, (err, matches) => {
            if (err)
                reject(err);
            else
                resolve(matches);
        });
    });
    const matches = [];
    for (const rel of entries) {
        if (matches.length >= maxMatches)
            break;
        if (rel.includes('node_modules') || rel.includes('.git') || rel.includes('dist') || rel.includes('.next'))
            continue;
        const full = path.join(process.cwd(), rel);
        let text = '';
        try {
            text = await fs.readFile(full, 'utf8');
        }
        catch {
            continue;
        }
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxMatches)
                break;
            if (!lines[i].includes(query))
                continue;
            matches.push({ file: rel, line: i + 1, text: lines[i] });
        }
    }
    return matches;
}
function looksLikeNaturalLanguageCommand(command) {
    const lowered = command.toLowerCase();
    if (/\b(run|execute|start|stop|open|close|list|show|find)\b\s+(the|a|an)\b/.test(lowered))
        return true;
    if (/^[a-z ,]+$/.test(lowered) && lowered.trim().split(/\s+/).length > 3)
        return true;
    return false;
}
function isDangerousCommand(command) {
    const lowered = command.toLowerCase();
    return /(^|\s)(rm\s+-rf|sudo\b|shutdown\b|reboot\b|mkfs\b|dd\s+if=|:\(\)\s*{\s*:|:;};:|:\s*>\s*\/|>\s*\/)/.test(lowered);
}
async function loadAllowlist() {
    try {
        const content = await fs.readFile(new URL('../../config/allowed-commands.json', import.meta.url), 'utf8');
        return JSON.parse(content);
    }
    catch {
        return [];
    }
}
export async function registerToolboxRoutes(app, store) {
    app.get('/toolbox', async (req, res) => {
        requireOptionalBearerAuth(req, res);
        if (res.headersSent)
            return;
        res.json(store.toolbox);
    });
    app.post('/internal/toolbox', async (req, res) => {
        requireOptionalBearerAuth(req, res);
        if (res.headersSent)
            return;
        const body = (req.body ?? {});
        const tool = String(body.tool ?? '');
        const params = (body.params ?? {});
        try {
            if (tool === 'read_file') {
                const p = String(params.path ?? '');
                if (!p || p.includes('..') || path.isAbsolute(p)) {
                    return res.status(400).json({ error: 'Invalid path' });
                }
                if (p.includes('.git') || p.includes('node_modules')) {
                    return res.status(403).json({ error: 'Refused to read suspicious path' });
                }
                try {
                    const text = await fs.readFile(p, 'utf8');
                    return res.json({ success: true, result: { path: p, text } });
                }
                catch {
                    return res.status(404).json({ error: 'File not found' });
                }
            }
            if (tool === 'write_file') {
                const p = String(params.path ?? '');
                const content = String(params.content ?? '');
                if (!p || p.includes('..') || path.isAbsolute(p)) {
                    return res.status(400).json({ error: 'Invalid path' });
                }
                if (p.includes('.git') || p.includes('node_modules')) {
                    return res.status(403).json({ error: 'Refused to write suspicious path' });
                }
                await fs.writeFile(p, content, 'utf8');
                return res.json({ success: true, result: { path: p } });
            }
            if (tool === 'list_files') {
                const pattern = String(params.glob ?? '**/*');
                const entries = await new Promise((resolve, reject) => {
                    glob(pattern, { cwd: process.cwd() }, (err, matches) => {
                        if (err)
                            reject(err);
                        else
                            resolve(matches);
                    });
                });
                return res.json({ success: true, result: { files: entries } });
            }
            if (tool === 'list_dir') {
                const p = String(params.path ?? '.');
                if (!p || p.includes('..') || path.isAbsolute(p)) {
                    return res.status(400).json({ error: 'Invalid path' });
                }
                if (p.includes('.git') || p.includes('node_modules')) {
                    return res.status(403).json({ error: 'Refused to list suspicious path' });
                }
                const entries = await fs.readdir(p, { withFileTypes: true });
                const files = entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }));
                return res.json({ success: true, result: { path: p, files } });
            }
            if (tool === 'grep_search') {
                const query = String(params.query ?? '');
                const include = String(params.include_pattern ?? '');
                if (!query) {
                    return res.status(400).json({ error: 'Missing query' });
                }
                const matches = await grepSearchSafe({ query, includePattern: include || undefined, maxMatches: 200 });
                return res.json({ success: true, result: { query, matches } });
            }
            if (tool === 'approve_command') {
                const command = String(params.command ?? '');
                if (!command) {
                    return res.status(400).json({ error: 'Missing command' });
                }
                if (isDangerousCommand(command)) {
                    return res.status(403).json({ error: 'Refused: matches dangerous pattern' });
                }
                try {
                    const cfgUrl = new URL('../../config/allowed-commands.json', import.meta.url);
                    let allowed = [];
                    try {
                        const current = await fs.readFile(cfgUrl, 'utf8');
                        allowed = JSON.parse(current);
                    }
                    catch {
                        // treat as empty list
                    }
                    if (!allowed.includes(command)) {
                        allowed.push(command);
                        await fs.writeFile(cfgUrl, JSON.stringify(allowed, null, 2), 'utf8');
                    }
                    return res.json({ success: true, result: { command } });
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    return res.status(500).json({ error: message });
                }
            }
            if (tool === 'run_command') {
                const command = String(params.command ?? '');
                if (!command) {
                    return res.status(400).json({ error: 'Missing command' });
                }
                const allowed = await loadAllowlist();
                const matchesAllowlist = (cmd) => {
                    const trimmed = cmd.trim();
                    for (const a of allowed) {
                        const pick = a.trim();
                        if (trimmed === pick)
                            return true;
                        if (trimmed.startsWith(pick + ' '))
                            return true;
                    }
                    return false;
                };
                if (!matchesAllowlist(command)) {
                    return res.status(403).json({ error: 'Refused: command not on allowlist' });
                }
                if (looksLikeNaturalLanguageCommand(command)) {
                    return res.status(403).json({ error: 'Refused: looks like natural language' });
                }
                if (isDangerousCommand(command)) {
                    return res.status(403).json({ error: 'Refused: matches dangerous pattern' });
                }
                const { stdout, stderr } = await exec(command, { timeout: 15000, maxBuffer: 1024 * 1024 });
                const output = (stdout || '').slice(0, 4000) || (stderr || '').slice(0, 4000) || '(no output)';
                return res.json({ success: true, result: { stdout: output } });
            }
            return res.status(400).json({ error: 'Unsupported tool' });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return res.status(500).json({ error: message });
        }
    });
}
