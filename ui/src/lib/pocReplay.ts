'use client'

export function base64UrlEncodeUtf8(text: string) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const b64 = btoa(binary)
  return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function base64UrlDecodeUtf8(base64Url: string) {
  const b64 = base64Url.replaceAll('-', '+').replaceAll('_', '/')
  const padLen = (4 - (b64.length % 4)) % 4
  const padded = b64 + '='.repeat(padLen)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

export type PocReplayClaim = {
  id: string
  statement: string
  ok: boolean
  weight: number
}

export type PocReplayArtifact = {
  version: number
  jobId: string
  createdAt: number
  proof_hash: string
  claims: PocReplayClaim[]
}

export function buildReplayArtifact(params: {
  jobId: string
  proofHash: string
  claims: PocReplayClaim[]
  createdAt?: number
}): PocReplayArtifact {
  return {
    version: 1,
    jobId: params.jobId,
    createdAt: params.createdAt ?? Math.floor(Date.now() / 1000),
    proof_hash: params.proofHash,
    claims: params.claims
  }
}

