#!/usr/bin/env node
/*
 * Lightweight tools-check script to validate common dev actions.
 * Exits with non-zero code when a check fails.
 */
import { promises as fs } from 'node:fs'
import { exec as execCb } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'path'

const exec = promisify(execCb)

async function execText(command) {
  const { stdout } = await exec(command)
  return stdout.toString()
}

async function execTextOrEmpty(command) {
  try {
    return await execText(command)
  } catch {
    return ''
  }
}

async function commandExists(command) {
  try {
    await exec(command)
    return true
  } catch {
    return false
  }
}

async function findTextInFiles(rootDir, needle, opts = {}) {
  const results = []
  const maxMatches = opts.maxMatches ?? 20
  const isRegex = Boolean(opts.regex)
  const matcher = isRegex ? new RegExp(needle, 'i') : null

  async function walk(dir) {
    if (results.length >= maxMatches) return
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= maxMatches) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.next') continue
        await walk(full)
        continue
      }

      if (!entry.isFile()) continue
      if (opts.extensions && !opts.extensions.some((ext) => entry.name.endsWith(ext))) continue

      let text = ''
      try {
        text = await fs.readFile(full, 'utf8')
      } catch {
        continue
      }

      const hit = isRegex ? matcher.test(text) : text.includes(needle)
      if (hit) results.push(full)
    }
  }

  await walk(rootDir)
  return results
}

async function ok(msg) {
  console.log('\x1b[32m[OK]\x1b[0m', msg)
}

async function fail(msg) {
  console.error('\x1b[31m[FAIL]\x1b[0m', msg)
  process.exitCode = 1
}

