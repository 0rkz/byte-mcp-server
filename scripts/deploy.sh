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

# Assert every artifact THIS BUILD ships, driven from the COMMITTED SOURCE LIST —
# not dist/index.js by habit, and not a hand-written list of names.
#
# byte-mcp's ExecStart is `node dist/index.js --http`, but index.js is
# only the ENTRY POINT: it imports ./lib/catalog.js, ./lib/config.js, ./lib/verify.js and six
# ./tools/*.js modules, which in turn pull ./lib/contracts.js.
# discovery-api's 2026-09-02 pricing fix (89ce272) touched only src/lib/feeds.ts, so
# it compiled entirely into dist/lib/feeds.js while dist/index.js stayed byte-
# identical. An entry-point-only assertion passes a build that never refreshed
# feeds.js. A hand-enumerated list is the same bug in slower motion: it goes stale
# the first time a module is added, silently, with nothing failing to say so.
#
# Driving from `git ls-files` instead of from `find dist` is deliberate. A dist/
# glob can only assert files that ARE there — it cannot notice an artifact that was
# never emitted, which is the failure that matters most. The source list catches
# never-emitted AND stale, needs no maintenance when a module is added, and ignores
# orphan .js left behind by a renamed source (dead files nothing loads, which a
# dist/ glob would abort on forever until someone wiped dist/).
#
# FOUR pathspecs, not one (FD pass 1, HIGH, fail-open): `src/*.ts` does NOT match
# .mts/.cts/.tsx — those end in "mts"/"cts"/"tsx", not ".ts" — yet tsc compiles all
# three into loadable artifacts. A single-pattern guard reports success while
# shipping a stale one, the very class this block claims to close. Measured
# emission under each repo's real tsconfig, so the mapping is not a guess:
#   .ts -> .js   .tsx -> .js   .mts -> .mjs   .cts -> .cjs
# Declaration files emit NOTHING and must be skipped in all three flavours.
#
# Requiring freshness on all of them is safe here: `npm run build` is plain `tsc`
# with no `incremental` and no tsBuildInfo, so every run re-emits every output.
# Verified empirically 2026-09-02 in a scratch rsync, never in the live tree.
# tsconfig.json pins rootDir=src and outDir=dist, so src/X -> dist/X is exact.

# The ExecStart target gets BOTH assertions, unconditionally and by name.
# It is covered by the loop below only while `src/index.ts` happens to be tracked;
# rename the entry source, move it, or exclude it and the loop stops covering it
# while this line keeps holding. Asserting it separately costs one line and
# removes that dependency — the earlier revision of this guard demoted it to `-s`
# alone and FD (pass 2, HIGH) demonstrated a stale 2019 dist/index.js passing.
#
# KNOWN, DELIBERATE LIMIT (FD pass 3 MEDIUM, pass 4 MEDIUM-1/2 — documented rather
# than enforced, founder's call 2026-09-03): ENTRY is a LITERAL, and nothing here
# checks it against what byte-mcp actually runs. Repoint that unit's ExecStart, or
# its WorkingDirectory to another tree, and this guard keeps certifying
# dist/index.js in THIS repo while the unit loads something else. An enforced
# cross-check was written and rejected for now because it matched only the
# WorkingDirectory-RELATIVE ExecStart form: 22 of the 29 byte-* units on this box
# use the ABSOLUTE form, so normalising byte-mcp to the house majority would have
# bricked this script with a message blaming the wrong thing. Enforcing it needs
# both forms AND a WorkingDirectory assertion, which belongs in the guard wave
# that is redesigning post-deploy verification across all five scripts.
# If you repoint ExecStart or WorkingDirectory, update ENTRY here by hand.
ENTRY=dist/index.js
[ -s "$ENTRY" ] || { echo "[deploy] ABORT: build did not produce $ENTRY — the unit's ExecStart target"; exit 1; }
[ "$ENTRY" -nt "$STAMP" ] || { echo "[deploy] ABORT: $ENTRY is older than this build — the unit's ExecStart target was not refreshed"; exit 1; }

# `git ls-files` recurses: git pathspec `*` crosses `/`, so src/lib/feeds.ts is
# matched. Do NOT "fix" this to src/**/*.ts — that changes the semantics.
# core.quotePath=false stops git escaping NON-ASCII bytes (src/umläut.ts then
# comes through literally). It does NOT stop C-quoting for `"`, `\`, TAB or
# newline — those paths still arrive as "src/tab\there.ts", quotes and all.
# That is handled inside the loop rather than pretended away.
SOURCES=$(git -c core.quotePath=false ls-files 'src/*.ts' 'src/*.tsx' 'src/*.mts' 'src/*.cts') || { echo "[deploy] ABORT: cannot enumerate source modules (git failed)"; exit 1; }
[ -n "$SOURCES" ] || { echo "[deploy] ABORT: no committed TypeScript under src/ — refusing to certify a build with no source"; exit 1; }

# Newline-only IFS so a path containing a SPACE stays one word, and `set -f` so a
# glob character in a filename is not pathname-expanded mid-loop. (A TAB does not
# need IFS help — git quotes tabbed paths, which the backstop below rejects.)
# Without these, `src/lib/rate limits.ts` iterates as two words and the guard
# aborts forever naming two paths that never existed (FD pass 1, MEDIUM). POSIX sh
# has no `read -r -d ''`, so this is the available way to iterate safely.
FD_OLD_IFS=$IFS
IFS='
'
set -f

for s in $SOURCES; do
  # Declaration files compile to no .js at all — required skip, not an optimisation.
  case "$s" in *.d.ts|*.d.mts|*.d.cts) continue ;; esac

  # A C-quoted path would survive the ${s#src/} strip unchanged and then demand
  # an artifact that can never exist — a permanent, unactionable ABORT. Refuse it
  # by name instead (FD pass 2, MEDIUM). Fail-closed either way; this one says why.
  case "$s" in
    src/*) ;;
    *)
      echo "[deploy] ABORT: git returned a C-quoted path ($s) — that filename contains a"
      echo "[deploy] double quote, backslash, tab or newline. This guard cannot map it to"
      echo "[deploy] an artifact path; rename the file."
      exit 1
      ;;
  esac

  rel=${s#src/}
  case "$rel" in
    *.mts) a="dist/${rel%.mts}.mjs" ;;
    *.cts) a="dist/${rel%.cts}.cjs" ;;
    # `.tsx -> .js` assumes `jsx` is unset or a transform mode, which is true in
    # this repo's tsconfig. Setting `jsx: preserve` (or react-native) makes tsc
    # emit .jsx instead, and this arm must change with it (FD pass 2, LOW).
    *.tsx) a="dist/${rel%.tsx}.js" ;;
    *)     a="dist/${rel%.ts}.js" ;;
  esac

  [ -s "$a" ] || { echo "[deploy] ABORT: $s did not compile to a non-empty $a — this build is incomplete"; exit 1; }
  [ "$a" -nt "$STAMP" ] || {
    echo "[deploy] ABORT: $a is older than this build — the compile did not refresh it."
    echo "[deploy] It would ship stale code for $s. Fix: rm -rf dist && npm run build."
    exit 1
  }
done

set +f
IFS=$FD_OLD_IFS

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
