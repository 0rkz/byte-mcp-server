#!/usr/bin/env node
/**
 * check-version-claims.mjs — release gate for version claims.
 *
 * THE RULE — stated as an ALLOWLIST, deliberately:
 *
 *   Every X.Y.Z token in a prose/config file must EITHER equal package.json's
 *   version, OR be explicitly marked historical ("since X", "added in X",
 *   "introduced in X", "shipped in X", "vX+", or "X ... added/introduced").
 *   Anything else FAILS.
 *
 * WHY IT IS INVERTED. An earlier version tried to DETECT current-state claims
 * with a regex ("current X", "version X"). A verifier planted 13 phrasings and
 * 11 passed silently — `current v0.12.9`, `Current: 0.12.9`, `now at 0.12.9`,
 * `@0.12.9`, `latest: 0.12.9`, a table cell, and more. Worse, its historical
 * mask ate every `vX.Y.Z` before the claim regex ran, so the exact form its own
 * header advertised never fired. A gate that silently passes is the defect
 * class it exists to catch. Enumerating the ways a human can say "current" is
 * unbounded; enumerating the ways to mark something historical is small and
 * closed. So: unknown phrasing FAILS LOUD.
 *
 * WHY THE HISTORICAL EXEMPTION EXISTS — the counter-example that produced it:
 *   smithery.yaml carries "since 0.10.0", "v0.10.2+", "v0.10.1+", "v0.11.0+".
 *   Those are TRUE statements about when a capability landed. A rule forcing
 *   every version token to equal package.json would rewrite four true
 *   statements into false ones. Assert AGREEMENT-or-MARKED, never identity.
 *
 * AND the rule this replaced: grepping for the OUTGOING version literal can
 * never fail a site stuck on an OLDER string. Assert agreement, not presence.
 *
 * LATER HARDENING, each from a reproduced attack:
 *   - `as of` REMOVED from the marker set. It is how English states CURRENCY
 *     ("as of 0.12.9 this is what you get"), not history, so it smuggled stale
 *     claims straight through the allowlist.
 *   - Cancel words are scanned AFTER the token too, but ONLY for phrases that
 *     predicate currency OF THE VERSION ("(current)", "still current", "the
 *     current release/version"). A general after-scan would wrongly kill
 *     "since 0.10.0 the current default", where "current" describes the
 *     DEFAULT, not the version.
 *   - The cancel also applies to `+`-suffix and trailing-marker exemptions,
 *     which previously exempted with no cancel check at all.
 *   - NOT-A-RELEASE-VERSION guard: dotted-quads (IPs like 127.0.0.1) are
 *     excluded structurally, and tokens owned by another subject (node, zod,
 *     an SDK) are skipped. Without this the gate BLOCKED PUBLISH on a README
 *     that merely mentioned an IP or a dependency version — and a false block
 *     is worse than a miss here, because the natural reaction is
 *     `npm publish --ignore-scripts`, which disables the gate entirely.
 *     Anything unrecognised still fails LOUD, and the message names the escape
 *     hatch (`[not-a-release-version]`) so nobody reaches for --ignore-scripts.
 *
 * KNOWN AND ACCEPTED LIMIT — read this before "improving" the phrase lists.
 * The after-token cancel list and the foreign-subject list are ENUMERATIONS,
 * and enumeration cannot close this problem. Unlisted ways of predicating
 * currency still pass silently ("(latest)", "the current build", "the live
 * version", "what ships today"), and unlisted framings of history can still be
 * blocked. Four rounds of adversarial review converged on a stable trade, not a
 * proof: every guard added against false blocks opens a smuggling window, and
 * every tightening against smuggling creates false blocks. What this gate
 * reliably catches is the realistic failure — a bare version token left behind
 * when package.json moves — plus every phrasing in its test harness. Treat it
 * as a high-value tripwire, never as a proof of correctness, and add a harness
 * row for any new phrasing you fix rather than widening a list by intuition.
 *
 * Wired into the release path: `npm run check:versions`, run by
 * `prepublishOnly` before the build and by CI. Exit 1 blocks the publish.
 * Its own test harness is `test/check-version-claims.test.mjs`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");

/** Structured files whose `version` field IS a current-state claim. */
const JSON_VERSION_SITES = [
  ["package.json", (j) => [j.version]],
  ["package-lock.json", (j) => [j.version, j.packages?.[""]?.version]],
  ["manifest.json", (j) => [j.version]],
  ["server.json", (j) => [j.version, ...(j.packages ?? []).map((p) => p.version)]],
];

/** Prose/config files where every version token is examined. */
const PROSE_SITES = ["smithery.yaml", "README.md", "SKILL.md", "llms-install.md"];

const TOKEN = /\d+\.\d+\.\d+\+?/g;

/** Historical markers — a CLOSED set. `as of` is deliberately absent. */
const MARKER_WORDS = /\b(?:since|added in|introduced in|shipped in|landed in)\b/i;
const MARKER_BEFORE = /\b(?:since|added in|introduced in|shipped in|landed in)\b[^\n]{0,20}$/i;
const MARKER_AFTER = /^[^\n]{0,24}\b(?:added|introduced|onward|and later)\b/i;

