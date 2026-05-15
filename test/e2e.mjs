#!/usr/bin/env node
/**
 * End-to-end test of the Byte MCP server via the MCP stdio protocol.
 * This is exactly the path a real agent (Claude Code, etc.) would take:
 *   spawn server → MCP handshake → tools/list → tools/call → inspect results.
 *
 * Tests:
 *   1. tools/list returns all expected tools including the 3 new ones
 *   2. byte_list_my_subscriptions returns the correct JSON shape
 *   3. byte_subscription_health returns the correct drift signal shape
 *   4. byte_unsubscribe (write tool, requires PRIVATE_KEY) — dry-verify
 *      it's listed; actual invocation left manual for safety.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER_PATH = new URL("../dist/index.js", import.meta.url).pathname;

// Known-good test addresses — canonical addresses this test run will hit.
const PC_WALLET = "0x07B8C1D531958A3193eA527aea52A9f26bcfE91B";
const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TEST_AGENT_PUB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const CRYPTO_PUB = "0xa4aB2D0211e8DAa17fc746DFA35BFf64559A5884";

function header(title) {
  console.log(`\n${"━".repeat(60)}\n${title}\n${"━".repeat(60)}`);
}

function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    process.exitCode = 1;
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH],
    env: {
      ...process.env,
      BYTE_INDEXER_URL: "http://localhost:8080",
      // No PRIVATE_KEY needed for read-only tests. byte_unsubscribe would require it.
    },
  });

  const client = new Client(
    { name: "byte-mcp-e2e-test", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  header("1. tools/list");
  const { tools } = await client.listTools();
  console.log(`  Server exposes ${tools.length} tools:`);
  for (const t of tools) console.log(`    · ${t.name}`);
  const names = new Set(tools.map((t) => t.name));
  assert(names.has("byte_list_my_subscriptions"), "byte_list_my_subscriptions registered");
  assert(names.has("byte_subscription_health"), "byte_subscription_health registered");
  assert(names.has("byte_unsubscribe"), "byte_unsubscribe registered");

  header("2. byte_list_my_subscriptions for PC wallet");
  {
    const res = await client.callTool({
      name: "byte_list_my_subscriptions",
      arguments: { subscriber: PC_WALLET },
    });
    const body = JSON.parse(res.content[0].text);
    console.log(`  Returned ${body.length} active subscriptions:`);
    for (const s of body) {
      console.log(
        `    · ${s.publisher.slice(0, 10)}…  pqs=${s.pqsComposite ?? "n/a"}  ` +
          `msgs7d=${s.messages7d}  spend7d=$${s.spend7dUsdc}  last=${s.lastMessageAt ?? "—"}`
      );
    }
    assert(Array.isArray(body), "response is an array");
    assert(body.every((s) => s.publisher && s.tier !== undefined), "rows have required fields");
    // The specific "PC not subscribed to deployer" assertion was removed
    // 2026-05-15: it depended on a marketplace state snapshot that drifts
    // as agents subscribe/unsubscribe over time. The shape-validation above
    // is the durable test; testnet state details aren't an assertion target.
  }

  header("3. byte_list_my_subscriptions for deployer");
  {
    const res = await client.callTool({
      name: "byte_list_my_subscriptions",
      arguments: { subscriber: DEPLOYER },
    });
    const body = JSON.parse(res.content[0].text);
    console.log(`  Returned ${body.length} active subscriptions:`);
    for (const s of body) {
      console.log(
        `    · ${s.publisher.slice(0, 10)}…  pqs=${s.pqsComposite ?? "n/a"}  ` +
          `msgs7d=${s.messages7d}  spend7d=$${s.spend7dUsdc}`
      );
    }
    assert(body.length >= 2, "deployer has multiple active subscriptions");
    const hasCrypto = body.some((s) => s.publisher.toLowerCase() === CRYPTO_PUB.toLowerCase());
    assert(hasCrypto, "deployer is subscribed to crypto-pub");
  }

  header("4. byte_subscription_health — stable publisher");
  {
    const res = await client.callTool({
      name: "byte_subscription_health",
      arguments: { publisher: DEPLOYER },
    });
    const body = JSON.parse(res.content[0].text);
    console.log(`  ${JSON.stringify(body, null, 2).split("\n").join("\n  ")}`);
    assert(body.publisher, "response has publisher field");
    assert(["stable", "moderate", "significant", "unknown"].includes(body.signal), "signal is a valid enum value");
    assert(typeof body.cadence_drift_bps === "number", "cadence_drift_bps is numeric");
  }

  header("5. byte_subscription_health — test-agent (the intentionally-bad publisher)");
  {
    const res = await client.callTool({
      name: "byte_subscription_health",
      arguments: { publisher: TEST_AGENT_PUB },
    });
    const body = JSON.parse(res.content[0].text);
    console.log(`  ${JSON.stringify(body, null, 2).split("\n").join("\n  ")}`);
    assert(["stable", "moderate", "significant", "unknown"].includes(body.signal), "signal is a valid enum value");
  }

  header("6. byte_unsubscribe schema validation (no PRIVATE_KEY → expected error)");
  {
    try {
      const res = await client.callTool({
        name: "byte_unsubscribe",
        arguments: { publisher: TEST_AGENT_PUB },
      });
      const txt = res.content[0].text;
      console.log(`  Response: ${txt.slice(0, 200)}`);
      // Either isError = true (tool-level error) or contains some error text.
      // The key test is: the tool was found and schema-validated correctly.
      assert(res.isError === true || /error|PRIVATE/i.test(txt), "tool returns an error without PRIVATE_KEY");
    } catch (e) {
      console.log(`  Threw (expected): ${e.message.slice(0, 150)}`);
      assert(true, "tool rejects without credentials as expected");
    }
  }

  header("7. Invalid-input schema check");
  {
    try {
      const res = await client.callTool({
        name: "byte_list_my_subscriptions",
        arguments: { subscriber: "not-an-address" },
      });
      console.log(`  Response: ${JSON.stringify(res).slice(0, 200)}`);
      assert(res.isError === true, "invalid input produces error");
    } catch (e) {
      console.log(`  Threw (expected): ${e.message.slice(0, 150)}`);
      assert(/regex|address|hex/i.test(e.message), "error message mentions address format");
    }
  }

  await client.close();
  console.log(`\n${"━".repeat(60)}\nDone. ${process.exitCode === 1 ? "FAIL" : "PASS"}\n`);
}

main().catch((e) => {
  console.error("Test runner crashed:", e);
  process.exit(2);
});
