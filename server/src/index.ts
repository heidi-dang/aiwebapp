import dotenv from 'dotenv'
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fs from 'fs';

import { InMemoryStore, SqliteStore, Store } from './storage.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerAgentRoutes } from './routes/agents.js'
import { registerTeamRoutes } from './routes/teams.js'
import { registerSessionRoutes } from './routes/sessions.js'
import { registerRunRoutes } from './routes/runs.js'
import authRoutes from './routes/auth.js'
import memoryRoutes from './routes/memory.js'
import knowledgeRoutes from './routes/knowledge.js'

const PORT = Number(process.env.PORT ?? 7777)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000'
const EXTRA_ORIGINS = [
  'https://heidiai.com.au',
  'https://www.heidiai.com.au',
  'https://api.heidiai.com.au'
]

const logFilePath = path.join(__dirname, '../../logs/server.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

async function main() {
  const app = Fastify({
    logger: {
      stream: logStream,
      level: 'info',
    },
  })

  app.setErrorHandler((error, req, reply) => {
    req.log.error({ err: error }, 'Unhandled error')
    const message = error instanceof Error ? error.message : String(error)
    reply.code(500).send({ detail: message })
  })

  await app.register(cors, {
    origin: (origin, cb) => {
      const allowlist = new Set([
        CORS_ORIGIN,
        'http://localhost:3000',
        'http://localhost:3001',
        ...EXTRA_ORIGINS
      ])

      if (!origin) {
        cb(null, true)
        return
      }

      cb(null, allowlist.has(origin))
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })

  await app.register(multipart, {
    limits: {
      fieldSize: 1024 * 1024
    }
  })

  const sqlitePath = process.env.SQLITE_PATH
  const store: Store = sqlitePath ? await SqliteStore.create(sqlitePath) : new InMemoryStore()

  await registerHealthRoutes(app)
  await registerAgentRoutes(app, store)
  await registerTeamRoutes(app, store)
  await registerSessionRoutes(app, store)
  await registerRunRoutes(app, store)
  // Register the auth routes
  await app.register(authRoutes)
  // Register toolbox routes for UI-driven tools (internal)
  const { registerToolboxRoutes } = await import('./routes/toolbox.js')
  await registerToolboxRoutes(app)
  // Register memory routes
  await app.register(memoryRoutes)
  // Register knowledge routes
  await app.register(knowledgeRoutes)

  console.log('RUNNER_URL:', process.env.RUNNER_URL);

  await app.listen({ port: PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
