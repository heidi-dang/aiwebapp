export function requireOptionalBearerAuth(req, res) {
    const securityKey = process.env.OS_SECURITY_KEY;
    if (!securityKey)
        return;
    const authHeader = req.headers.authorization;
    const expected = `Bearer ${securityKey}`;
    if (!authHeader || authHeader !== expected) {
        res.status(401).json({ detail: 'Unauthorized' });
    }
}
