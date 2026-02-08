import dotenv from 'dotenv'
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import fs from 'fs';
import Fastify from 'fastify'
import cors from '@fastify/cors'

import { InMemoryStore, SqliteStore, Store } from './storage.js'
import { registerHealthRoutes } from './routes/health.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerTeamRoutes } from './routes/teams.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerRunRoutes } from './routes/runs.js';
import memoryRoutes from './routes/memory.js';
import knowledgeRoutes from './routes/knowledge.js';
import createAuthRoutes from './routes/auth.js';

const PORT = Number(process.env.PORT ?? 7777)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000'
const EXTRA_ORIGINS = [
  'https://heidiai.com.au',
  'https://www.heidiai.com.au',
  'https://api.heidiai.com.au'
]

const logFilePath = path.join(__dirname, '../../logs/server.log');
fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const app = Fastify({
  logger: {
    stream: logStream
  }
})

async function main() {
  const sqlitePath = process.env.SQLITE_PATH
  const store: Store = sqlitePath ? await SqliteStore.create(sqlitePath) : new InMemoryStore()

  const allowedOrigins = [CORS_ORIGIN, ...EXTRA_ORIGINS]
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (allowedOrigins.includes(origin)) return cb(null, true)
      return cb(new Error('CORS origin not allowed'), false)
    }
  })

  // Removed app.register calls and integrated routes directly
  await registerHealthRoutes(app);
  await registerAgentRoutes(app, store);
  await registerTeamRoutes(app, store);
  await registerSessionRoutes(app, store);
  await registerRunRoutes(app, store);

  await app.register(createAuthRoutes(store), { prefix: '/auth' })
  await app.register(memoryRoutes, { prefix: '/memory' })
  await app.register(knowledgeRoutes, { prefix: '/knowledge' })

  // Register toolbox routes for UI-driven tools (internal)
  const { registerToolboxRoutes } = await import('./routes/toolbox.js')
  await registerToolboxRoutes(app)

  console.log('RUNNER_URL:', process.env.RUNNER_URL);

  // Start the server
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`Server is running on http://0.0.0.0:${PORT}`)
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
