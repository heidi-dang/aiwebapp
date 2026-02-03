import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    const runnerUrl = process.env.RUNNER_URL ?? 'http://localhost:8788'
    return [
      {
        source: '/runner/:path*',
        destination: `${runnerUrl}/:path*`,
      },
    ]
  },
}

export default nextConfig
