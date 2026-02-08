import { requireOptionalBearerAuth } from '../auth.js';
import { promises as fs } from 'node:fs';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
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
    if (/\b(run|execute|start|stop|open|close|list|show|find)\b\s+(the|a|an)\b/i.test(command)) {
        return true;
    }
    if (/^[A-Za-z ,]+$/.test(command) && command.trim().split(/\s+/).length > 3) {
        return true;
    }
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
export async function registerToolboxRoutes(app) {
    app.post('/internal/toolbox', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        const body = req.body;
        const tool = String(body.tool ?? '');
        const params = (body.params ?? {});
        try {
            if (tool === 'read_file') {
                const path = String(params.path ?? '');
                if (!path || path.includes('..') || path.startsWith('/')) {
                    reply.code(400);
                    return { error: 'Invalid path' };
                }
                if (path.includes('.git') || path.includes('node_modules')) {
                    reply.code(403);
                    return { error: 'Refused to read suspicious path' };
                }
                try {
                    const text = await fs.readFile(path, 'utf8');
                    return { success: true, result: { path, text } };
                }
                catch (err) {
                    reply.code(404);
                    return { error: 'File not found' };
                }
            }
            if (tool === 'write_file') {
                const path = String(params.path ?? '');
                const content = String(params.content ?? '');
                if (!path || path.includes('..') || path.startsWith('/')) {
                    reply.code(400);
                    return { error: 'Invalid path' };
                }
                if (path.includes('.git') || path.includes('node_modules')) {
                    reply.code(403);
                    return { error: 'Refused to write suspicious path' };
                }
                await fs.writeFile(path, content, 'utf8');
                return { success: true, result: { path } };
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
                return { success: true, result: { files: entries } };
            }
            if (tool === 'list_dir') {
                const path = String(params.path ?? '.');
                if (!path || path.includes('..') || path.startsWith('/')) {
                    reply.code(400);
                    return { error: 'Invalid path' };
                }
                if (path.includes('.git') || path.includes('node_modules')) {
                    reply.code(403);
                    return { error: 'Refused to list suspicious path' };
                }
                const entries = await fs.readdir(path, { withFileTypes: true });
                const files = entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }));
                return { success: true, result: { path, files } };
            }
            if (tool === 'grep_search') {
                const query = String(params.query ?? '');
                const include = String(params.include_pattern ?? '');
                if (!query) {
                    reply.code(400);
                    return { error: 'Missing query' };
                }
                const matches = await grepSearchSafe({ query, includePattern: include || undefined, maxMatches: 200 });
                return { success: true, result: { query, matches } };
            }
            // Approve a command by adding it to the allowlist. This is a convenience to let a local user opt-in
            // to a previously refused command. This will persist to config/allowed-commands.json (append if missing).
            if (tool === 'approve_command') {
                const command = String(params.command ?? '');
                if (!command) {
                    reply.code(400);
                    return { error: 'Missing command' };
                }
                if (isDangerousCommand(command)) {
                    reply.code(403);
                    return { error: 'Refused: matches dangerous pattern' };
                }
                try {
                    const cfgPath = new URL('../../config/allowed-commands.json', import.meta.url);
                    let allowed = [];
                    try {
                        const current = await fs.readFile(cfgPath, 'utf8');
                        allowed = JSON.parse(current);
                    }
                    catch (e) {
                        // treat as empty list
                    }
                    if (!allowed.includes(command)) {
                        allowed.push(command);
                        await fs.writeFile(cfgPath, JSON.stringify(allowed, null, 2), 'utf8');
                    }
                    return { success: true, result: { command } };
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    reply.code(500);
                    return { error: message };
                }
            }
            if (tool === 'run_command') {
                const command = String(params.command ?? '');
                if (!command) {
                    reply.code(400);
                    return { error: 'Missing command' };
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
                    reply.code(403);
                    return { error: 'Refused: command not on allowlist' };
                }
                if (looksLikeNaturalLanguageCommand(command)) {
                    reply.code(403);
                    return { error: 'Refused: looks like natural language' };
                }
                if (isDangerousCommand(command)) {
                    reply.code(403);
                    return { error: 'Refused: matches dangerous pattern' };
                }
                const { stdout, stderr } = await exec(command, { timeout: 15000, maxBuffer: 1024 * 1024 });
                const output = (stdout || '').slice(0, 4000) || (stderr || '').slice(0, 4000) || '(no output)';
                return { success: true, result: { stdout: output } };
            }
            reply.code(400);
            return { error: 'Unsupported tool' };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            reply.code(500);
            return { error: message };
        }
    });
}
