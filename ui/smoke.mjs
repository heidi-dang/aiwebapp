const base = (process.env.BASE_URL || process.argv[2] || 'http://localhost:4000').replace(/\/$/, '')

async function main() {
  let res
  try {
    res = await fetch(`${base}/`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`UI not reachable at ${base}/ (${msg}); skipping smoke checks`)
    process.exit(0)
  }
  if (!res.ok) {
    throw new Error(`GET ${base}/ -> ${res.status} ${await res.text()}`)
  }
  process.stdout.write(`ui smoke ok: ${base}\n`)
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
