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

  // CI runs without the indexer; probe it once so the indexer-dependent
  // steps (2-5) skip cleanly instead of crashing on a non-JSON error body.
  let indexerUp = false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    await fetch("http://localhost:8080/publishers", { signal: ctrl.signal });
    clearTimeout(timer);
    indexerUp = true;
  } catch {
    indexerUp = false;
  }
  console.log(
    `\nIndexer at localhost:8080: ${indexerUp ? "reachable" : "NOT reachable — steps 2-5 skip"}`
  );

  header("1. tools/list");
  const { tools } = await client.listTools();
  console.log(`  Server exposes ${tools.length} tools:`);
  for (const t of tools) console.log(`    · ${t.name}`);
  const names = new Set(tools.map((t) => t.name));
  assert(names.has("byte_list_my_subscriptions"), "byte_list_my_subscriptions registered");
  assert(names.has("byte_subscription_health"), "byte_subscription_health registered");
  assert(names.has("byte_unsubscribe"), "byte_unsubscribe registered");
  assert(names.has("byte_query_fact"), "byte_query_fact registered");

  header("2. byte_list_my_subscriptions for PC wallet");
  if (!indexerUp) {
    console.log("  Skipped — indexer not reachable.");
  } else {
    const res = await client.callTool({
      name: "byte_list_my_subscriptions",
      arguments: { subscriber: PC_WALLET },
    });
    const body = JSON.parse(res.content[0].text);
    console.log(`  Returned ${body.length} active subscriptions:`);
    for (const s of body) {
      console.log(
        `    · ${s.publisher.slice(0, 10)}…  topic=${s.topic}  ` +
          `msgs7d=${s.messages7d}  spend7d=$${s.spend7dUsdc}  last=${s.lastMessageAt ?? "—"}`
      );
    }
    assert(Array.isArray(body), "response is an array");
    assert(body.every((s) => s.publisher && s.topic !== undefined), "rows have required fields");
    // The specific "PC not subscribed to deployer" assertion was removed
    // 2026-05-15: it depended on a marketplace state snapshot that drifts
    // as agents subscribe/unsubscribe over time. The shape-validation above
    // is the durable test; testnet state details aren't an assertion target.
  }

  header("3. byte_list_my_subscriptions for deployer");
  if (!indexerUp) {
    console.log("  Skipped — indexer not reachable.");
  } else {
    const res = await client.callTool({
      name: "byte_list_my_subscriptions",
      arguments: { subscriber: DEPLOYER },
    });
    const body = JSON.parse(res.content[0].text);
    console.log(`  Returned ${body.length} active subscriptions:`);
    for (const s of body) {
      console.log(
        `    · ${s.publisher.slice(0, 10)}…  topic=${s.topic}  ` +
          `msgs7d=${s.messages7d}  spend7d=$${s.spend7dUsdc}`
      );
    }
    // Shape-only — subscription counts drift as agents subscribe/unsubscribe.
    assert(Array.isArray(body), "response is an array");
    assert(body.every((s) => s.publisher), "rows have a publisher field");
  }

  header("4. byte_subscription_health — stable publisher");
  if (!indexerUp) {
    console.log("  Skipped — indexer not reachable.");
  } else {
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
  if (!indexerUp) {
    console.log("  Skipped — indexer not reachable.");
  } else {
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

  header("8. byte_query_fact — schema validation (invalid subscriber)");
  {
    try {
      const res = await client.callTool({
        name: "byte_query_fact",
        arguments: {
          question: "What is the capital of France?",
          subscriber_address: "not-an-address",
        },
      });
      console.log(`  Response: ${JSON.stringify(res).slice(0, 200)}`);
      assert(res.isError === true, "invalid subscriber_address rejected");
    } catch (e) {
      console.log(`  Threw (expected): ${e.message.slice(0, 150)}`);
      assert(/regex|address|hex/i.test(e.message), "schema error mentions address format");
    }
  }

  header("9. byte_query_fact — live query (PC wallet, ~25-50s, opt-in)");
  {
    // Live e2e requires: fact-oracle service running on 127.0.0.1:8081,
    // Searxng container up, PC_WALLET subscribed to fact-oracle publisher,
    // and ~30-50s of patience. Opt-in via RUN_LIVE_FACT=1 since CI runs
    // without these preconditions.
    if (process.env.RUN_LIVE_FACT !== "1") {
      console.log("  Skipped (set RUN_LIVE_FACT=1 to run).");
    } else {
      try {
        const res = await client.callTool(
          {
            name: "byte_query_fact",
            arguments: {
              question: "What is the capital of France?",
              subscriber_address: PC_WALLET,
              max_response_latency_ms: 120_000,
            },
          },
          undefined,
          { timeout: 180_000 }
        );
        const text = res.content[0].text;
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          // Server returned a non-JSON error string (e.g. catch-handler path).
          // That still proves the tool ran; just log it.
          console.log(`  Tool returned non-JSON: ${text.slice(0, 200)}`);
          assert(/error|MCP|timeout/i.test(text), "non-JSON response is an error message");
          return;
        }
        console.log(`  ${JSON.stringify(body, null, 2).split("\n").join("\n  ").slice(0, 800)}`);
        if ("error" in body) {
          console.log(`  (live query errored — fact-oracle/Searxng/Ollama may be down)`);
          assert(typeof body.error === "string", "error response has 'error' field");
        } else {
          assert(typeof body.answer === "string" && body.answer.length > 0, "answer present");
          assert(
            body.publisher_address?.toLowerCase() ===
              "0x821cefaff67247a91ea3975cb0f53ba79d3d35a5",
            "matched fact-oracle publisher"
          );
          assert(Array.isArray(body.citations), "citations is an array");
          assert(
            typeof body.confidence === "number" && body.confidence >= 0.7,
            "confidence ≥ threshold"
          );
          assert(/^0x[a-fA-F0-9]{64}$/.test(body.payload_hash), "payload_hash is 32-byte hex");
        }
      } catch (e) {
        console.log(`  Live query exception: ${e.message?.slice(0, 200)}`);
        assert(/timeout|McpError|fetch|network/i.test(e.message || ""), "exception is a transport-level error (non-fatal)");
      }
    }
  }

  await client.close();
  console.log(`\n${"━".repeat(60)}\nDone. ${process.exitCode === 1 ? "FAIL" : "PASS"}\n`);
}

main().catch((e) => {
  console.error("Test runner crashed:", e);
  process.exit(2);
});
