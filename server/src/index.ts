import { tracingService } from './tracing.js';
tracingService.start();

import dotenv from 'dotenv'
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';

import { InMemoryStore, SqliteStore, Store } from './storage.js'
import { registerHealthRoutes } from './routes/health.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerTeamRoutes } from './routes/teams.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerRunRoutes } from './routes/runs.js';
import authRoutes from './routes/auth.js';
import memoryRoutes from './routes/memory.js';
import { registerKnowledgeRoutes } from './routes/knowledge.js';
import { registerGuardrailRoutes } from './routes/guardrails.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerSkillsRoutes } from './routes/skills.js';
import { registerEvaluationRoutes } from './routes/evaluation.js';
import { registerTracingRoutes } from './routes/tracing.js';
import { registerReasoningRoutes } from './routes/reasoning.js';
import createOpenAIRoutes from './routes/openai.js';

const PORT = Number(process.env.PORT ?? 3001)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000'
const EXTRA_ORIGINS = [
  'https://heidiai.com.au',
  'https://www.heidiai.com.au',
  'https://api.heidiai.com.au'
]

const logFilePath = path.join(__dirname, '../../logs/server.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const app = express();

// Middleware
app.use(
  cors({
    origin: [CORS_ORIGIN, ...EXTRA_ORIGINS],
    credentials: true
  })
);
app.use(bodyParser.json());

// Health route
app.get('/health', (req: any, res: any) => {
  res.status(200).json({ status: 'ok' });
});

async function main() {
  const sqlitePath = process.env.SQLITE_PATH
  const store: Store = sqlitePath ? await SqliteStore.create(sqlitePath) : new InMemoryStore()

  // Removed app.register calls and integrated routes directly
  registerHealthRoutes(app);
  registerAgentRoutes(app, store);
  registerTeamRoutes(app, store);
  registerSessionRoutes(app, store);
  registerRunRoutes(app, store);

  // Register additional routes
  app.use('/auth', authRoutes(store));
  app.use('/memory', memoryRoutes);
  registerKnowledgeRoutes(app, store);
  registerGuardrailRoutes(app, store);
  registerJobRoutes(app, store);
  registerSkillsRoutes(app, store);
  registerEvaluationRoutes(app, store);
  registerTracingRoutes(app, store);
  registerReasoningRoutes(app, store);

  app.use('/v1', createOpenAIRoutes(store));

  // Register toolbox routes for UI-driven tools (internal)
  const { registerToolboxRoutes } = await import('./routes/toolbox.js')
  await registerToolboxRoutes(app, store)

  console.log('RUNNER_URL:', process.env.RUNNER_URL);

  // Start the server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
