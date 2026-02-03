import { requireOptionalBearerAuth } from '../auth.js';
export async function registerTeamRoutes(app, store) {
    app.get('/teams', async (req, reply) => {
        requireOptionalBearerAuth(req, reply);
        if (reply.sent)
            return;
        return store.teams;
    });
}
