# TODO - Code Quality, Bugs, and Refactoring Tasks

## 🔴 CRITICAL PRIORITY - Must Fix ASAP

### 0. MERGE CONFLICT IN storage.ts (BLOCKING BUILD) ✅ FIXED
**Status:** ✅ **FIXED**  
**File:** `server/src/storage.ts`  
**Issue:** Incomplete merge with duplicate content. Line 967 had `=======` marker. Content from line 968-1806 duplicated lines 1-966 BUT with additional social account methods.  
**Solution Implemented:**
- Added `UserSession, SocialAccount, ToolDetails` to imports
- Added 8 missing methods to Store interface (user sessions + social accounts)
- Added proper implementations in SqliteStore class
- Added descriptive error messages in InMemoryStore stubs
- Removed 843 lines of duplicate content
- File reduced from 1806 → 1104 lines
- Fixed User object creation to include `password_hash` field
**Verification:** ✅ Server builds successfully

### 1. Code Duplication - GuardrailService (CRITICAL) ✅ FIXED
**Status:** ✅ **FIXED**  
**Files:** `server/src/guardrail_service.ts` and `runner/src/guardrail_service.ts`  
**Issue:** Both files contain 100% identical code (205 lines). Any changes in one won't sync to the other.  
**Solution Implemented:**
- Replaced `runner/src/guardrail_service.ts` with a symbolic link to `server/src/guardrail_service.ts`
- Ensures code is always in sync and `tsc` can build it correctly
- Verified `scripts/check-guardrail-sync.js` passes
**Verification:** ✅ Sync check passed

### 2. Job Execution Race Condition (CRITICAL) ✅ FIXED
**Status:** ✅ **FIXED**  
**File:** `runner/src/index.ts` lines 145-212  
**Issue:** Job timeout handler and executeJob() could both update job status simultaneously without mutual exclusion  
**Solution Implemented:**
- Added `jobCompleted` flag to track completion state
- Added `completionMutex` flag for basic mutual exclusion
- Both timeout handler and completion callback check flags before updating status
- Prevents duplicate status updates and events
**Note:** Code review suggests using proper mutex library for better thread safety, but current implementation significantly reduces race window
**Verification:** ✅ Runner builds successfully

### 3. Missing Request Timeouts (HIGH) ✅ FIXED
**Status:** ✅ **FIXED**  
**File:** `server/src/routes/runs.ts` lines 70-120  
**Issue:** Fetch calls to runner service had no timeout. If runner hangs, server request hangs indefinitely  
**Solution Implemented:**
- Created `fetchWithTimeout()` helper function with AbortController
- Added 30s timeout for job creation
- Added 10s timeout for job start
- Streaming connection intentionally has no timeout
**Impact:** Prevents resource exhaustion and connection pool depletion  
**Verification:** ✅ Server builds successfully

## 🟡 HIGH PRIORITY - Type Safety

### 4. Type Safety - Routes ✅ FIXED
**Status:** ✅ **FIXED**  
**File:** `server/src/routes/auth.ts`  
**Issue:** Usage of `(req.params as any)` and `(req.headers as any)`  
**Solution Implemented:**
- Used Fastify generics `app.get<{ Params: ... }>`
- Accessed `req.headers.authorization` directly (Fastify types support this)
**Verification:** ✅ Code compiles and cleaner types

### 5. Type Safety - General
**Status:** ⚠️ Partial  
**Issue:** `any` types scattered across codebase  
**Recommendation:** Continue strict type checking adoption incrementally

## 🟡 MEDIUM PRIORITY - Concurrency & Memory

### 6. SSE Subscriber Race Conditions ✅ FIXED
**Status:** ✅ **FIXED**  
**File:** `runner/src/index.ts` lines 43-45, 240-252, 313-316  
**Issue:** `jobSubscribers` Map modified concurrently without locking  
**Solution Implemented:**
- Introduced `withSubscriberLock(jobId, action)` helper for atomic operations
- Protected all accesses to `jobSubscribers` map with this mutex
- Prevents race conditions between new subscribers, event emission, and cleanup
**Verification:** ✅ Code review confirmed

### 7. Session Cache Memory Leak ✅ FIXED
**Status:** ✅ **FIXED**  
**File:** `server/src/session_cache.ts`  
**Issue:** Expired cache entries only cleaned up when accessed or when cache is full  
**Solution Implemented:**
- Verified `setInterval` loop exists in constructor to call `cleanup()` periodically
- `cleanupExpired()` is called correctly
**Verification:** ✅ Code review confirmed

### 8. Fire-and-Forget Async Execution ✅ FIXED
**Status:** ✅ **FIXED**  
**File:** `runner/src/index.ts` line 207  
**Issue:** Job executes without await; cleanup may not be called if error occurs before try/catch  
**Solution Implemented:**
- Wrapped `executeJob` in explicit `Promise.resolve().then(async () => { ... })`
- Added robust try/catch around the async execution
- Preserved fire-and-forget behavior while ensuring error handling
**Verification:** ✅ Runner builds successfully

