import { Router } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { z } from 'zod'

import type { Store } from '../storage.js'
import type { User } from '../types.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8)
})

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'default_secret'
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 2) return false
  const [saltHex, keyHex] = parts
  const salt = Buffer.from(saltHex, 'hex')
  const key = Buffer.from(keyHex, 'hex')
  const derived = crypto.scryptSync(password, salt, key.length)
  return crypto.timingSafeEqual(key, derived)
}

function toSafeUser(user: User): User {
  const { hashed_password: _hp, ...safe } = user
  return safe
}

export default function authRoutes(store: Store) {
  const router = Router()

  router.post('/register', async (req: any, res: any) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' })
    }

    const { email, name, password } = parsed.data
    const existing = await store.getUserByEmail(email)
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    const hashed = hashPassword(password)
    const user = await store.createUser(email, name, hashed)
    await store.updateUserLastLogin(user.id)

    const access_token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: '1h' }
    )

    return res.status(201).json({
      access_token,
      refresh_token: '',
      user: toSafeUser(user)
    })
  })

  router.post('/login', async (req: any, res: any) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' })
    }

    const { email, password } = parsed.data
    const user = await store.getUserByEmail(email)
    if (!user?.hashed_password) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const ok = verifyPassword(password, user.hashed_password)
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    await store.updateUserLastLogin(user.id)

    const access_token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: '1h' }
    )

    return res.status(200).json({
      access_token,
      refresh_token: '',
      user: toSafeUser(user)
    })
  })

  router.get('/me', async (req: any, res: any) => {
    const auth = req.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : ''
    if (!token) return res.status(401).json({ error: 'Missing token' })

    try {
      const payload = jwt.verify(token, getJwtSecret()) as any
      const userId = typeof payload?.sub === 'string' ? payload.sub : ''
      if (!userId) return res.status(401).json({ error: 'Invalid token' })
      const user = await store.getUserById(userId)
      if (!user) return res.status(404).json({ error: 'User not found' })
      return res.status(200).json({ user: toSafeUser(user) })
    } catch {
      return res.status(401).json({ error: 'Invalid token' })
    }
  })

  return router
}