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
    const { stdout } = await exec("git ls-files 'ui/src/**' || true")
    const files = stdout.trim().split('\n').filter(Boolean)
    if (files.length > 0) {
      await ok('file_search: found ui/src files')
    } else {
      await fail('file_search: ui/src appears empty')
    }
  } catch (err) {
    await fail(`file_search: git ls-files failed: ${err}`)
  }

  // grep_search: search for run_command in runner
  try {
    const { stdout } = await exec('grep -n "run_command" runner -R | head -n 5')
    if (stdout.trim()) {
      await ok('grep_search: found run_command occurrences')
    } else {
      await fail('grep_search: did not find run_command')
    }
  } catch (err) {
    // grep returns non-zero if not found; capture stderr
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
    const { stdout } = await exec('grep -R "executeJob" -n src runner server ui || true')
    if (stdout.trim()) await ok('list_code_usages: found executeJob usage(s)')
    else console.warn('list_code_usages: no executeJob symbol found (non-fatal)')
  } catch (err) {
    console.warn('list_code_usages: grep failed (non-fatal):', err?.message ?? err)
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
