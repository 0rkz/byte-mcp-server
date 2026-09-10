#!/usr/bin/env node
/**
 * assert-deps.mjs — prove the installed dependency tree matches package-lock.json.
 *
 * WHY THIS EXISTS (2026-09-09, LOCAL c314e5)
 * ------------------------------------------
 * None of the deploy scripts installed dependencies. `npm run build` is bare `tsc`,
 * which compiles against whatever node_modules already holds, so a commit that
 * changes ONLY package.json + package-lock.json — the exact shape of every
 * Dependabot bump — rebuilt cleanly, restarted cleanly, printed a success banner,
 * and shipped the OLD dependency tree. Measured that day across three services:
 * ws 8.18.3, axios 1.16.0 and qs 6.15.2 were all still live after their bumps had
 * been committed, pushed and "deployed".
 *
 * `npm ci` exiting 0 is necessary but NOT sufficient. A partial write, a postinstall
 * that mutates node_modules, an interrupted earlier run, or a package resolved from
 * a stale cache all survive a zero exit. This asserts what is actually on disk.
 *
 * THE TRAP THIS AVOIDS — read with fs, never require()
 * ---------------------------------------------------
 * `require('<pkg>/package.json')` throws ERR_PACKAGE_PATH_NOT_EXPORTED for any
 * package whose "exports" map omits "./package.json". Measured the same day on
 * BOTH `hono` and `@coinbase/cdp-sdk`. A version check written that way does not
 * error visibly — it reports the package as missing, which reads as "not installed"
 * for a package that is installed and correct. Every read here is fs.readFileSync.
 *
 * SCOPE: every top-level `node_modules/<name>` entry in the lock. Nested entries
 * (`node_modules/a/node_modules/b`) are deliberately skipped — they are duplicate
 * resolutions of a transitive dep, and asserting them turns a legitimate tree into
 * a failure. Optional deps absent from the platform are reported, not fatal.
 *
 * EXIT: 0 = every checked package matches. 1 = at least one mismatch or a missing
 * non-optional package. 2 = could not run the check at all (missing lock, bad JSON)
 * — deliberately distinct, because "I could not verify" must never read as "verified".
 *
 * USAGE:  node scripts/assert-deps.mjs [--quiet] [pkg ...]
 *   With package names, checks only those (used to spotlight a specific bump).
 *   Without, checks the whole top-level tree.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const only = args.filter((a) => !a.startsWith("--"));

const LOCK = "package-lock.json";
if (!existsSync(LOCK)) {
  console.error(`[assert-deps] CANNOT VERIFY: ${LOCK} not found in ${process.cwd()}`);
  process.exit(2);
}

let lock;
try {
  lock = JSON.parse(readFileSync(LOCK, "utf8"));
} catch (e) {
  console.error(`[assert-deps] CANNOT VERIFY: ${LOCK} is not valid JSON — ${e.message}`);
  process.exit(2);
}
if (!lock.packages) {
  console.error(`[assert-deps] CANNOT VERIFY: ${LOCK} has no "packages" map (lockfileVersion ${lock.lockfileVersion ?? "?"}; v2+ required)`);
  process.exit(2);
}

/** Top-level entries only: "node_modules/x" and "node_modules/@scope/x". */
const wanted = [];
for (const [path, meta] of Object.entries(lock.packages)) {
  if (!path.startsWith("node_modules/")) continue;
  const name = path.slice("node_modules/".length);
  if (name.includes("/node_modules/")) continue;
  if (!meta || !meta.version) continue;
  if (only.length && !only.includes(name)) continue;
  wanted.push({ name, expected: meta.version, optional: Boolean(meta.optional) });
}

if (only.length) {
  const missing = only.filter((n) => !wanted.some((w) => w.name === n));
  if (missing.length) {
    console.error(`[assert-deps] CANNOT VERIFY: not present in the lock: ${missing.join(", ")}`);
    process.exit(2);
  }
}
if (!wanted.length) {
  console.error("[assert-deps] CANNOT VERIFY: the lock declares no top-level packages to check");
  process.exit(2);
}

const mismatched = [];
const missing = [];
const missingOptional = [];
let ok = 0;

for (const { name, expected, optional } of wanted) {
  const pj = join("node_modules", name, "package.json");
  if (!existsSync(pj)) {
    (optional ? missingOptional : missing).push({ name, expected });
    continue;
  }
  let installed;
  try {
    installed = JSON.parse(readFileSync(pj, "utf8")).version;
  } catch (e) {
    mismatched.push({ name, expected, installed: `UNREADABLE (${e.message})` });
    continue;
  }
  if (installed === expected) ok++;
  else mismatched.push({ name, expected, installed });
}

const bad = mismatched.length + missing.length;
if (!quiet || bad) {
  console.log(`[assert-deps] ${ok}/${wanted.length} top-level packages match package-lock.json`);
}
for (const m of mismatched) {
  console.error(`[assert-deps]   MISMATCH ${m.name}: lock says ${m.expected}, installed ${m.installed}`);
}
for (const m of missing) {
  console.error(`[assert-deps]   MISSING  ${m.name}: lock says ${m.expected}, not installed`);
}
if (missingOptional.length && !quiet) {
  console.log(`[assert-deps]   (${missingOptional.length} optional package(s) absent — not a failure)`);
}
if (bad) {
  console.error("[assert-deps] FAIL: the running tree does not match the lock. Run `npm ci` and redeploy.");
  process.exit(1);
}
process.exit(0);
