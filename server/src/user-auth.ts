import crypto from 'crypto'
import jwt from 'jsonwebtoken'

import { Store } from './storage.js'
import { LoginRequest, OAuthProfile, RegisterRequest, User } from './types.js'

export interface AuthTokens {
  access_token: string
  refresh_token: string
  user: User
}

export class UserAuthService {
  private readonly store: Store
  private readonly jwtSecret: string
  private readonly jwtExpiresIn: string
  private readonly bcryptRounds: number

  constructor(args: { store: Store; jwtSecret: string; jwtExpiresIn: string; bcryptRounds: number }) {
    this.store = args.store
    this.jwtSecret = args.jwtSecret
    this.jwtExpiresIn = args.jwtExpiresIn
    this.bcryptRounds = args.bcryptRounds
  }

  async oauthLogin(profile: OAuthProfile, providerData?: unknown): Promise<AuthTokens> {
    const provider = profile.provider
    const providerId = profile.id
    const providerDataJson = providerData != null ? JSON.stringify(providerData) : undefined

    const existingAccount = await this.store.getSocialAccountByProvider(provider, providerId)
    let user: User | null = null

    if (existingAccount) {
      user = await this.store.getUserById(existingAccount.user_id)
    }

    if (!user) {
      const byEmail = profile.email ? await this.store.getUserByEmail(profile.email) : null
      if (byEmail) {
        user = byEmail
      }
    }

    if (!user) {
      const randomPassword = crypto.randomBytes(32).toString('hex')
      const passwordHash = hashPassword(randomPassword)
      user = await this.store.createUser(profile.email, profile.name ?? '', passwordHash)
    }

    if (!existingAccount) {
      await this.store.createSocialAccount(user.id, provider, providerId, providerDataJson)
    }

    await this.store.updateUserLastLogin(user.id)

    const tokens = this.issueTokens(user)
    await this.store.createUserSession(user.id, sha256(tokens.access_token), this.accessTokenExpiryEpoch())
    return tokens
  }

  async register(body: RegisterRequest): Promise<AuthTokens> {
    const existing = await this.store.getUserByEmail(body.email)
    if (existing) throw new Error('User already exists')

    const passwordHash = hashPassword(body.password)
    const user = await this.store.createUser(body.email, body.name ?? '', passwordHash)

    const tokens = this.issueTokens(user)
    await this.store.createUserSession(user.id, sha256(tokens.access_token), this.accessTokenExpiryEpoch())

    return tokens
  }

  async login(body: LoginRequest): Promise<AuthTokens> {
    const user = await this.store.getUserByEmail(body.email)
    if (!user?.password_hash) throw new Error('Invalid email or password')

    const ok = verifyPassword(body.password, user.password_hash)
    if (!ok) throw new Error('Invalid email or password')

    await this.store.updateUserLastLogin(user.id)

    const tokens = this.issueTokens(user)
    await this.store.createUserSession(user.id, sha256(tokens.access_token), this.accessTokenExpiryEpoch())

    return tokens
  }

  async logout(accessToken: string): Promise<boolean> {
    return this.store.deleteUserSession(sha256(accessToken))
  }

  async authenticate(accessToken: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(accessToken, this.jwtSecret) as { userId?: string; type?: string }
      if (!decoded?.userId || decoded.type !== 'access') return null

      const session = await this.store.getUserSessionByTokenHash(sha256(accessToken))
      if (!session) return null

      return await this.store.getUserById(decoded.userId)
    } catch {
      return null
    }
  }

  private issueTokens(user: User): AuthTokens {
    const accessToken = jwt.sign({ userId: user.id, type: 'access' }, this.jwtSecret, { expiresIn: this.jwtExpiresIn })
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, this.jwtSecret, { expiresIn: '30d' })

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user
    }
  }

  private accessTokenExpiryEpoch(): number {
    const now = Math.floor(Date.now() / 1000)
    const sevenDays = 7 * 24 * 60 * 60
    return now + sevenDays
  }
}

export function createUserAuthService(store: Store): UserAuthService {
  const jwtSecret = process.env.JWT_SECRET || 'dev_jwt_secret'
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d'
  const bcryptRounds = Number(process.env.BCRYPT_ROUNDS || 12)
  return new UserAuthService({ store, jwtSecret, jwtExpiresIn, bcryptRounds })
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const derivedKey = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, keyHex] = stored.split(':')
  if (!saltHex || !keyHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expectedKey = Buffer.from(keyHex, 'hex')
  const actualKey = crypto.scryptSync(password, salt, expectedKey.length)
  return crypto.timingSafeEqual(expectedKey, actualKey)
}
