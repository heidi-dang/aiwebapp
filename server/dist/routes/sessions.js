import { requireOptionalBearerAuth } from '../auth.js';
import { z } from 'zod';
import { sessionCache } from '../session_cache.js';
const renameSessionSchema = z.object({
    name: z.string().min(1).max(100)
});
const sessionStateSchema = z.object({
    state: z.record(z.any())
});
export async function registerSessionRoutes(app, store) {
    app.get('/sessions', async (req, res) => {
        requireOptionalBearerAuth(req, res);
        if (res.headersSent)
            return;
        const sessions = await store.listAllSessions();
        res.json(sessions);
    });
    app.get('/sessions/:id', async (req, res) => {
        requireOptionalBearerAuth(req, res);
        if (res.headersSent)
            return;
        const session = await store.getSession(req.params.id);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        res.json(session);
    });
    app.patch('/sessions/:id/rename', async (req, res) => {
        requireOptionalBearerAuth(req, res);
        if (res.headersSent)
            return;
        const parsed = renameSessionSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid session name', details: parsed.error.errors });
            return;
        }
        const session = await store.getSession(req.params.id);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        await store.updateSessionName(req.params.id, parsed.data.name);
        res.json({ success: true, name: parsed.data.name });
    });
    app.get('/sessions/:id/state', async (req, res) => {
        requireOptionalBearerAuth(req, res);
        if (res.headersSent)
            return;
        const session = await store.getSession(req.params.id);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const state = await store.getSessionState(req.params.id);
        res.json({ state: state || {} });
    });
    app.patch('/sessions/:id/state', async (req, res) => {
        requireOptionalBearerAuth(req, res);
        if (res.headersSent)
            return;
        const parsed = sessionStateSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid session state', details: parsed.error.errors });
            return;
        }
        const session = await store.getSession(req.params.id);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        await store.updateSessionState(req.params.id, parsed.data.state);
        res.json({ success: true, state: parsed.data.state });
    });
    app.get('/sessions/cache/stats', async (req, res) => {
        requireOptionalBearerAuth(req, res);
        if (res.headersSent)
            return;
        const stats = sessionCache.getStats();
        res.json(stats);
    });
}