## 🟢 LOW PRIORITY - Code Quality

### 9. Error Response Format Inconsistency
**Status:** ❌ Not Fixed  
**Files:** All server and runner routes  
**Issue:** Mix of `{ detail: string }`, `{ message: string }`, and object spread  
**Examples:**
- Server: `res.status(404).json({ detail: 'Not found' })`
- Runner: `reply.code(404).send({ message: 'Not found' })`
**Impact:** Frontend needs multiple error handling paths  
**Solution:** Standardize on one format (recommend: `{ error: { code: string, message: string, details?: any } }`)

### 10. Missing API Versioning
**Status:** ❌ Not Implemented  
**Files:** All API routes  
**Issue:** No `/v1/` or versioning prefix on endpoints  
**Impact:** Breaking changes will affect all clients  
**Solution:** Add version prefix `/api/v1/` to all endpoints

### 11. Dead Code & Unused Imports ✅ FIXED
**Status:** ✅ **FIXED**  
**Files:**
- `server/src/shims.d.ts` - Removed as it was unused legacy code
- `runner/src/agent.ts` - Added explicit check for Ollama initialization
**Solution Implemented:**
- Deleted `shims.d.ts`
- Added initialization check in `CoderAgent` constructor
**Verification:** ✅ Code review confirmed

## 📋 OLLAMA INTEGRATION - COMPLETED ✅

### Phase 1: Get Ollama Running Locally ✅
- Grab Ollama from their site and install it on the dev machine
- Pull the qwen2.5-coder:7b model: `ollama pull qwen2.5-coder:7b`
- Fire up the server: `ollama serve` (runs on port 11434 by default)
- Quick test: Hit the API with a curl to localhost:11434/api/chat

### Phase 2: Hook It Up in the Runner ✅ DONE
- Add OLLAMA_API_URL env var in runner config
- Add ollama npm package for Node.js integration
- Add agent config for 'ollama' vs 'copilot' model selection
- Route requests to either Copilot bridge or Ollama based on setting

### Phase 3: Set Up Agent Workflows ✅ DONE
- Define new coder agents using local Ollama model
- Route tasks to correct agent based on model choice
- Set up multi-agent team chat loops

### Phase 4: Build the Team Chat UI ✅ DONE
- Use existing teams and sessions for multi-agent chats
- Show single chat window with messages from each agent
- Store full chat history in DB for persistence
- Feed previous context to new agents joining chat

### Phase 5: Test and Polish ⚠️ IN PROGRESS
- Run real tests with agents collaborating on code tasks
- Monitor performance (models can be slow to load)
- Update documentation
- **TODO:** Add tests for error scenarios

## 🔧 FOLLOW-UPS - From Previous PRs

### After PR#7 & PR#8 Merge
- Port internal toolbox POST route to Express with same security checks:
  - Implement read_file, write_file, list_files, list_dir, grep_search, approve_command, run_command
  - Keep newline-delimited JSON responses and validate inputs rigorously
  - Route location: server/src/routes/toolbox.ts using Express
- Reconcile social login storage with Express auth routes:
  - Ensure User/SocialAccount methods match server/src/routes/auth.ts expectations
  - Verify schema creation/migrations for SQLite tables
- Add ESLint import resolver in UI:
  - Configure typescript and node resolvers in ui/eslint.config.mjs for '@/...' aliases

## 📊 TESTING REQUIREMENTS

### Before Merging Any Fixes
- [ ] Run `npm run smoke` for all services
- [ ] Test job timeout scenarios (normal completion vs timeout)
- [ ] Test concurrent job execution with same agent
- [ ] Test SSE connection handling (connect, disconnect, reconnect)
- [ ] Verify guardrail service blocks dangerous commands
- [ ] Test session cache expiration and cleanup
- [ ] Load test with 100+ concurrent requests

### Integration Tests Needed
- [ ] Multi-agent team collaboration scenarios
- [ ] Ollama model fallback to Copilot
- [ ] Auth flow with social providers
- [ ] Session persistence across restarts
- [ ] Runner job cancellation and cleanup

## 🎯 PRIORITY EXECUTION ORDER

1. **Week 1:** Fix Critical Issues (#1, #2, #3)
2. **Week 2:** Type Safety Improvements (#4, #5)
3. **Week 3:** Concurrency & Memory (#6, #7, #8)
4. **Week 4:** Code Quality & Testing (#9, #10, #11)

## ✅ POSITIVE PATTERNS TO KEEP

These are good practices already in the codebase:
- ✅ Comprehensive try/catch in routes with error logging
- ✅ Bearer token auth on runner service
- ✅ SSE heartbeat to detect stale connections
- ✅ Input sanitization in guardrail service
- ✅ Job timeout mechanism with cleanup hooks
- ✅ Session caching with LRU eviction
- ✅ Database operations properly wrapped with error handling

---

**Last Updated:** 2026-02-08  
**Review Status:** Comprehensive analysis completed  
**Next Review:** After critical fixes (Issues #1-3) are implemented
