# Changelog

## 0.10.4 — 2026-05-25

**Bugfix: stale r2 DataStream address + hosted-indexer default.** Two real bugs surfaced by a smoke test against the v0.10.3 npm install:

- **DataStream pointer was pre-r2.** `src/lib/config.ts` carried the original v1 DataStream address (`0x4b24...4c053`) instead of the r2 redeploy (`0x44729bB1...e06e95`). Every write tool (`byte_subscribe`, `byte_buy_data`, `byte_publish_data`, `byte_unsubscribe`) in 0.10.3 was targeting the pre-r2 contract — so EIP-712 PayloadAttestation receipts were silently bypassed and writes hit the wrong settlement surface. 0.10.4 points at the r2 deploy. **Anyone on 0.10.0–0.10.3 should upgrade before any write operation.**
- **Indexer default was localhost.** `INDEXER_URL` and `BYTE_INDEXER_URL` both defaulted to `http://localhost:8080`, so a fresh install with no env vars 404'd on every indexer-backed tool (`byte_list_feeds`, `byte_search_publishers`, `byte_list_my_subscriptions`, `byte_subscription_health`). New default is `https://feeds.payperbyte.io`; both env-var names are honored. Local-dev override via `INDEXER_URL=http://localhost:8080` still works.

Also: `tools/wallet.ts` was hardcoding `http://localhost:8080` as a function-parameter default instead of falling through to `CONFIG.indexerUrl` — fixed in the same pass. `src/index.ts` now imports the indexer URL from the central config rather than reading the env var twice.

## 0.10.3 — 2026-05-24

**Marketplace listing upgrades.** Targets the 7.3 → ~9 score jump on `mcp-marketplace.io`:

- **SDK pin tightened** from `^1.12.1` to `^1.29.0` — clears the 3 high-severity CVEs flagged by the marketplace's scanner (which resolves the wide caret range to its worst version, even though `npm audit` was locally clean). `@modelcontextprotocol/sdk@1.29.0` is the current latest.
- **`server.json` declares HTTP transport** — adds a `remotes` entry pointing at `https://mcp.payperbyte.io/mcp` (the Smithery-backed hosted endpoint). Bumps the Marketplace's "Local Plugin" classification toward hybrid local + remote.
- **Description rewrites** in `server.json` + `manifest.json` to BYTE Library framing (drops residual "slashable" / "publishers slashed" v0.6 carryover; matches the BYTE Library no-token, first-party-publisher pivot).

No code-path changes. Stdio and HTTP transports behave identically to 0.10.2.

## 0.10.2 — 2026-05-24

**Scanner-friendly session handling.** Smithery's hosted scanner (and other discovery clients) don't propagate the `Mcp-Session-Id` header on follow-up requests after `initialize`. 0.10.1's strict 400 fallback broke their tools discovery flow. 0.10.2 adds two graceful paths:

- **Orphan notifications** (`notifications/initialized` and friends without a session id) → 202 ACK and drop, per JSON-RPC notification semantics.
- **Orphan JSON-RPC requests** (`tools/list` etc. without a session id) → routed through a one-shot stateless transport so scanners get a real answer.

Verified end-to-end with Smithery's scan: 14 tools enumerated cleanly. Stateful clients (Claude Desktop, Cursor) that correctly propagate the session header are unaffected — they continue to share a long-lived per-session transport.

## 0.10.1 — 2026-05-24

**Fixes Smithery auto-scan.** 0.10.0 shipped HTTP transport with a single shared `McpServer` instance — the SDK errored `Already connected to a transport` on every session after the first, breaking Smithery's discovery scan and any concurrent client. 0.10.1 wraps the server setup in a `createMcpServer()` factory and spawns a fresh instance per session (canonical multi-session pattern). Stdio mode unchanged.

## 0.10.0 — 2026-05-24

**HTTP transport (`StreamableHTTPServerTransport`).** New runtime mode lets `byte-mcp-server` run as a hosted HTTP MCP endpoint, in addition to the existing stdio mode. Activated by `--http` flag or `MCP_TRANSPORT=http`. Listens on `PORT` (default 8787) with `POST /mcp` for MCP traffic and `GET /health` for liveness probes.

Drives the Smithery hosted listing (`https://mcp.payperbyte.io/mcp`) — Smithery now requires HTTP-transport MCP servers behind a public URL for one-click installs, rather than mounting Docker containers. Local stdio installs (Claude Desktop / Cursor) are unchanged — no flag = stdio, exactly as before.

