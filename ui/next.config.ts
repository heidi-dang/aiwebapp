require('dotenv').config({ path: '../.env' })
require('dotenv-expand').config()

import type { NextConfig } from 'next'
import path from 'path'

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
