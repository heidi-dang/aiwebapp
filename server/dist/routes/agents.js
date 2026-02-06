import { requireOptionalBearerAuth } from '../auth.js';
export async function registerAgentRoutes(app, store) {
    app.get('/agents', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        console.log('Agents data:', store.agents);
        return store.agents;
    });
}
