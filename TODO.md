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

### 1. Code Duplication - GuardrailService (CRITICAL)
**Status:** ❌ Not Fixed  
**Files:** `server/src/guardrail_service.ts` and `runner/src/guardrail_service.ts`  
**Issue:** Both files contain 100% identical code (205 lines). Any changes in one won't sync to the other.  
**Impact:** Maintenance burden, potential security inconsistencies  
**Solution Options:**
- **Option A:** Extract to shared module at `shared/src/guardrail_service.ts` and import from both
- **Option B:** Keep server version as canonical, have runner import from `../../server/src/guardrail_service.ts`
- **Option C:** Use npm workspaces to create a shared package
**Recommendation:** Option B for minimal changes, then Option C for long-term maintainability

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

### 4. Excessive Use of `any` Type
**Status:** ❌ Not Fixed  
**Files:** All route handlers in `server/src/routes/*.ts` and `runner/src/*.ts`  
**Count:** 45+ instances  
**Examples:**
- `server/src/routes/agents.ts` - All handlers use `(req: any, res: any)`
- `server/src/routes/auth.ts` - Multiple `(row as any).property` patterns
- `runner/src/workflow.ts` - Generic `any` parameters
**Impact:** Loss of type checking, no IDE autocomplete, runtime errors  
**Solution:** 
- Express routes: Use `Request<ParamsDictionary, any, BodyType>` and `Response`
- Fastify routes: Use `FastifyRequest<{ Params: {...}, Body: {...} }>` and `FastifyReply`
- Database results: Define proper interfaces for all row types

### 5. Unsafe Type Assertions
**Status:** ❌ Not Fixed  
**File:** `server/src/routes/auth.ts`  
**Issue:** Pattern `(row as any).property` used without checking if property exists  
**Example:** 
```typescript
const data = (await res.json().catch(() => null)) as any
// Should be: const data = await res.json().catch(() => null) as SocialUserData | null
```
**Impact:** Runtime errors, undefined behavior  
**Solution:** Define proper interfaces and use type guards

## 🟡 MEDIUM PRIORITY - Concurrency & Memory

### 6. SSE Subscriber Race Conditions
**Status:** ❌ Not Fixed  
**File:** `runner/src/index.ts` lines 43-45, 240-252, 313-316  
**Issue:** `jobSubscribers` Map modified concurrently without locking  
**Scenarios:**
- Multiple subscribers can receive duplicate events
- Race between `cleanup()` and new subscribers joining
- Subscriber could be added after job completion but before cleanup
**Solution:** Use locks or queues for subscriber operations, ensure atomic add/remove

### 7. Session Cache Memory Leak
**Status:** ⚠️ Partial - Has lazy cleanup  
**File:** `server/src/session_cache.ts`  
**Issue:** Expired cache entries only cleaned up when accessed or when cache is full  
**Impact:** Memory leaks if entries aren't accessed after expiration (e.g., abandoned sessions)  
**Current Behavior:** `cleanupExpired()` called on `set()` but not periodically  
**Solution:** Add background cleanup interval (e.g., every 5 minutes)

### 8. Fire-and-Forget Async Execution
**Status:** ❌ Not Fixed  
**File:** `runner/src/index.ts` line 207  
**Code:**
```typescript
executeJob(store, jobId, subscribers, input, cleanup).catch((err) => {
  console.error(`Job ${jobId} failed:`, err)
})
```
**Issue:** Job executes without await; cleanup may not be called if error occurs before try/catch  
**Impact:** Resource leaks, orphaned processes, incorrect job status  
**Solution:** Properly await and ensure cleanup is always called via finally block

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

### 11. Dead Code & Unused Imports
**Status:** ⚠️ Minor issues found  
**Files:**
- `server/src/shims.d.ts` - Appears unused, may be legacy
- `runner/src/agent.ts` lines 49-50 - `this.ollama` never initialized if env var missing
**Solution:** Remove unused files after verification, fix agent initialization

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
