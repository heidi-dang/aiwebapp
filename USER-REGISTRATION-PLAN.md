# User Registration with Social Login Implementation Plan

## Overview
This document outlines the implementation of user registration and authentication system with OAuth social login support for the AI Web App.

## Requirements Analysis

### Core User Registration Types
- **Email/Password Registration**: Traditional user registration with email verification
- **Social Login (OAuth)**: "Sign in with" functionality for:
  - Google
  - GitHub 
  - Apple
  - Microsoft

### Current Architecture Review
- **Server**: Fastify API with SQLite database
- **UI**: Next.js 15 with shadcn/ui components
- **Runner**: Agent execution service (no auth changes needed)
- **Database**: SQLite with existing tables for agents, sessions, teams, runs

## Implementation Plan

### Phase 1: Database Schema & Types
1. **Database Schema Updates**
   - Add `users` table to server SQLite database
   - Add `user_sessions` table for authentication tokens
   - Add `social_accounts` table for OAuth provider links
   - Update existing tables to reference users

2. **TypeScript Types**
   - Define User, AuthSession, SocialAccount interfaces
   - Update existing types to include user ownership
   - Create OAuth provider types

### Phase 2: Backend Authentication System
1. **Authentication Service**
   - JWT token generation and validation
   - Password hashing with bcrypt
   - Session management
   - Middleware for protected routes

2. **OAuth Integration**
   - Passport.js setup for OAuth providers
   - Google OAuth 2.0 integration
   - GitHub OAuth integration
   - Apple Sign In integration
   - Microsoft Azure AD integration

3. **API Endpoints**
   - `POST /auth/register` - Email/password registration
   - `POST /auth/login` - Email/password login
   - `GET /auth/oauth/:provider` - Initiate OAuth flow
   - `GET /auth/oauth/:provider/callback` - OAuth callback
   - `POST /auth/logout` - Session termination
   - `GET /auth/me` - Current user info

### Phase 3: Frontend Authentication UI
1. **Authentication Pages**
   - Login page (`/login`)
   - Register page (`/register`)
   - OAuth callback handler
   - Account settings page

2. **Components**
   - LoginForm component
   - RegisterForm component
   - SocialLoginButtons component
   - AuthGuard wrapper component
   - UserMenu component

3. **State Management**
   - Auth store in Zustand
   - User session persistence
   - Token management

### Phase 4: Integration & Ownership
1. **Data Ownership**
   - Link agents to user accounts
   - Link sessions to user accounts
   - Link teams to user accounts
   - Update CRUD operations to enforce ownership

2. **UI Updates**
   - Add user context to existing interfaces
   - Update agent management to be user-scoped
   - Update session management for user isolation

### Phase 5: Security & Polish
1. **Security Features**
   - Email verification workflow
   - Password reset functionality
   - Rate limiting on auth endpoints
   - CSRF protection
   - Secure cookie handling

2. **UX Enhancements**
   - Loading states during auth
   - Error handling and user feedback
   - Redirect after login
   - Remember me functionality

## Technical Specifications

### Database Schema

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

-- Update existing tables
ALTER TABLE agents ADD COLUMN user_id INTEGER;
ALTER TABLE sessions ADD COLUMN user_id INTEGER;
ALTER TABLE teams ADD COLUMN user_id INTEGER;
```

### Environment Variables

```bash
# Server (.env)
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

# OAuth Providers
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

APPLE_CLIENT_ID=your_apple_client_id
APPLE_CLIENT_SECRET=your_apple_client_secret

MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

# Callback URLs
OAUTH_CALLBACK_URL=http://localhost:3001/auth/oauth
FRONTEND_URL=http://localhost:3000
```

### Dependencies

**Server additions:**
```json
{
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "passport": "^0.6.0",
  "passport-google-oauth20": "^2.0.0",
  "passport-github2": "^0.1.12",
  "passport-apple": "^1.0.0",
  "passport-azure-ad": "^4.3.0",
  "passport-jwt": "^4.0.1"
}
```

**UI additions:**
```json
{
  "@auth0/nextjs-auth0": "^3.0.0",
  "js-cookie": "^3.0.5"
}
```

## Implementation Order

1. **Database & Types** (Phase 1)
2. **Backend Auth Service** (Phase 2)
3. **Frontend Auth UI** (Phase 3)
4. **Data Integration** (Phase 4)
5. **Security & Polish** (Phase 5)

## Testing Strategy

- Unit tests for auth service functions
- Integration tests for OAuth flows
- E2E tests for registration/login flows
- Security tests for token validation
- Database migration tests

## Migration Considerations

- Existing data will be assigned to a default/system user
- Database migration script needed for production
- Backward compatibility during transition

## Success Criteria

- Users can register with email/password
- Users can login with all 4 OAuth providers
- Existing functionality remains intact
- Data is properly isolated by user
- Security best practices are implemented
- All tests pass in CI/CD pipeline

## PR Merge Requirements (from workflows)

### PR Check Requirements:
- **Server**: TypeScript compilation passes, smoke tests pass
- **UI**: Type check passes, lint passes, build passes  
- **Runner**: Build passes
- **Tools**: Tools check passes

### Quality Gates:
- All TypeScript compilation successful
- ESLint checks pass
- All smoke tests pass
- Documentation updated
- Environment variables documented

## Next Steps

1. Create database migration scripts
2. Implement core auth service
3. Set up OAuth provider configurations
4. Build frontend auth components
5. Integrate with existing agent/session management
6. Add comprehensive testing
7. Update documentation

---

**Branch**: `feature/user-registration-social-login`  
**Created**: 2025-02-08  
**Estimated Duration**: 2-3 weeks
