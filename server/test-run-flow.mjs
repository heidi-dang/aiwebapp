import { open } from 'node:fs/promises'

const base = 'http://localhost:4001'

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
    console.log('Testing Agent Run Flow...')

    // 1. Get an agent to run against
    console.log('Fetching agents...')
    const agentsRes = await fetch(`${base}/agents`)
    if (!agentsRes.ok) throw new Error(`Failed to fetch agents: ${agentsRes.status}`)
    const agents = await agentsRes.json()
    if (agents.length === 0) throw new Error('No agents found to test with')
    const agentId = agents[0].id
    console.log(`Using agent: ${agentId}`)

    // 2. Create Run via Server API (New Pattern)
    console.log('Creating run...')
    const runRes = await fetch(`${base}/agents/${agentId}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello verification' })
    })

    if (!runRes.ok) {
        const text = await runRes.text()
        throw new Error(`Failed to create run: ${runRes.status} ${text}`)
    }

    const runData = await runRes.json()
    console.log('Run created:', runData)

    if (!runData.jobId) throw new Error('No jobId returned')
    if (!runData.sessionId) throw new Error('No sessionId returned')

    // 3. Connect to Event Stream (New Pattern)
    console.log(`Connecting to event stream for job ${runData.jobId}...`)
    const eventsUrl = `${base}/api/runs/${runData.jobId}/events`
    
    // We use fetch to simulate SSE connection since native EventSource in Node is not standard
    const eventsRes = await fetch(eventsUrl)
    if (!eventsRes.ok) {
        const text = await eventsRes.text()
        throw new Error(`Failed to connect to events: ${eventsRes.status} ${text}`)
    }

    if (!eventsRes.body) throw new Error('No event body')

    const reader = eventsRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let eventCount = 0

    const readStream = async () => {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6)
                    try {
                        const event = JSON.parse(data)
                        // console.log('Received event:', event.type)
                        eventCount++
                        if (event.type === 'done') return
                    } catch (e) {
                        // ignore
                    }
                }
            }
        }
    }

    // Set a timeout
    const timeout = setTimeout(() => {
        console.error('Timeout waiting for events')
        process.exit(1)
    }, 30000)

    await readStream()
    clearTimeout(timeout)

    console.log(`Successfully received ${eventCount} events.`)
    console.log('Verification PASSED.')
}

main().catch(err => {
    console.error('Verification FAILED:', err)
    process.exit(1)
})
