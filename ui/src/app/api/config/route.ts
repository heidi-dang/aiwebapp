export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = {
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
    runnerBaseUrl: process.env.RUNNER_BASE_URL ?? 'http://localhost:8788',
    hasEnvToken: !!process.env.NEXT_PUBLIC_OS_SECURITY_KEY
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
