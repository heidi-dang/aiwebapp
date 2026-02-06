import 'dotenv/config'

const BASE_URL = process.env.RUNNER_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8788}`
const TOKEN = process.env.RUNNER_TOKEN

if (!TOKEN) {
  console.error('Missing RUNNER_TOKEN for runner smoke test')
  process.exit(2)
}

console.log('Using BASE_URL:', BASE_URL);
console.log('Using TOKEN:', TOKEN);

async function req(path, opts = {}) {
  const headers = {
    ...(opts.headers ?? {}),
    Authorization: `Bearer ${TOKEN}`
  }

  if (opts.body) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers
  })

  return res
}

async function main() {
  const health = await fetch(`${BASE_URL}/health`)
  if (!health.ok) throw new Error(`runner health failed: ${health.status}`)

  const createRes = await req('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({ input: { smoke: true }, timeout_ms: 2000 })
  })
  if (!createRes.ok) throw new Error(`create job failed: ${createRes.status}`)
  const created = await createRes.json()
  if (!created?.id) throw new Error('create job missing id')

  const startRes = await req(`/api/jobs/${encodeURIComponent(created.id)}/start`, {
    method: 'POST'
  })
  if (!startRes.ok) throw new Error(`start job failed: ${startRes.status}`)

  const getRes = await req(`/api/jobs/${encodeURIComponent(created.id)}`, {
    method: 'GET'
  })
  if (!getRes.ok) throw new Error(`get job failed: ${getRes.status}`)

  console.log('runner smoke: ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
