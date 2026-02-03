const base = (process.env.BASE_URL || process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')

async function main() {
  const res = await fetch(`${base}/`)
  if (!res.ok) {
    throw new Error(`GET ${base}/ -> ${res.status} ${await res.text()}`)
  }
  process.stdout.write(`ui smoke ok: ${base}\n`)
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
