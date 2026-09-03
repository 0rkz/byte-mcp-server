#!/usr/bin/env sh
# Enforced deploy for byte-mcp. The service runs a BUILD ARTIFACT under
# Restart=always, so a restart from any cause deploys whatever is on disk —
# with or without a decision. This script is where that decision is made, so
# the provenance check here is unconditional.
#
#   ./scripts/deploy.sh
#
# Ported from x402-gateway/scripts/deploy-gateway.sh after the 2026-09-01 17:12
# incident: `pkill -f` restarted four units and one came back on a dist/ built
# from a dirty tree, putting uncommitted code in production for ~24 minutes.
# An audit found 4 of 5 artifact-running services had no guard at all.
set -e

# readlink -f, not $0's literal dirname: ~/byte/scripts is an established
# symlink farm here, and a symlinked entry point would otherwise resolve the
# LINK's parent and guard the wrong tree.
cd "$(dirname "$(readlink -f "$0")")/.."

# A caller's exported git env silently redirects every command below at a
# different repo/index, which would make a dirty tree pass. Drop it.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES

echo "[deploy] verifying the build artifact can only come from committed source…"

# Pin to THIS repo, never upward discovery. ~/byte is itself a git repo whose
# .gitignore line 6 is `/*`, so if this directory's .git were missing or
# corrupt, plain `git rev-parse --git-dir` would succeed against the PARENT,
# every guarded path would be ignored there, and the guard would report a clean
# tree while shipping anything. Verified: the parent ignores these service dirs.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "[deploy] ABORT: cannot verify provenance (not a git repo or git unavailable)"; exit 1; }
[ "$ROOT" = "$(pwd -P)" ] || { echo "[deploy] ABORT: git resolved to $ROOT, not $(pwd -P) — refusing to guard a different repo"; exit 1; }

# TWO checks: `git diff` sees MODIFIED tracked files but is BLIND to UNTRACKED
# ones, and a new source file compiles into the artifact while diff stays silent.
#
# Pathspec is everything that can change what the build emits: src/ and
# scripts/ (this guard lives in scripts/ — a guard excluding its own directory
# cannot catch an edit to itself), tsconfig.json (outDir/rootDir/include),
# package.json (the build script that runs), package-lock.json (the dependency
# tree it compiles against), and .gitignore — an uncommitted .gitignore edit
# would otherwise silence the untracked half of this very check.
#
# Note for this repo specifically: scripts/ here also holds buy-oracle.mjs and
# other non-build tooling, so an abort naming scripts/ may point at an edit to
# one of those rather than to anything that reaches dist/. That is deliberate —
# over-inclusion costs a commit, under-inclusion costs an unreviewed deploy.
git diff --quiet HEAD -- src/ scripts/ tsconfig.json package.json package-lock.json .gitignore 2>/dev/null
rc=$?
if [ $rc -ne 0 ]; then
  # Distinguish "diff found changes" (rc 1) from "git failed" (anything else),
  # so a broken repo is never reported as uncommitted work.
  if [ $rc -eq 1 ]; then
    echo "[deploy] ABORT: uncommitted MODIFIED source under the guarded paths — commit or stash before deploying"
  else
    echo "[deploy] ABORT: git diff failed (rc=$rc) — provenance unverifiable"
  fi
  exit 1
fi

# Captured separately so "git failed" and "git says clean" cannot be conflated.
# Inline as `[ -z "$(git ls-files …)" ]` this is FAIL-OPEN: a git error yields
# empty stdout, the test passes, and the deploy proceeds believing there is
# nothing untracked — the exact blindness the check exists to close.
UNTRACKED=$(git ls-files --others --exclude-standard -- src/ scripts/ tsconfig.json package.json package-lock.json .gitignore) || { echo "[deploy] ABORT: cannot enumerate untracked source (git failed)"; exit 1; }
if [ -n "$UNTRACKED" ]; then
  echo "[deploy] ABORT: uncommitted UNTRACKED file(s) under the guarded paths — commit or stash first:"
  echo "$UNTRACKED" | sed 's/^/  /'
  echo "[deploy] (files under src/ compile into the artifact; the rest change how it is built)"
  exit 1
fi

# Freshness stamp: `[ -f ]` alone is satisfied by a stale artifact from an
# earlier build, and in at least one of these repos dist/ is committed, so the
# existence test would be unconditionally true. Require the file to be NEWER
# than a marker taken immediately before the build.
STAMP=$(mktemp)
trap 'rm -f "$STAMP"' EXIT

echo "[deploy] building…"
npm run build

# Assert every artifact THIS BUILD ships, pinned to the paths the units load —
# not dist/index.js by habit. byte-mcp's ExecStart loads dist/index.js.
for a in dist/index.js; do
  [ -s "$a" ] || { echo "[deploy] ABORT: build did not produce $a"; exit 1; }
  [ "$a" -nt "$STAMP" ] || { echo "[deploy] ABORT: $a is older than this build — the compile did not refresh it"; exit 1; }
done

echo "[deploy] guard passed — restarting byte-mcp"
systemctl --user restart byte-mcp
sleep 3

# Assert liveness rather than printing it: an unconditional success banner over
# a unit that came back FAILED is a green light on a broken deploy.
systemctl --user is-active --quiet byte-mcp || {
  echo "[deploy] ABORT: byte-mcp did not come back active after restart"
  systemctl --user --no-pager status byte-mcp | head -20
  exit 1
}
systemctl --user --no-pager status byte-mcp | head -5
echo "✅ byte-mcp deployed (committed source verified, artifact rebuilt, unit active)"
