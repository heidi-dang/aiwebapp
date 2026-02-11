import assert from 'node:assert/strict'

import { normalizeOllamaBaseUrl } from '../dist/llm/providers/ollama.js'

assert.equal(
  normalizeOllamaBaseUrl('http://localhost:11434'),
  'http://localhost:11434'
)
assert.equal(
  normalizeOllamaBaseUrl('http://localhost:11434/'),
  'http://localhost:11434'
)
assert.equal(
  normalizeOllamaBaseUrl('http://localhost:11434/api'),
  'http://localhost:11434'
)
assert.equal(
  normalizeOllamaBaseUrl('http://localhost:11434/api/'),
  'http://localhost:11434'
)

assert.equal(
  normalizeOllamaBaseUrl(''),
  ''
)
assert.equal(
  normalizeOllamaBaseUrl('   '),
  ''
)
assert.equal(
  normalizeOllamaBaseUrl('http://localhost:11434///'),
  'http://localhost:11434'
)

console.log('ollama url normalization: ok')

