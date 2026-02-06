import dotenv from 'dotenv'
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'

import { InMemoryStore, SqliteStore, Store } from './storage.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerAgentRoutes } from './routes/agents.js'
import { registerTeamRoutes } from './routes/teams.js'
import { registerSessionRoutes } from './routes/sessions.js'
import { registerRunRoutes } from './routes/runs.js'
import authRoutes from './routes/auth.js'

const PORT = Number(process.env.PORT ?? 7777)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000'
const EXTRA_ORIGINS = [
  'https://heidiai.com.au',
  'https://www.heidiai.com.au',
  'https://api.heidiai.com.au'
]

async function main() {
  const app = Fastify({
    logger: true
  })

  app.setErrorHandler((error, req, reply) => {
    req.log.error({ err: error }, 'Unhandled error')
    const message = error instanceof Error ? error.message : String(error)
    reply.code(500).send({ detail: message })
  })

  // Temporarily disable CORS and multipart for debugging
  // await app.register(cors);
  // await app.register(multipart);

  app.log.info('Verbose logging enabled for debugging.');
  app.addHook('onRequest', async (request) => {
    app.log.info(`Incoming request: ${request.method} ${request.url}`);
  });

  const sqlitePath = process.env.SQLITE_PATH
  const store: Store = sqlitePath ? await SqliteStore.create(sqlitePath) : new InMemoryStore()

  // Temporarily register only the /health route for debugging
  await registerHealthRoutes(app);
  app.log.info('Only health route registered for debugging.');

  // Comment out other route registrations
  // await registerAgentRoutes(app, store);
  // await registerTeamRoutes(app, store);
  // await registerSessionRoutes(app, store);
  // await registerRunRoutes(app, store);
  // await app.register(authRoutes);
  // const { registerToolboxRoutes } = await import('./routes/toolbox.js');
  // await registerToolboxRoutes(app);

  console.log('RUNNER_URL:', process.env.RUNNER_URL);

  await app.listen({ port: PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
