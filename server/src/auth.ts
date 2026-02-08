export function requireOptionalBearerAuth(
  req: any,
  res: any
): void {
  const securityKey = process.env.OS_SECURITY_KEY
  if (!securityKey) return

  const headers = req?.headers
  const authHeader =
    (headers && typeof headers === 'object' && 'authorization' in headers ? headers.authorization : undefined) ??
    (headers && typeof headers?.get === 'function' ? headers.get('authorization') : undefined)
  const expected = `Bearer ${securityKey}`
  if (!authHeader || authHeader !== expected) {
    res.status(401).json({ detail: 'Unauthorized' })
  }
}
