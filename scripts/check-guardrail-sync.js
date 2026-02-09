const fs = require('node:fs')
const path = require('node:path')

function normalize(text) {
  return text.replace(/\r\n/g, '\n').trimEnd() + '\n'
}

function main() {
  const root = process.cwd()
  const serverPath = path.join(root, 'server', 'src', 'guardrail_service.ts')
  const runnerPath = path.join(root, 'runner', 'src', 'guardrail_service.ts')

  const server = normalize(fs.readFileSync(serverPath, 'utf8'))
  const runner = normalize(fs.readFileSync(runnerPath, 'utf8'))

  if (server !== runner) {
    process.stderr.write('guardrail_service.ts is out of sync between server and runner\n')
    process.stderr.write(`- ${serverPath}\n- ${runnerPath}\n`)
    process.exit(1)
  }
}

main()

