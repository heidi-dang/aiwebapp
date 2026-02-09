#!/usr/bin/env node
import fetch from 'node-fetch'

const RUNNER_URL = process.env.RUNNER_URL || process.env.NEXT_PUBLIC_RUNNER_URL || 'http://localhost:4002'
const TOKEN = process.env.RUNNER_TOKEN || 'change_me'

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`
  }
}

async function createJob(message) {
  const res = await fetch(`${RUNNER_URL}/api/jobs`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ input: { message } })
  })
  if (!res.ok) throw new Error(`createJob failed ${res.status}`)
  return res.json()
}

async function startJob(id) {
  const h = { Authorization: `Bearer ${TOKEN}` }
  const res = await fetch(`${RUNNER_URL}/api/jobs/${encodeURIComponent(id)}/start`, {
    method: 'POST',
    headers: h
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>')
    throw new Error(`startJob failed ${res.status}: ${txt}`)
  }
  return res.json()
}

async function getJob(id) {
  const res = await fetch(`${RUNNER_URL}/api/jobs/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: headers()
  })
  if (!res.ok) throw new Error(`getJob failed ${res.status}`)
  return res.json()
}

async function main() {
  console.log('Runner URL:', RUNNER_URL)
  const { id } = await createJob('smoke test message')
  console.log('Created job', id)
  await startJob(id)
  console.log('Started job', id)

  let attempts = 0
  while (attempts < 200) {
    const job = await getJob(id)
    console.log('status=', job.status)
    if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled' || job.status === 'timeout') {
      console.log('Final job:', JSON.stringify(job, null, 2))
      return
    }
    attempts++
    await new Promise((r) => setTimeout(r, 200))
  }
  console.error('Job did not complete in time')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
