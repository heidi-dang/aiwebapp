import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import { InMemoryStore, SqliteStore } from './storage.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerTeamRoutes } from './routes/teams.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerRunRoutes } from './routes/runs.js';
import authRoutes from './routes/auth.js';
import memoryRoutes from './routes/memory.js';
import knowledgeRoutes from './routes/knowledge.js';
const PORT = Number(process.env.PORT ?? 7777);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
const EXTRA_ORIGINS = [
    'https://heidiai.com.au',
    'https://www.heidiai.com.au',
    'https://api.heidiai.com.au'
];
const logFilePath = path.join(__dirname, '../../logs/server.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
const app = express();
// Middleware
app.use(cors());
app.use(bodyParser.json());
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
async function main() {
    const sqlitePath = process.env.SQLITE_PATH;
    const store = sqlitePath ? await SqliteStore.create(sqlitePath) : new InMemoryStore();
    await registerAgentRoutes(app, store);
    await registerTeamRoutes(app, store);
    await registerSessionRoutes(app, store);
    await registerRunRoutes(app, store);
    // Register the auth routes
    await app.register(authRoutes);
    // Register toolbox routes for UI-driven tools (internal)
    const { registerToolboxRoutes } = await import('./routes/toolbox.js');
    await registerToolboxRoutes(app);
    // Register memory routes
    await app.register(memoryRoutes);
    // Register knowledge routes
    await app.register(knowledgeRoutes);
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
