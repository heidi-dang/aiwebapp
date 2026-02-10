import Fastify from 'fastify'
import cors from '@fastify/cors'
import dotenv from 'dotenv'
import { browserManager } from './browser.js'

dotenv.config()

const fastify = Fastify({
  logger: true
})

await fastify.register(cors, {
  origin: true
})

fastify.get('/health', async () => {
  const browserOk = await browserManager.healthCheck()
  return { 
    status: browserOk ? 'ok' : 'degraded', 
    service: 'browser-proxy',
    browser: browserOk ? 'connected' : 'disconnected'
  }
})

// Debug endpoint to take a screenshot (useful for login verification)
fastify.get('/debug/screenshot', async (req, reply) => {
  try {
    const page = await browserManager.getPage()
    const buffer = await page.screenshot({ fullPage: false })
    reply.type('image/png').send(buffer)
  } catch (err) {
    reply.status(500).send({ error: String(err) })
  }
})

const start = async () => {
  try {
    // Initialize browser on startup
    await browserManager.init()

    const port = Number(process.env.PORT) || 3003
    await fastify.listen({ port, host: '0.0.0.0' })
    console.log(`Browser Proxy listening on ${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