No tool API changes; no breaking changes for existing stdio integrations. Minor bump.

## 0.9.2 — 2026-05-23

Two Marketplace-listing fixes shipped together:

1. **CVE fix that actually propagates to installers.** 0.9.1 cleared the audit locally via lockfile pins, but `package-lock.json` isn't in the published tarball — so anyone installing `byte-mcp-server` got fresh dependency resolution and the unfixed transitive deps. 0.9.2 moves the pins into `package.json`'s `overrides` field (npm 8.3+), which DOES propagate. `npm audit` post-install returns 0 vulnerabilities for consumers, not just for our local checkout.

2. **README republish.** The 0.9.x npm tarballs were shipping the pre-rewrite README (the one with stale Byte-Protocol / PQS / PPB / faucet framing). 0.9.2 ships the rewritten README from commit `d9a1128`.

Plus an explicit testnet warning callout near the top — addresses the Marketplace's "no explicit testnet warning" finding. No code change.

## 0.9.1 — 2026-05-23

Security: bumped transitive deps (`fast-uri`, `hono`, `ip-address`, `qs`) to clear 5 CVEs flagged on the Marketplace listing. `@modelcontextprotocol/sdk` stays at `1.29.0` (already latest); fixes are via lockfile overrides. No API change.

## 0.9.0 — 2026-05-23

**EIP-712 PayloadAttestation prep for DataStreamLib r2.** `byte_publish_data` now signs the payload as an EIP-712 PayloadAttestation (domain `BYTE Library` / version `1` / Arb Sepolia chainId 421614), ready for the upcoming r2 contract revision. The signing path is live in this release; the contract upgrade lands on Arbitrum Sepolia shortly.

**Migration-window warning:** `byte_publish_data` will revert against the current v1 contract during the cut-over — the new 5-arg `streamData` signature isn't accepted until r2 deploys. Read-only, `byte_subscribe`, `byte_query_fact`, and `byte_buy_data` are unaffected and work normally throughout.

## 0.8.0 — 2026-05-23

**Pay-per-call (`byte_buy_data`).** New tool exposing the BYTE Library [x402 gateway](https://x402.payperbyte.io/feeds): an agent can buy a single data packet from any of the catalog feeds (weather, earthquakes, crypto, DeFi yields, news, threat-intel, …) with no subscription, no allowance, no prior on-chain setup. Signs EIP-3009 USDC `transferWithAuthorization`; the x402 facilitator settles on-chain.

## 0.7.4 — 2026-05-23

`byte_subscribe` now bundles `approve(max)` by default — closes the silent-payment-failure footgun where the contract's allowance-skip path delivered data with `amount=0` after a finite allowance was depleted. Auto-approve is a no-op when the wallet already has ≥ $1000 USDC of allowance to DataStreamLib. Opt out with `skipAllowance: true`.

## 0.7.3 — 2026-05-22

**Rewritten for BYTE Library** (the no-token, first-party data marketplace) — dropped the v0.6 BYTE Protocol PPB / PQS / ReputationEngine surface. Bundled contract addresses re-pointed to the BYTE Library deployment on Arbitrum Sepolia. USDC 6-decimal fee handling fixed.

## 0.7.0 — 2026-05-20

v0.6 BYTE Protocol contract redeploy. Bundled default addresses re-pointed: `DataRegistry`, `DataStream`, `ReputationEngine`, and the USDC token (now `MockUSDC3009`, EIP-3009-enabled). `SchemaRegistry`, `PPBToken`, `PQSVerifier` reused from v0.5.

> *Note: superseded by the 0.7.3 BYTE Library pivot — v0.6 BYTE Protocol is decommissioned. This entry is preserved for upgrade-path archeology only.*

## 0.6.0 — pre-2026-05-20

**EIP-712 signatures added to `byte_query_fact`.** Closes the "spend someone else's escrow" attack: previously, any actor could submit a `/query` naming any subscriber's address and burn that subscriber's on-chain USDC escrow on an answer they never asked for. The fact-oracle server now requires every `/query` request to include a `subscriber_signature` that recovers to the claimed `subscriber_address`. Set `PRIVATE_KEY` to the subscriber EOA; the MCP server signs each query automatically.
