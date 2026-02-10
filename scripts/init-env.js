const fs = require('node:fs')
const path = require('node:path')

function ensureFile(destPath, srcPath) {
  if (fs.existsSync(destPath)) return false
  if (!fs.existsSync(srcPath)) return false
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.copyFileSync(srcPath, destPath)
  return true
}

function main() {
  const root = path.resolve(process.cwd())

  const ops = [
    { src: path.join(root, 'server', '.env.example'), dest: path.join(root, 'server', '.env') },
    { src: path.join(root, 'runner', '.env.example'), dest: path.join(root, 'runner', '.env') },
    { src: path.join(root, 'ui', '.env.example'), dest: path.join(root, 'ui', '.env.local') }
  ]

  const results = ops.map((op) => ({ ...op, created: ensureFile(op.dest, op.src) }))
  const created = results.filter((r) => r.created)

  if (created.length === 0) {
    process.stdout.write('init:env: nothing to do\n')
    return
  }

  for (const c of created) {
    process.stdout.write(`init:env: created ${path.relative(root, c.dest)} from ${path.relative(root, c.src)}\n`)
  }
}

main()
