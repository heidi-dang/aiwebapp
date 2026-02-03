const base = (process.env.BASE_URL || process.argv[2] || 'http://localhost:3001').replace(/\/$/, '')

async function check(path, opts) {
  const url = `${base}${path}`
  const res = await fetch(url, opts)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${opts?.method || 'GET'} ${url} -> ${res.status} ${text}`)
  }
  return text
}

async function main() {
  await check('/health')
  const agents = JSON.parse(await check('/agents'))
  const teams = JSON.parse(await check('/teams'))

  if (!Array.isArray(agents) || agents.length === 0) {
    throw new Error('Expected /agents to return a non-empty array')
  }
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error('Expected /teams to return a non-empty array')
  }

  const agent = agents[0]
  if (agent?.db_id) {
    const url = new URL(`${base}/sessions`)
    url.searchParams.set('type', 'agent')
    url.searchParams.set('component_id', agent.id)
    url.searchParams.set('db_id', agent.db_id)
    const res = await fetch(url.toString())
    if (!res.ok) {
      throw new Error(`GET ${url.toString()} -> ${res.status} ${await res.text()}`)
    }
    const data = await res.json()
    if (!data || !('data' in data) || !Array.isArray(data.data)) {
      throw new Error('Expected /sessions to return { data: [...] }')
    }
  }

  process.stdout.write(`smoke ok: ${base}\n`)
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