/** Current-state words BEFORE the token that cancel a preceding marker. */
const CANCELS_BEFORE = /\b(?:current|currently|latest|now|running|is the)\b/i;
/** Phrases AFTER the token that predicate currency OF THE VERSION ITSELF. */
const CANCELS_AFTER =
  /^[^\n]{0,30}(?:\(current\)|\bstill current\b|\bthe current (?:release|version)\b|\bis current\b|\bthis is the version\b|\bthe version you get\b)/i;

/**
 * Subjects that own a version number which is NOT this package's release.
 * ADJACENCY ONLY — the subject must sit directly against the token, separated
 * by nothing but whitespace / `@` / `:` / `=` / `v`. An earlier form allowed up
 * to 12 free characters, which turned the guard into a smuggling window:
 * `hosted on node, current 0.12.9` and `sdk: current 0.12.9` were skipped
 * outright. `npm` is deliberately NOT a subject — "Published on npm: 0.12.9"
 * is one of the most natural ways to write a CURRENT claim about this package.
 */
const OTHER_SUBJECT =
  /\b(?:node|nodejs|zod|sdk|viem|hono|typescript|tsc|python|qs|axios|ws|express|react|eslint|v8|chrome|ubuntu)[\s@:=v]{0,3}$/i;
/** Explicit escape hatch — applied PER TOKEN, never per line (see below). */
const NOT_A_RELEASE = /\[not-a-release-version\]/i;

export function auditText(file, text, expected) {
  const failures = [];
  const checked = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(TOKEN)) {
      const tok = m[0];
      const before = line.slice(0, m.index);
      const after = line.slice(m.index + tok.length);

      // --- NOT-A-RELEASE guards ---
      // Dotted-quad (IP): 127.0.0.1 yields the token "127.0.0" followed by ".1".
      if (/^\.\d/.test(after) || /\d\.$/.test(before)) continue;
      // Another subject owns this number, and sits directly against it.
      if (OTHER_SUBJECT.test(before)) continue;
      // Explicit escape hatch, PER TOKEN: the marker must follow THIS token
      // before any other version token does. Applying it per LINE let
      // "node 20.20.2 [not-a-release-version] and current 0.12.9" exempt the
      // whole line, including the real claim at the end.
      const escapeWindow = after.split(TOKEN)[0];
      if (NOT_A_RELEASE.test(escapeWindow)) continue;

      // --- historical exemption, cancels applied in BOTH directions ---
      const markerIdx = before.search(MARKER_WORDS);
      const cancelBeforeIdx = before.search(CANCELS_BEFORE);
      // A current-state word only cancels when it is ADJACENT to the token
      // (within CANCEL_WINDOW chars). Without that bound,
      // "since the current default landed, 0.10.0 added it" was blocked —
      // "current" there describes the DEFAULT, not the version.
      const CANCEL_WINDOW = 20;
      const nearToken = cancelBeforeIdx >= 0 && before.length - cancelBeforeIdx <= CANCEL_WINDOW;
      // With a marker word present, a current-state word only cancels if it
      // comes AFTER it ("since 0.10.0 - now 0.12.9" cancels; "currently
      // stateless, added in 0.10.0" does not). With NO marker word, the
      // exemption can only come from a `+` suffix or a trailing marker, and
      // any preceding current-state word cancels it — otherwise
      // "current 0.12.9+" and "current 0.12.9 added" smuggle straight through.
      const cancelledBefore =
        cancelBeforeIdx >= 0 && nearToken && (markerIdx < 0 || cancelBeforeIdx > markerIdx);
      const cancelledAfter = CANCELS_AFTER.test(after);
      const cancelled = cancelledBefore || cancelledAfter;

      const marked =
        tok.endsWith("+") || MARKER_BEFORE.test(before) || MARKER_AFTER.test(after);

      if (marked && !cancelled) {
        checked.push(`${file}:${i + 1}: ${tok} (historical, exempt)`);
        continue;
      }
      checked.push(`${file}:${i + 1}: ${tok}`);
      if (tok !== expected) {
        failures.push(
          `${file}:${i + 1}: version token "${tok}" is neither package.json's "${expected}" ` +
            `nor marked historical (since/added in/introduced in/shipped in/vX+). ` +
            `If it is not this package's release version, add [not-a-release-version] on the line ` +
            `— do NOT publish with --ignore-scripts. Line: ${line.trim().slice(0, 90)}`
        );
      }
    }
  });
  return { failures, checked };
}

function main() {
  const EXPECTED = JSON.parse(read("package.json")).version;
  const failures = [];
  const checked = [];

  for (const [file, pick] of JSON_VERSION_SITES) {
    let j;
    try {
      j = JSON.parse(read(file));
    } catch {
      continue;
    }
    for (const v of pick(j).filter(Boolean)) {
      checked.push(`${file}: ${v}`);
      if (v !== EXPECTED) failures.push(`${file}: version field is "${v}", expected "${EXPECTED}"`);
    }
  }

  for (const file of PROSE_SITES) {
    let text;
    try {
      text = read(file);
    } catch {
      continue;
    }
    const r = auditText(file, text, EXPECTED);
    failures.push(...r.failures);
    checked.push(...r.checked);
  }

  console.log(`package.json version: ${EXPECTED}`);
  console.log(`version tokens examined: ${checked.length}`);
  for (const c of checked) console.log(`  ok  ${c}`);
  if (failures.length) {
    console.error(`\nFAIL — ${failures.length} version claim(s):`);
    for (const f of failures) console.error(`  x ${f}`);
    process.exit(1);
  }
  console.log("\nPASS — every version token agrees with package.json or is marked historical.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
