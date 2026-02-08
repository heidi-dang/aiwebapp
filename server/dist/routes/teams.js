import { requireOptionalBearerAuth } from '../auth.js';
export async function registerTeamRoutes(app, store) {
    app.get('/teams', async (req, res) => {
        requireOptionalBearerAuth(req, res);
        if (res.headersSent)
            return;
        res.json(store.teams);
    });
}
