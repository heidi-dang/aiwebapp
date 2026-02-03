export function requireOptionalBearerAuth(req, reply) {
    const securityKey = process.env.OS_SECURITY_KEY;
    if (!securityKey)
        return;
    const authHeader = req.headers.authorization;
    const expected = `Bearer ${securityKey}`;
    if (!authHeader || authHeader !== expected) {
        reply.code(401).send({ detail: 'Unauthorized' });
    }
}
