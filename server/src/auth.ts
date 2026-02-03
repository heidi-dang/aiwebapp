import { FastifyReply, FastifyRequest } from 'fastify'

export function requireOptionalBearerAuth(
  req: FastifyRequest,
  reply: FastifyReply
): void {
  const securityKey = process.env.OS_SECURITY_KEY
  if (!securityKey) return

  const authHeader = req.headers.authorization
  const expected = `Bearer ${securityKey}`
  if (!authHeader || authHeader !== expected) {
    reply.code(401).send({ detail: 'Unauthorized' })
  }
}
