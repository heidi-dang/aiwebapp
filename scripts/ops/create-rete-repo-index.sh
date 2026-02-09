#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/make_repo_index.sh
# Output:
#   REPO_INDEX.md
#   REPO_INDEX.json

ROOT="${1:-.}"
OUT_MD="${ROOT}/REPO_INDEX.md"
OUT_JSON="${ROOT}/REPO_INDEX.json"

cd "$ROOT"

# --- helpers ---
have() { command -v "$1" >/dev/null 2>&1; }

# Exclude junk + big dirs
EXCLUDES=(
  ".git"
  "node_modules"
  "dist"
  "build"
  ".next"
  ".turbo"
  ".cache"
  "coverage"
  "out"
  ".venv"
  "venv"
  "__pycache__"
  ".pytest_cache"
  ".DS_Store"
)

# Build find prune expression
PRUNE_EXPR=()
for e in "${EXCLUDES[@]}"; do
  PRUNE_EXPR+=( -name "$e" -o )
done
# remove trailing -o
unset 'PRUNE_EXPR[${#PRUNE_EXPR[@]}-1]'

# File types we want to “peek” into
TEXT_GLOBS=(
  "*.md" "*.txt"
  "*.ts" "*.tsx" "*.js" "*.jsx" "*.mjs" "*.cjs"
  "*.py" "*.go" "*.rs" "*.java" "*.cs"
  "*.json" "*.yml" "*.yaml" "*.toml" "*.ini"
  "Dockerfile" "docker-compose*.yml" "Makefile"
  "*.sh" "*.sql"
)

# Limit excerpt sizes
MAX_BYTES=12000          # max bytes per file excerpt in MD
MAX_LINES=220            # max lines per file excerpt in MD

# --- tree ---
echo "# Repo Index" > "$OUT_MD"
echo "" >> "$OUT_MD"
echo "Generated: $(date -Iseconds)" >> "$OUT_MD"
echo "" >> "$OUT_MD"

echo "## Directory tree (trimmed)" >> "$OUT_MD"
echo "" >> "$OUT_MD"
echo '```' >> "$OUT_MD"
if have tree; then
  # tree can ignore patterns; easiest is just limit depth and rely on prune list
  tree -a -L 6 \
    -I ".git|node_modules|dist|build|.next|.turbo|.cache|coverage|out|.venv|venv|__pycache__|.pytest_cache" \
    || true
else
  # fallback: find
  find . \( -type d \( "${PRUNE_EXPR[@]}" \) -prune \) -o -print \
    | sed 's|^\./||' \
    | head -n 1200
fi
echo '```' >> "$OUT_MD"
echo "" >> "$OUT_MD"

# --- key configs quick view ---
echo "## Key config files" >> "$OUT_MD"
echo "" >> "$OUT_MD"

KEY_FILES=(
  "package.json"
  "pnpm-lock.yaml"
  "yarn.lock"
  "package-lock.json"
  "tsconfig.json"
  "next.config.js"
  "next.config.mjs"
  "vite.config.ts"
  "vitest.config.ts"
  "turbo.json"
  "docker-compose.yml"
  "docker-compose.*.yml"
  "Dockerfile"
  ".env.example"
  ".env"
  "README.md"
)

for pattern in "${KEY_FILES[@]}"; do
  for f in $pattern; do
    [ -f "$f" ] || continue
    echo "### \`$f\`" >> "$OUT_MD"
    echo "" >> "$OUT_MD"
    echo '```' >> "$OUT_MD"
    # avoid leaking secrets from .env
    if [[ "$f" == ".env" ]]; then
      sed -E 's/(=).*/=\*\*\*REDACTED\*\*\*/' "$f" | head -n 120 >> "$OUT_MD"
    else
      head -n 200 "$f" >> "$OUT_MD"
    fi
    echo '```' >> "$OUT_MD"
    echo "" >> "$OUT_MD"
  done
done

# --- full file list for JSON ---
tmp_list="$(mktemp)"
find . \
  \( -type d \( "${PRUNE_EXPR[@]}" \) -prune \) -o \
  -type f -print \
  | sed 's|^\./||' \
  | sort > "$tmp_list"

