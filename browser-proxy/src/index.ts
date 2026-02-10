import Fastify from 'fastify'
import cors from '@fastify/cors'
import dotenv from 'dotenv'
import { browserManager } from './browser.js'
import { ChatGPTClient } from './chatgpt.js'

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

// OpenAI-compatible chat completion endpoint
fastify.post('/v1/chat/completions', async (req, reply) => {
  const { messages, model, stream } = req.body as any
  const lastMessage = messages[messages.length - 1]?.content

  if (!lastMessage) {
    return reply.status(400).send({ error: 'No message provided' })
  }

  try {
    const page = await browserManager.getPage()
    const client = new ChatGPTClient(page)
    
    await client.navigate()
    
    if (!await client.isLoggedIn()) {
      return reply.status(503).send({ 
        error: 'Browser not logged in', 
        code: 'NEEDS_AUTH',
        message: 'Please log in manually via the debug view'
      })
    }

    await client.sendMessage(lastMessage, model)

    if (stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      })

      for await (const chunk of client.streamResponse()) {
        const event = {
          id: 'chatcmpl-' + Date.now(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: model || 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: chunk },
            finish_reason: null
          }]
        }
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      }

      reply.raw.write('data: [DONE]\n\n')
      reply.raw.end()
    } else {
      // Non-streaming: wait for full response
      let fullText = ''
      for await (const chunk of client.streamResponse()) {
        fullText += chunk
      }
      return {
        id: 'chatcmpl-' + Date.now(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'gpt-4',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: fullText },
          finish_reason: 'stop'
        }]
      }
    }
  } catch (err) {
    req.log.error(err)
    return reply.status(500).send({ error: String(err) })
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
