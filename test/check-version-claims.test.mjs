/**
 * Test harness for scripts/check-version-claims.mjs.
 *
 * Every row here came from an attack that ACTUALLY BROKE an earlier version of
 * the gate, or from a true statement an earlier version wrongly blocked. The
 * gate's whole job is to fail loud; a gate with no test can regress to silence
 * without anyone noticing, which is exactly how its first two versions shipped
 * broken. Keep rows; do not prune them when they go green.
 *
 *   MUST_FAIL  — a stale current-state claim. Silence here is the bug.
 *   MUST_PASS  — a true historical statement, or a version that belongs to
 *                something other than this package. A false block here trains
 *                people to reach for `npm publish --ignore-scripts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditText } from "../scripts/check-version-claims.mjs";

const PKG = "0.13.0";
const audit = (line) => auditText("harness", line, PKG).failures.length > 0;

/** Stale current-state claims — every one must FAIL (rc 1). */
const MUST_FAIL = [
  // the 13 planted forms that defeated the "detect current phrasings" design
  "current 0.12.9",
  "current v0.12.9",
  "v0.12.9 (current)",
  "since HTTP; current 0.12.9",
  "now at 0.12.9",
  "running 0.12.9",
  "0.12.9 is the current release",
  "@0.12.9",
  "Current: 0.12.9",
  "currently on 0.12.9",
  "latest: 0.12.9",
  "| transport | 0.12.9 |",
  "version 0.12.9",
  // the 8 smuggling forms that abused the historical allowlist
  "current release: as of 0.12.9",
  "current 0.12.9+",
  "0.12.9 added streaming (current)",
  "current 0.12.9 added",
  "shipped in 0.12.9 (the current release)",
  "as of 0.12.9 this is the version you get",
  "introduced in 0.12.9, still current",
  "since 0.10.0 - now 0.12.9",
  // v4: the foreign-subject guard was a smuggling window (adjacency + npm)
  "on npm: 0.12.9",
  "Published on npm: 0.12.9",
  "hosted on node, current 0.12.9",
  "tsc build, now 0.12.9",
  "sdk: current 0.12.9",
  // v4: the escape hatch was line-scoped, exempting a real claim further along
  "node 20.20.2 [not-a-release-version] and current 0.12.9",
];

/** True statements and foreign versions — every one must PASS (rc 0). */
const MUST_PASS = [
  // genuine historical markers, including this repo's own four
  "HTTP default for hosted listings, since 0.10.0",
  "stateless fallback for requests missing session-id (v0.10.2+)",
  "multi-session McpServer factory (v0.10.1+)",
  "full outputSchema on all 15 tools (v0.11.0+ adds byte_verify_payload)",
  "added in 0.10.2",
  "introduced in 0.11.0",
  "shipped in 0.10.1",
  "0.10.0 added streaming",
  "(since 0.10.0)",
  // a current-word that does NOT predicate currency of the version
  "since 0.10.0 the current default",
  "currently stateless, added in 0.10.0",
  "now stateless, since 0.10.2",
  "is the default since 0.10.0",
  // the package's own version is always fine
  `current ${PKG}`,
  PKG,
  // versions that belong to something else — a false block here is the footgun
  "see http://127.0.0.1:8787/health",
  "loopback gateway at 127.0.0.1:3402",
  "requires node 20.20.2",
  "zod 4.6.4 renders unions as a type array",
  "@modelcontextprotocol/sdk 1.30.0",
  "some tool 9.9.9 [not-a-release-version]",
  // v4: a current-word far from the token describes something else, not the version
  "since the current default landed, 0.10.0 added it",
  // v4: foreign subjects still pass when genuinely adjacent
  "Python 3.12.1",
  "node v20.20.2",
];

test("stale current-state claims fail loud", () => {
  const silent = MUST_FAIL.filter((l) => !audit(l));
  assert.deepEqual(silent, [], `these passed silently: ${JSON.stringify(silent, null, 2)}`);
});

test("true historical statements are exempt", () => {
  const blocked = MUST_PASS.filter((l) => audit(l));
  assert.deepEqual(blocked, [], `these were wrongly blocked: ${JSON.stringify(blocked, null, 2)}`);
});

test("a version equal to package.json always passes", () => {
  assert.equal(audit(`current ${PKG}`), false);
  assert.equal(audit(`${PKG}`), false);
});

test("a bumped package.json reds a now-stale doc token", () => {
  assert.equal(auditText("harness", "current 0.13.0", "0.14.0").failures.length, 1);
});
