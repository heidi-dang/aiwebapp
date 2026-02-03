import { requireOptionalBearerAuth } from '../auth.js';
function isEntityType(value) {
    return value === 'agent' || value === 'team';
}
export async function registerSessionRoutes(app, store) {
    app.get('/sessions', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        const { type, component_id, db_id } = req.query;
        if (!isEntityType(type) || !component_id || !db_id) {
            reply.code(400);
            return { detail: 'Missing or invalid query params' };
        }
        const data = await store.listSessions({ dbId: db_id, entityType: type, componentId: component_id });
        return { data };
    });
    app.get('/sessions/:sessionId/runs', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        const { sessionId } = req.params;
        const { type, db_id } = req.query;
        if (!isEntityType(type) || !db_id) {
            reply.code(400);
            return { detail: 'Missing or invalid query params' };
        }
        // For MVP we infer the component_id from the stored session lists by scanning.
        // The UI only needs the runs array and will map it into chat messages.
        const componentId = await findComponentIdForSession(store, { dbId: db_id, entityType: type, sessionId });
        if (!componentId)
            return [];
        return await store.getRuns({ dbId: db_id, entityType: type, componentId, sessionId });
    });
    app.delete('/sessions/:sessionId', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        const { sessionId } = req.params;
        const { db_id } = req.query;
        if (!db_id) {
            reply.code(400);
            return { detail: 'Missing db_id' };
        }
        // Deleting sessions from the UI is currently only used for agent sessions.
        // We'll attempt delete across both entity types and seeded component IDs.
        const deleted = await tryDeleteSession(store, { dbId: db_id, sessionId });
        if (!deleted)
            reply.code(404);
        return { ok: deleted };
    });
    // Compatibility route for UI typo (double slash in /v1//...)
    app.delete('/v1//teams/:teamId/sessions/:sessionId', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        const { teamId, sessionId } = req.params;
        // Team delete route in UI does not include db_id. Use seeded team db_id.
        const team = store.teams.find((t) => t.id === teamId);
        const dbId = team?.db_id;
        if (!dbId) {
            reply.code(404);
            return { detail: 'Team not found' };
        }
        const deleted = await store.deleteSession({ dbId, entityType: 'team', componentId: teamId, sessionId });
        if (!deleted)
            reply.code(404);
        return { ok: deleted };
    });
    // Some clients normalize multiple slashes, so the UI typo may arrive as /v1/teams/...
    app.delete('/v1/teams/:teamId/sessions/:sessionId', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        const { teamId, sessionId } = req.params;
        // Team delete route in UI does not include db_id. Use seeded team db_id.
        const team = store.teams.find((t) => t.id === teamId);
        const dbId = team?.db_id;
        if (!dbId) {
            reply.code(404);
            return { detail: 'Team not found' };
        }
        const deleted = await store.deleteSession({ dbId, entityType: 'team', componentId: teamId, sessionId });
        if (!deleted)
            reply.code(404);
        return { ok: deleted };
    });
}
async function findComponentIdForSession(store, args) {
    const entityList = args.entityType === 'agent' ? store.agents : store.teams;
    for (const entity of entityList) {
        const componentId = entity.id;
        const sessions = await store.listSessions({ dbId: args.dbId, entityType: args.entityType, componentId });
        if (sessions.some((s) => s.session_id === args.sessionId))
            return componentId;
    }
    return null;
}
async function tryDeleteSession(store, args) {
    for (const agent of store.agents) {
        if (await store.deleteSession({ dbId: args.dbId, entityType: 'agent', componentId: agent.id, sessionId: args.sessionId })) {
            return true;
        }
    }
    for (const team of store.teams) {
        if (await store.deleteSession({ dbId: args.dbId, entityType: 'team', componentId: team.id, sessionId: args.sessionId })) {
            return true;
        }
    }
    return false;
}
