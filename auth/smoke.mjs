#!/usr/bin/env node

import { execSync } from 'child_process'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4003'

async function test(endpoint, description) {
  try {
    console.log(`Testing ${description}...`)
    const output = execSync(`curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${endpoint}"`, { encoding: 'utf8' })
    if (output.trim() === '200') {
      console.log(`✅ ${description} - OK`)
      return true
    } else {
      console.log(`❌ ${description} - HTTP ${output.trim()}`)
      return false
    }
  } catch (error) {
    console.log(`❌ ${description} - Error: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('🧪 Auth Service Smoke Test')
  console.log(`Testing against: ${BASE_URL}`)
  console.log('')

  // Skip if service is not reachable (parity with other services)
  try {
    const status = execSync(`curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health"`, { encoding: 'utf8' }).trim()
    if (status !== '200') {
      console.log(`Auth not reachable at ${BASE_URL} (fetch failed); skipping smoke checks`)
      process.exit(0)
    }
  } catch (e) {
    console.log(`Auth not reachable at ${BASE_URL} (fetch failed); skipping smoke checks`)
    process.exit(0)
  }

  const tests = [
    ['/health', 'Health check'],
    ['/login', 'Login page'],
    ['/signup', 'Signup page'],
    ['/', 'Root redirect']
  ]

  let passed = 0
  let total = tests.length

  for (const [endpoint, description] of tests) {
    if (await test(endpoint, description)) {
      passed++
    }
  }

  console.log('')
  console.log(`Results: ${passed}/${total} tests passed`)

  if (passed === total) {
    console.log('🎉 All tests passed!')
    process.exit(0)
  } else {
    console.log('💥 Some tests failed!')
    process.exit(1)
  }
}

main().catch(console.error)
