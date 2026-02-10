import dotenv from 'dotenv'
import { expand } from 'dotenv-expand'
import type { NextConfig } from 'next'
import path from 'path'

const env = dotenv.config({ path: '../.env' })
expand(env)

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  outputFileTracingRoot: path.join(__dirname),
  allowedDevOrigins: [],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '**' },
      { protocol: 'https', hostname: '**' }
    ]
  },
  async rewrites() {
    const runnerUrl = process.env.RUNNER_URL ?? 'http://localhost:4002'
    return [
      {
        source: '/runner/:path*',
        destination: `${runnerUrl}/:path*`
      }
    ]
  }
}

export default nextConfig