# --- write JSON index (paths + basic stats) ---
echo "{" > "$OUT_JSON"
echo '  "generated_at": "'"$(date -Iseconds)"'",' >> "$OUT_JSON"
echo '  "root": "'"$(pwd)"'",' >> "$OUT_JSON"
echo '  "excluded": ["'"$(IFS='","'; echo "${EXCLUDES[*]}")"'"],' >> "$OUT_JSON"
echo '  "files": [' >> "$OUT_JSON"

first=1
while IFS= read -r f; do
  # Skip binaries by extension heuristic
  case "$f" in
    *.png|*.jpg|*.jpeg|*.webp|*.gif|*.ico|*.pdf|*.zip|*.tar|*.gz|*.7z|*.mp4|*.mov|*.mp3|*.wav|*.woff|*.woff2|*.ttf)
      continue
      ;;
  esac

  size=$(wc -c < "$f" 2>/dev/null || echo 0)
  lines=$(wc -l < "$f" 2>/dev/null || echo 0)

  if [ $first -eq 1 ]; then first=0; else echo "," >> "$OUT_JSON"; fi
  printf '    {"path":"%s","bytes":%s,"lines":%s}' \
    "$(printf '%s' "$f" | sed 's/"/\\"/g')" \
    "$size" \
    "$lines" >> "$OUT_JSON"
done < "$tmp_list"

echo "" >> "$OUT_JSON"
echo "  ]" >> "$OUT_JSON"
echo "}" >> "$OUT_JSON"

rm -f "$tmp_list"

# --- excerpt important source files into MD (limited + safe) ---
echo "## Source excerpts (sampled)" >> "$OUT_MD"
echo "" >> "$OUT_MD"
echo "_Purpose: give an agent quick context without dumping the entire repo._" >> "$OUT_MD"
echo "" >> "$OUT_MD"

# Build a candidate list: prioritize common “entry” files + small/medium files
candidates="$(mktemp)"
while IFS= read -r f; do
  # heuristics: include known “core” filenames
  base="$(basename "$f")"
  case "$base" in
    "executor.ts"|"store.ts"|"ChatInput.tsx"|"RunCard.tsx"|"server.ts"|"index.ts"|"main.ts"|"app.tsx"|"App.tsx")
      echo "$f" >> "$candidates"
      continue
      ;;
  esac

  # include if matches globs + not enormous
  for g in "${TEXT_GLOBS[@]}"; do
    if [[ "$f" == $g ]]; then
      bytes=$(wc -c < "$f" 2>/dev/null || echo 0)
      if [ "$bytes" -le 40000 ]; then
        echo "$f" >> "$candidates"
      fi
      break
    fi
  done
done < <(find . \( -type d \( "${PRUNE_EXPR[@]}" \) -prune \) -o -type f -print | sed 's|^\./||' | sort)

# de-dup + cap
sort -u "$candidates" | head -n 80 > "${candidates}.cap"

while IFS= read -r f; do
  [ -f "$f" ] || continue
  echo "### \`$f\`" >> "$OUT_MD"
  echo "" >> "$OUT_MD"
  echo '```' >> "$OUT_MD"
  # redact obvious tokens in excerpts
  # (basic; adjust patterns if you use different env names)
  sed -E \
    -e 's/(AUTH_TOKEN|OPENAI_API_KEY|GITHUB_TOKEN|COPILOT_TOKEN|API_KEY|SECRET|PASSWORD)\s*[:=]\s*[^"\r\n]+/\1=***REDACTED***/g' \
    "$f" \
    | head -n "$MAX_LINES" \
    | head -c "$MAX_BYTES" >> "$OUT_MD"
  echo "" >> "$OUT_MD"
  echo '```' >> "$OUT_MD"
  echo "" >> "$OUT_MD"
done < "${candidates}.cap"

rm -f "$candidates" "${candidates}.cap"

echo "✅ Wrote: $OUT_MD"
echo "✅ Wrote: $OUT_JSON"