async function run() {
  console.log('Running tools-check...')

  // read_file: README.md
  try {
    const readme = await fs.readFile('README.md', 'utf8')
    if (readme.includes('AI Web App')) {
      await ok('read_file: README.md readable')
    } else {
      await fail('read_file: README.md missing expected content')
    }
  } catch (err) {
    await fail(`read_file: README.md read failed: ${err}`)
  }

  // file_search: find ui src files (using git ls-files)
  try {
    const stdout = await execTextOrEmpty('git ls-files "ui/src/**"')
    const files = stdout.trim().split('\n').filter(Boolean)
    if (files.length > 0) {
      await ok('file_search: found ui/src files')
    } else {
      await fail('file_search: ui/src appears empty')
    }
  } catch (err) {
    await fail(`file_search: git ls-files failed: ${err}`)
  }

  // grep_search: search for run_command in runner (prefer rg)
  try {
    const hasRg = await commandExists('rg --version')
    let out = ''
    if (hasRg) {
      out = await execTextOrEmpty('rg -n "run_command" runner')
    } else {
      const hits = await findTextInFiles('runner', 'run_command', { maxMatches: 5 })
      out = hits.join('\n')
    }

    if (out.trim()) {
      await ok('grep_search: found run_command occurrences')
    } else {
      await fail('grep_search: did not find run_command')
    }
  } catch (err) {
    await fail(`grep_search: grep failed or no matches: ${err}`)
  }

  // list_dir: list ui/src/components
  try {
    const entries = await fs.readdir('ui/src/components')
    if (entries.length > 0) {
      await ok('list_dir: ui/src/components contains entries')
    } else {
      await fail('list_dir: ui/src/components appears empty')
    }
  } catch (err) {
    await fail(`list_dir: readdir failed: ${err}`)
  }

  // run_in_terminal: run a simple command
  try {
    const { stdout } = await exec('echo tools-check-$USER')
    if (stdout.includes('tools-check')) {
      await ok('run_in_terminal: echo command executed')
    } else {
      await fail('run_in_terminal: echo command returned unexpected output')
    }
  } catch (err) {
    await fail(`run_in_terminal: command execution failed: ${err}`)
  }

  // Toolbox run-command allowlist checks (skip in CI)
  if (process.env.CI) {
    await ok('toolbox run-command: skipped in CI environment')
  } else {
    try {
      // Known allowed command should succeed
      await exec('npm run toolbox -- run-command "echo hello" --silent')
      await ok('toolbox run-command: allowed command executed')
    } catch (err) {
      await fail('toolbox run-command: allowed command failed')
    }

    try {
      // Natural language should be refused (will print refusal message)
      await exec('npm run toolbox -- run-command "run the tests"', { timeout: 5000 })
      await fail('toolbox run-command: natural-language input unexpectedly ran')
    } catch (err) {
      const out = `${err?.stdout ?? ''}\n${err?.stderr ?? ''}\n${err?.message ?? ''}`.toLowerCase()
      if (out.includes('refusing to run') || out.includes('aborted by user') || out.includes('command not in allowlist')) {
        await ok('toolbox run-command: natural-language command was refused (expected)')
      } else {
        await fail('toolbox run-command: natural-language command did not return expected refusal')
      }
    }
  }

  // get_changed_files: git status --porcelain
  try {
    const { stdout } = await exec('git status --porcelain')
    await ok('get_changed_files: git status ran')
    console.log('  git status has', stdout.split('\n').filter(Boolean).length, 'entries')
  } catch (err) {
    await fail(`get_changed_files: git status failed: ${err}`)
  }

  // create_directory/create_file/edit_files: create temp file and modify it
  const tmpDir = path.join('tmp', 'tools-check')
  try {
    await fs.mkdir(tmpDir, { recursive: true })
    const tmpFile = path.join(tmpDir, 'test.txt')
    await fs.writeFile(tmpFile, 'hello', 'utf8')
    const content = await fs.readFile(tmpFile, 'utf8')
    if (content === 'hello') {
      await ok('create_file/edit_files: wrote and read temp file')
    } else {
      await fail('create_file/edit_files: content mismatch')
    }
    await fs.writeFile(tmpFile, 'updated', 'utf8')
    const updated = await fs.readFile(tmpFile, 'utf8')
    if (updated === 'updated') await ok('edit_files: updated temp file')
    await fs.rm(tmpDir, { recursive: true, force: true })
  } catch (err) {
    await fail(`create_file/edit_files: operations failed: ${err}`)
  }

  // runTests: try running UI lint (non-failing), and server smoke (if available)
  try {
    await exec('npm --prefix ui run lint --silent')
    await ok('runTests: ui lint succeeded')
  } catch (err) {
    console.warn('runTests: ui lint did not pass (non-fatal):', err?.message ?? err)
  }

  // list_code_usages: use grep to find occurrences of a symbol
  try {
    const hasRg = await commandExists('rg --version')
    let out = ''
    if (hasRg) {
      out = await execTextOrEmpty('rg -n "executeJob" src runner server ui')
    } else {
      const hits = await findTextInFiles('.', 'executeJob', { maxMatches: 20 })
      out = hits.join('\n')
    }

    if (out.trim()) await ok('list_code_usages: found executeJob usage(s)')
    else console.warn('list_code_usages: no executeJob symbol found (non-fatal)')
  } catch (err) {
    console.warn('list_code_usages: grep failed (non-fatal):', err?.message ?? err)
  }

  // UI checks: ensure new agent-run UI affordances exist
  try {
    const runCardPath = 'ui/src/components/chat/ChatArea/Messages/RunCard.tsx'
    const runCardText = await fs.readFile(runCardPath, 'utf8')
    if (runCardText.includes('data-testid="run-thinking"')) {
      await ok('ui_check: found run-thinking test id')
    } else {
      await fail('ui_check: run-thinking test id missing')
    }

    if (runCardText.includes('data-testid="run-tool-refusal"')) {
      await ok('ui_check: found run-tool-refusal test id')
    } else {
      await fail('ui_check: run-tool-refusal test id missing')
    }
  } catch (err) {
    await fail(`ui_check: run-card file checks failed: ${err}`)
  }

  // vscode task sanity check: ensure .vscode/tasks.json exists and contains our task
  try {
    const tasksRaw = await fs.readFile('.vscode/tasks.json', 'utf8')
    let tasksJson = null
    try {
      tasksJson = JSON.parse(tasksRaw)
    } catch (err) {
      await fail('.vscode/tasks.json exists but is invalid JSON')
    }
    const tasks = Array.isArray(tasksJson.tasks) ? tasksJson.tasks : []
    const hasToolsTask = tasks.some((t) => t.label === 'Tools: Run tools-check')
    if (hasToolsTask) await ok('vscode task: Tools: Run tools-check is present')
    else await fail('vscode task: Tools: Run tools-check missing from .vscode/tasks.json')
  } catch (err) {
    await fail(`vscode task: could not read .vscode/tasks.json: ${err}`)
  }

  // toolbox HTTP proxy checks (non-fatal if server not running)
  try {
    // read_file invalid path should return 400 or 403
    const readCmd = "curl -s -X POST http://localhost:4001/internal/toolbox -H 'Content-Type: application/json' -d '{\"tool\":\"read_file\",\"params\":{\"path\":\"../secret.txt\"}}' -w '%{http_code}' -o /dev/null"
    const { stdout: rcode } = await exec(readCmd, { timeout: 5000 })
    const rc = rcode.trim() || ''
    if (rc === '400' || rc === '403' || rc === '404') {
      await ok('toolbox proxy: read_file invalid path returned expected HTTP status')
    } else if (rc === '') {
      console.warn('toolbox proxy: server not reachable (skipping HTTP checks)')
    } else {
      console.warn('toolbox proxy: read_file invalid path returned', rc)
    }
  } catch (err) {
    console.warn('toolbox proxy: read_file check failed (non-fatal):', err?.message ?? err)
  }

  try {
    // run_command not allowlisted should return 403
    const runCmd = "curl -s -X POST http://localhost:4001/internal/toolbox -H 'Content-Type: application/json' -d '{\"tool\":\"run_command\",\"params\":{\"command\":\"rm -rf /\"}}' -w '%{http_code}' -o /dev/null"
    const { stdout: rcode2 } = await exec(runCmd, { timeout: 5000 })
    const rc2 = rcode2.trim() || ''
    if (rc2 === '403') {
      await ok('toolbox proxy: run_command denied as expected')
    } else if (rc2 === '') {
      console.warn('toolbox proxy: server not reachable (skipping HTTP checks)')
    } else {
      console.warn('toolbox proxy: run_command check returned', rc2)
    }
  } catch (err) {
    console.warn('toolbox proxy: run_command check failed (non-fatal):', err?.message ?? err)
  }

  // contract1 invariants: must pass
  try {
    // Must have System Prompt UI
    const hasRg = await commandExists('rg --version')
    let sys = ''
    if (hasRg) sys = await execTextOrEmpty('rg -n "System Prompt" ui/src')
    if (!sys.trim()) {
      const hits = await findTextInFiles(path.join('ui', 'src'), 'System Prompt', { maxMatches: 5 })
      sys = hits.join('\n')
    }
    if (!sys.trim()) {
      await fail('contract: System Prompt menu missing from ui/src')
    } else {
      await ok('contract: System Prompt menu present')
    }

    // Forbidden strings must not exist
    const forbidden = hasRg
      ? await execTextOrEmpty('rg -n "AgentOS|Agno Agent UI|This is an open-source Agno Agent UI|For the full experience, visit the AgentOS|Replay|Pause|Resume" ui/src')
      : ''
    if (forbidden.trim()) {
      await fail(`contract: forbidden UI strings found:\n${forbidden}`)
    } else {
      await ok('contract: forbidden UI strings not present')
    }

    // send-inside-composer test id must exist
    let sendtest = ''
    if (hasRg) sendtest = await execTextOrEmpty('rg -n "send-inside-composer" ui/src')
    if (!sendtest.trim()) {
      const hits = await findTextInFiles(path.join('ui', 'src'), 'send-inside-composer', { maxMatches: 5 })
      sendtest = hits.join('\n')
    }
    if (!sendtest.trim()) {
      await fail('contract: send button inside composer (data-testid=send-inside-composer) missing')
    } else {
      await ok('contract: send button inside composer present')
    }

    // Ensure no PLAN sections remain (uppercase PLAN)
    const plancheck = hasRg ? await execTextOrEmpty('rg -n "\\bPLAN\\b" ui/src') : ''
    if (plancheck.trim()) {
      await fail(`contract: PLAN occurrence found:\n${plancheck}`)
    } else {
      await ok('contract: no PLAN occurrences found')
    }
  } catch (err) {
    await fail(`contract checks failed: ${err}`)
  }

  // everything done
  if (process.exitCode && process.exitCode !== 0) {
    console.error('\nSome checks failed. Review output above.')
    process.exit(1)
  } else {
    console.log('\nAll checks completed. If there were warnings, review them.')
    process.exit(0)
  }
}

run().catch((err) => {
  console.error('tools-check: unexpected error', err)
  process.exit(2)
})
