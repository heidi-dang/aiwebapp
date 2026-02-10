import dotenv from 'dotenv'
import dotenvExpand from 'dotenv-expand'
const envConfig = dotenv.config({ path: '../.env' })
dotenvExpand.expand(envConfig)

const BASE_URL = process.env.RUNNER_BASE_URL ?? `http://localhost:${process.env.RUNNER_PORT ?? 4002}`
const TOKEN = process.env.RUNNER_TOKEN

if (!TOKEN) {
  console.warn('RUNNER_TOKEN not provided; skipping runner smoke checks')
  process.exit(0)
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
  let health
  try {
    health = await fetch(`${BASE_URL}/health`)
  } catch (e) {
    console.warn(`Runner not reachable at ${BASE_URL} (${e.message}); skipping smoke checks`)
    process.exit(0)
  }
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

  const sleepCreateRes = await req('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({ input: { provider: 'sleep', sleep_ms: 30000 }, timeout_ms: 60000 })
  })
  if (!sleepCreateRes.ok) throw new Error(`create sleep job failed: ${sleepCreateRes.status}`)
  const sleepCreated = await sleepCreateRes.json()
  if (!sleepCreated?.id) throw new Error('create sleep job missing id')

  const sleepStartRes = await req(`/api/jobs/${encodeURIComponent(sleepCreated.id)}/start`, {
    method: 'POST'
  })
  if (!sleepStartRes.ok) throw new Error(`start sleep job failed: ${sleepStartRes.status}`)

  await new Promise((r) => setTimeout(r, 500))

  const cancelRes = await req(`/api/jobs/${encodeURIComponent(sleepCreated.id)}/cancel`, {
    method: 'POST'
  })
  if (!cancelRes.ok) throw new Error(`cancel sleep job failed: ${cancelRes.status}`)

  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const statusRes = await req(`/api/jobs/${encodeURIComponent(sleepCreated.id)}`, {
      method: 'GET'
    })
    if (!statusRes.ok) throw new Error(`get sleep job failed: ${statusRes.status}`)
    const status = await statusRes.json()
    if (status.status === 'cancelled') {
      console.log('runner smoke: ok')
      return
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  throw new Error('Emergency stop failed: job did not reach cancelled state in time')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
