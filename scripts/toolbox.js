#!/usr/bin/env node
/* Simple developer toolbox CLI
 * Usage: node scripts/toolbox.js <command> [args]
 */
import fs from 'fs';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import glob from 'glob';
import path from 'path';
const exec = promisify(execCb);

function help() {
  console.log(`Toolbox - developer utilities

Usage:
  toolbox <command> [args]

Commands:
  read-file <path>            Read a file and print to stdout
  write-file <path> <text>    Write text to a file (overwrites)
  list-files <glob>           List files matching glob
  list-dir <path>             List directory contents
  grep-search <query> [--include <glob>]   Search for text across files
  run-command <command>       Run a shell command (safety checks)
  smoke                       Run smoke checks to verify tools
  help                        Show this help
`);
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

async function readFileCmd(p) {
  try {
    const txt = await fs.promises.readFile(p, 'utf8');
    console.log(txt);
    return 0;
  } catch (err) {
    console.error('read-file error:', err.message);
    return 2;
  }
}

async function writeFileCmd(p, text) {
  try {
    await fs.promises.writeFile(p, text, 'utf8');
    console.log(`Wrote ${text.length} bytes to ${p}`);
    return 0;
  } catch (err) {
    console.error('write-file error:', err.message);
    return 2;
  }
}

async function listFilesCmd(pattern) {
  try {
    const files = glob.sync(pattern, { cwd: process.cwd() });
    for (const f of files) console.log(f);
    return 0;
  } catch (err) {
    console.error('list-files error:', err.message);
    return 2;
  }
}

async function listDirCmd(p) {
  try {
    const entries = await fs.promises.readdir(p, { withFileTypes: true });
    for (const e of entries) console.log(`${e.isDirectory() ? 'd' : 'f'} ${e.name}`);
    return 0;
  } catch (err) {
    console.error('list-dir error:', err.message);
    return 2;
  }
}

async function grepSearchCmd(query, includePattern) {
  try {
    let cmd = `grep -R -n "${query.replace(/"/g, '\\"')}" . | head -n 200`;
    if (includePattern) cmd = `grep -R -n --include="${includePattern}" "${query.replace(/"/g, '\\"')}" . | head -n 200`;
    const { stdout } = await exec(cmd, { maxBuffer: 2 * 1024 * 1024 }); // 2MB buffer
    console.log(stdout);
    return 0;
  } catch (err) {
    // grep returns exit code 1 when no matches found, which is not an error
    if (err.code === 1) {
      console.log('(no matches found)');
      return 0;
    }
    if (err.stdout) console.log(err.stdout);
    console.error('grep-search error:', err.message);
    return 2;
  }
}

async function runCommandCmd(command, opts = { yes: false }) {
  if (!command) {
    console.error('run-command: missing command');
    return 2;
  }

  // Load allowlist
  let allowed = [];
  try {
    const cfg = await fs.promises.readFile(path.join(process.cwd(), 'config', 'allowed-commands.json'), 'utf8');
    allowed = JSON.parse(cfg);
  } catch (err) {
    // ignore - will treat as empty allowlist
  }

  function matchesAllowlist(cmd, allowedList) {
    if (!allowedList || allowedList.length === 0) return false;
    const trimmed = cmd.trim();
    for (const a of allowedList) {
      const pick = a.trim();
      if (trimmed === pick) return true;
      if (trimmed.startsWith(pick + ' ')) return true;
    }
    return false;
  }

  const isAllowed = matchesAllowlist(command, allowed);
  if (!isAllowed && !opts.yes) {
    // prompt user
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    const q = `Command not in allowlist. Are you sure you want to run: "${command}"? (y/N) `;
    const answer = await new Promise((resolve) => {
      rl.question(q, (ans) => {
        rl.close();
        resolve(ans.trim().toLowerCase());
      });
      // optional timeout: 20s
      setTimeout(() => {
        rl.close();
        resolve('');
      }, 20000);
    });
    if (answer !== 'y' && answer !== 'yes') {
      console.error('Aborted by user (not confirmed)');
      return 3;
    }
  }

  if (looksLikeNaturalLanguageCommand(command)) {
    console.error('Refusing to run: looks like natural language rather than shell command');
    return 3;
  }
  if (isDangerousCommand(command)) {
    console.error('Refusing to run: command matches disallowed or unsafe patterns');
    return 3;
  }
  try {
    const { stdout, stderr } = await exec(command, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }); // 30s timeout, 10MB buffer
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return 0;
  } catch (err) {
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    if (err.code && err.code !== 0) {
      console.error(`run-command failed with exit code ${err.code}:`, err.message);
    } else {
      console.error('run-command failed:', err.message);
    }
    return 2;
  }
}

async function smokeCmd() {
  console.log('Running toolbox smoke checks...');
  let ok = true;

  const rc1 = await readFileCmd('README.md');
  if (rc1 !== 0) ok = false;

  const rc2 = await listFilesCmd('ui/src/**');
  if (rc2 !== 0) ok = false;

  const rc3 = await grepSearchCmd('run_command', 'runner/**');
  if (rc3 !== 0) ok = false;

  const rc4 = await runCommandCmd('echo toolbox-smoke');
  if (rc4 !== 0) ok = false;

  if (ok) {
    console.log('toolbox smoke: all good');
    return 0;
  } else {
    console.error('toolbox smoke: some checks failed');
    return 1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === 'help') return help();

  if (cmd === 'read-file') {
    const p = args[1];
    process.exit(await readFileCmd(p));
  } else if (cmd === 'write-file') {
    const p = args[1];
    const text = args.slice(2).join(' ');
    process.exit(await writeFileCmd(p, text));
  } else if (cmd === 'list-files') {
    const pattern = args[1] || '**/*';
    process.exit(await listFilesCmd(pattern));
  } else if (cmd === 'list-dir') {
    const p = args[1] || '.';
    process.exit(await listDirCmd(p));
  } else if (cmd === 'grep-search') {
    const query = args[1];
    const includeIdx = args.indexOf('--include');
    const includePattern = includeIdx !== -1 ? args[includeIdx + 1] : undefined;
    process.exit(await grepSearchCmd(query, includePattern));
  } else if (cmd === 'run-command') {
    // support optional --yes flag: toolbox run-command --yes <command>
    const yesIdx = args.indexOf('--yes');
    const yes = yesIdx !== -1;
    if (yes) args.splice(yesIdx, 1);
    const command = args.slice(1).join(' ');
    process.exit(await runCommandCmd(command, { yes }));
  } else if (cmd === 'smoke') {
    process.exit(await smokeCmd());
  } else {
    console.error('Unknown command:', cmd);
    help();
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('toolbox error:', err);
  process.exit(2);
});
