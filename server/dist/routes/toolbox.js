import { requireOptionalBearerAuth } from '../auth.js';
export async function registerToolboxRoutes(app, store) {
    app.get('/toolbox', async (req, res) => {
        requireOptionalBearerAuth(req, res);
        if (res.headersSent)
            return;
        res.json(store.toolbox);
    });
}
