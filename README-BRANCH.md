# User Registration & Social Login Feature Branch

## Branch Information
- **Branch**: `feature/user-registration-social-login`
- **Base**: `main`
- **Created**: 2025-02-08
- **Purpose**: Implement user registration and OAuth social login system

## Overview
This branch implements a comprehensive authentication system for the AI Web App, including:

### Core Features
- ✅ **Email/Password Registration** with email verification
- ✅ **Social Login (OAuth)** for:
  - Google
  - GitHub
  - Apple
  - Microsoft
- ✅ **User Account Management** with profile settings
- ✅ **Data Ownership** - agents, sessions, and teams linked to user accounts

### Implementation Phases

#### Phase 1: Database & Types ✅
- [x] Database schema design (users, sessions, social_accounts)
- [x] TypeScript interface definitions
- [x] Migration scripts for existing data

#### Phase 2: Backend Authentication ✅
- [x] JWT token service
- [x] Password hashing with bcrypt
- [x] OAuth provider integrations (Passport.js)
- [x] Authentication middleware
- [x] API endpoints for auth operations

#### Phase 3: Frontend Auth UI ✅
- [x] Login/Register pages
- [x] Social login buttons
- [x] AuthGuard component
- [x] User menu and profile
- [x] Zustand auth store

#### Phase 4: Data Integration ✅
- [x] User ownership for agents
- [x] User ownership for sessions
- [x] User ownership for teams
- [x] Updated CRUD operations

#### Phase 5: Security & Polish ✅
- [x] Email verification workflow
- [x] Password reset functionality
- [x] Rate limiting and CSRF protection
- [x] Error handling and loading states

## Files Modified

### Server Changes
```
server/
├── src/
│   ├── index.ts              # Added auth middleware
│   ├── routes/
│   │   ├── auth.ts           # NEW: Authentication endpoints
│   │   ├── agents.ts         # UPDATED: User ownership
│   │   ├── sessions.ts       # UPDATED: User ownership
│   │   └── teams.ts          # UPDATED: User ownership
│   ├── auth.ts               # NEW: Auth service
│   ├── storage.ts            # UPDATED: User tables
│   └── types.ts              # UPDATED: User types
├── package.json              # UPDATED: Auth dependencies
└── .env.example              # UPDATED: Auth env vars
```

### UI Changes
```
ui/
├── src/
│   ├── app/
│   │   ├── login/
│   │   │   └── page.tsx      # NEW: Login page
│   │   ├── register/
│   │   │   └── page.tsx      # NEW: Register page
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── page.tsx  # NEW: OAuth callback
│   │   └── layout.tsx        # UPDATED: Auth provider
│   ├── components/
│   │   ├── auth/             # NEW: Auth components
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   ├── SocialLogin.tsx
│   │   │   └── AuthGuard.tsx
│   │   └── ui/
│   │       └── UserMenu.tsx  # NEW: User menu
│   ├── hooks/
│   │   └── useAuth.ts        # NEW: Auth hook
│   ├── lib/
│   │   └── api.ts            # UPDATED: Auth headers
│   └── store.ts              # UPDATED: Auth store
├── package.json              # UPDATED: Auth dependencies
└── .env.local.example        # UPDATED: Auth env vars
```

## Environment Setup

### Server Environment (.env)
```bash
# Existing config...
PORT=3001
CORS_ORIGIN=http://localhost:3000
DB_PATH=./server.db

# NEW: Authentication
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

# NEW: OAuth Providers
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/oauth/google/callback

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/auth/oauth/github/callback

APPLE_CLIENT_ID=your_apple_client_id
APPLE_CLIENT_SECRET=your_apple_client_secret
APPLE_CALLBACK_URL=http://localhost:3001/auth/oauth/apple/callback

MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_CALLBACK_URL=http://localhost:3001/auth/oauth/microsoft/callback

# Email settings (for verification)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
FROM_EMAIL=noreply@yourapp.com
```

### UI Environment (.env.local)
```bash
# Existing config...
NEXT_PUBLIC_API_URL=http://localhost:3001
RUNNER_URL=http://localhost:3002

# NEW: Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here
```

## Database Schema

### New Tables
```sql
-- Users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User sessions table
CREATE TABLE user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Social accounts table
CREATE TABLE social_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_id)
);
```

### Updated Tables
```sql
-- Add user ownership to existing tables
ALTER TABLE agents ADD COLUMN user_id INTEGER;
ALTER TABLE sessions ADD COLUMN user_id INTEGER;
ALTER TABLE teams ADD COLUMN user_id INTEGER;
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register with email/password
- `POST /auth/login` - Login with email/password
- `POST /auth/logout` - Logout user
- `GET /auth/me` - Get current user info
- `POST /auth/verify-email` - Verify email address
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password

### OAuth
- `GET /auth/oauth/google` - Initiate Google OAuth
- `GET /auth/oauth/google/callback` - Google OAuth callback
- `GET /auth/oauth/github` - Initiate GitHub OAuth
- `GET /auth/oauth/github/callback` - GitHub OAuth callback
- `GET /auth/oauth/apple` - Initiate Apple OAuth
- `GET /auth/oauth/apple/callback` - Apple OAuth callback
- `GET /auth/oauth/microsoft` - Initiate Microsoft OAuth
- `GET /auth/oauth/microsoft/callback` - Microsoft OAuth callback

## Testing

### Running Tests
```bash
# Server tests
cd server && npm run test && npm run smoke

# UI tests
cd ui && npm run test && npm run lint && npm run typecheck

# Full integration test
npm run smoke
```

### Test Coverage
- Unit tests for auth service functions
- Integration tests for OAuth flows
- E2E tests for registration/login
- Security tests for token validation

## Development Workflow

### Getting Started
1. Install dependencies: `npm run bootstrap`
2. Initialize environment: `npm run init:env`
3. Set up OAuth provider credentials
4. Start development: `npm run dev`

### OAuth Provider Setup

#### Google
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3001/auth/oauth/google/callback`

#### GitHub
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create new OAuth App
3. Set Authorization callback URL: `http://localhost:3001/auth/oauth/github/callback`

#### Apple
1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Create App ID with Sign In with Apple capability
3. Create Service ID
4. Configure redirect URL: `http://localhost:3001/auth/oauth/apple/callback`

#### Microsoft
1. Go to [Azure Portal](https://portal.azure.com/)
2. Create new App Registration
3. Add redirect URI: `http://localhost:3001/auth/oauth/microsoft/callback`
4. Configure delegated permissions

## Security Considerations

- JWT tokens with expiration
- Password hashing with bcrypt
- Rate limiting on auth endpoints
- CSRF protection
- Secure cookie handling
- HTTPS in production
- Environment variable validation

## Migration Notes

- Existing agents/sessions/teams will be assigned to a system user
- Database migration script included
- Backward compatibility maintained during transition

## PR Requirements

This branch must pass all CI checks:
- ✅ Server TypeScript compilation
- ✅ Server smoke tests
- ✅ UI TypeScript compilation
- ✅ UI linting
- ✅ UI build
- ✅ Runner build
- ✅ Tools check

## Rollback Plan

If issues arise:
1. Database schema changes are backward compatible
2. New auth routes are additive
3. UI changes include feature flags
4. Migration script can revert user ownership

## Next Steps

1. Set up OAuth provider credentials
2. Test all authentication flows
3. Verify data ownership isolation
4. Performance testing
5. Security audit
6. Documentation updates

---

**Status**: In Development  
**Completion Target**: 2025-02-22  
**Dependencies**: OAuth provider credentials
