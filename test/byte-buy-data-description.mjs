#!/usr/bin/env node
/**
 * Verification for the 2026-08-04 fix: byte_buy_data's tool description
 * used to hand-list "the 9 POST oracles" — wrong three ways (count, two
 * dead feeds still named, merchant-screen omitted). The fix derives the
 * oracle clause from the SAME live catalog buildFeedSlugDescribe() already
 * reads (getCachedCatalog(), primed by primeCatalogCache() at startup).
 *
 * Follows the SAME pattern as test/e2e.mjs: spawn the real compiled server
 * (dist/index.js) via the MCP stdio protocol, call tools/list, and inspect
 * the actual served tool description — not an extracted string fragment.
 * No payment tool is ever invoked (byte_buy_data is only LISTED, never
 * CALLED), so no PRIVATE_KEY and no real money is at risk either test run.
 *
 * Run: cd mcp-server && npm run build && node test/byte-buy-data-description.mjs
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER_PATH = new URL("../dist/index.js", import.meta.url).pathname;

let PASS = 0;
let FAIL = 0;
function assert(cond, label, detail) {
  if (cond) {
    PASS++;
    console.log(`  ✓ ${label}`);
  } else {
    FAIL++;
    console.log(`  ✗ ${label}${detail ? `  <- ${detail}` : ""}`);
  }
}

async function getByteBuyDataDescription(env) {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH],
    env: { ...process.env, ...env },
  });
  const client = new Client(
    { name: "byte-mcp-buy-data-description-test", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === "byte_buy_data");
  await client.close();
  return tool;
}

async function main() {
  console.log("\n━━━ 1. Populated catalog (real gateway — read-only GET, no payment) ━━━");
  const tool = await getByteBuyDataDescription({});
  assert(!!tool, "byte_buy_data tool is registered");
  const desc = tool?.description ?? "";
  console.log(`  description: ${desc}`);

  assert(desc.includes("merchant-screen"), "description CONTAINS merchant-screen (live, was omitted before)");
  assert(!desc.includes("evidence-pack"), "description does NOT contain evidence-pack (delisted 2026-07-28)");
  assert(!desc.includes("liquidation-stream"), "description does NOT contain liquidation-stream (delisted 2026-07-28)");
  assert(!/\bthe 9 POST oracles\b/.test(desc), "description does NOT say 'the 9 POST oracles' (the stale hardcoded count)");
  assert(/\bPOST oracle/.test(desc), "description still names the POST-oracle concept at all");
  // The count is DERIVED, not hardcoded — whatever it says must match the
  // number of names actually listed, so a future catalog change can't
  // silently desync count-vs-list the way "the 9" did.
  const countMatch = desc.match(/the (\d+) POST oracles? — ([^—]+) —/);
  assert(!!countMatch, "description contains a 'the N POST oracle(s) — a, b, c —' clause", desc);
  if (countMatch) {
    const claimedCount = Number(countMatch[1]);
    const names = countMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
    assert(claimedCount === names.length,
      `claimed count (${claimedCount}) matches the actual number of names listed (${names.length})`,
      countMatch[2]);
    assert(names.includes("merchant-screen"), "merchant-screen is one of the listed names");
  }

  console.log("\n━━━ 2. Empty-catalog path degrades — NEVER falls back to a hardcoded list ━━━");
  const toolEmpty = await getByteBuyDataDescription({
    // An address nothing listens on — primeCatalogCache()'s fetch fails fast
    // and its try/catch leaves the cache empty, exactly like a real outage.
    BYTE_GATEWAY_URL: "http://127.0.0.1:1",
  });
  const descEmpty = toolEmpty?.description ?? "";
  console.log(`  description: ${descEmpty}`);
  assert(!!toolEmpty, "byte_buy_data is still registered with an empty catalog (degrades, doesn't crash)");
  assert(descEmpty.includes("x402.payperbyte.io/feeds"), "empty-catalog description points at the live catalog URL");
  assert(!descEmpty.includes("merchant-screen"), "empty-catalog description does NOT name any specific oracle");
  // NOTE: "address-reputation" legitimately appears elsewhere in this same
  // description as the static "flagship address-reputation: $0.10/verdict"
  // price example — unrelated pre-existing text this fix never touches. The
  // real assertion is that the ORACLE-LIST CLAUSE itself has no "— name,
  // name, name —" pattern, i.e. no derived-looking list survived the degrade.
  assert(!/the \d+ POST oracles? — [^—]+ —/.test(descEmpty),
    "empty-catalog description has NO 'the N POST oracles — a, b, c —' clause — proves no fallback list exists",
    descEmpty);
  assert(!/\bthe \d+ POST oracles?\b/.test(descEmpty), "empty-catalog description does NOT claim a specific count");

  console.log(`\n${"=".repeat(60)}\n${PASS} passed, ${FAIL} failed`);
  process.exit(FAIL ? 1 : 0);
}

main().catch((e) => {
  console.error("Test runner crashed:", e);
  process.exit(2);
});
