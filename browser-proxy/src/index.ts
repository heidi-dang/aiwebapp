import Fastify from 'fastify'
import cors from '@fastify/cors'
import dotenv from 'dotenv'

dotenv.config()

const fastify = Fastify({
  logger: true
})

await fastify.register(cors, {
  origin: true
})

fastify.get('/health', async () => {
  return { status: 'ok', service: 'browser-proxy' }
})

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3003
    await fastify.listen({ port, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
