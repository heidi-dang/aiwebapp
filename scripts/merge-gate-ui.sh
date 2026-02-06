#!/usr/bin/env bash
set -euo pipefail

fail(){ echo "❌ UI Merge Gate failed: $1" >&2; exit 1; }

# 1) Banner text must NOT exist anymore
if rg -n "open-source.*Agno.*Agent UI|visit the AgentOS" ui/src >/dev/null 2>&1; then
  fail "Landing hero/banner text still present (must be removed)."
fi

# 2) System prompt UI must exist
rg -n "SYSTEM PROMPT|System Prompt" ui/src >/dev/null 2>&1 \
  || fail "System Prompt menu missing."

# 3) Custom/Strict/Default options must exist
rg -n "Default.*Strict.*Custom|Strict.*Custom.*Default" ui/src >/dev/null 2>&1 \
  || fail "System prompt templates (Default/Strict/Custom) missing."

# 4) Composer must have an internal send button marker
# (Add this data-testid in ChatInput so this gate is reliable)
rg -n "data-testid=\"send-inside-composer\"" ui/src >/dev/null 2>&1 \
  || fail "Send button is not inside composer (missing data-testid marker)."

# 5) No deprecated controls
if rg -n "Replay|Pause|Resume" ui/src >/dev/null 2>&1; then
  fail "Deprecated run controls still present (Replay/Pause/Resume)."
fi

# 6) PLAN must not be rendered
if rg -n "PLAN|## Plan|# Plan" ui/src >/dev/null 2>&1; then
  fail "PLAN rendering detected in UI."
fi

echo "✅ UI Merge Gate passed"
