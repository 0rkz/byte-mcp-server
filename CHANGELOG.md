# Changelog

## Unreleased

**Docs-only version-claims sweep.** 0.13.0 is already published and immutable, so nothing
here is in the published 0.13.0 tarball — these land in the next release.

- **`smithery.yaml` says `current 0.13.0`** (was `current 0.11.3`, stale since 0.11.x). The four
  `since 0.10.0` / `v0.10.x+` markers in that file are historical facts and are deliberately unchanged.
- **New release gate `scripts/check-version-claims.mjs`, wired into the release path** (`npm run
  check:versions`, run by `prepublishOnly` before the build and as a CI step — a failing check blocks
  the publish). Rule: every version token must equal `package.json` **or** carry an explicit historical
  marker (`since X`, `added in X`, `vX+`); anything else fails. Stated as an allowlist on purpose —
  an earlier form tried to detect "current" phrasings and 11 of 13 planted variants passed silently.
  The naive alternative — force every version token to equal `package.json` — would instead have
  rewritten this repo's four true `since`/`vX+` markers into false ones.
  `as of` is deliberately NOT a historical marker: it states currency, not history, and was smuggling
  stale claims through the allowlist. Current-state words cancel a marker in both directions, and a
  version owned by something else (an IP, `node 20.20.2`, a dependency) is skipped rather than
  blocking the publish — a false block is worse than a miss here, because the reflex it trains is
  `--ignore-scripts`, which disables the gate outright. Unrecognised cases still fail loud and the
  error names the `[not-a-release-version]` escape hatch.
  Its header documents the limit honestly: the phrase lists are enumerations and cannot be closed, so
  the gate is a high-value tripwire for the realistic failure (a bare version token left behind when
  `package.json` moves) rather than a proof of correctness.
- **The gate ships with its own test harness** (`test/check-version-claims.test.mjs`, `npm run
  test:gate`, also a CI step). Every row in it is an attack that actually broke an earlier version of
  the gate, or a true statement an earlier version wrongly blocked — 21 must-fail, 21 must-pass.
- **`byte_buy_data`'s documented success gate is correct.** README said
  `verification.verified === true`; the tool emits `gatewayVerified` (`verified` belongs to
  `byte_verify_payload`). The example's `reason` string is now the one the code actually emits.
- **The Claude Desktop example no longer points `INDEXER_URL` at `http://localhost:8080`**, which
  broke the indexer-backed tools for anyone pasting it (`byte_search_publishers`,
  `byte_list_my_subscriptions`, `byte_subscription_health`, `byte_query_fact`). The hosted default
  has been correct since 0.10.4 (2026-05-25) — the example, not the default, was the defect.
- **Subscribe pricing is described as per-publisher** (read from the publisher's on-chain schema)
  instead of a flat `$0.003/KB`, which the code never fixed.
- **`observed_price_atomic` examples are placeholders**, not the literal `"100000"` ($0.10).
- **Scope language tightened** in SKILL.md: the attestation is evidence of authenticity, not a
  guarantee about content, and `verified: false` no longer claims tampering is the only cause.
- **`MAX_PAYMENT_USDC` is documented in SKILL.md** — it was in the README and `.env.example` but not
  in the agent-facing skill file, and it is the only spend guard the package ships.
- Dead Smithery badge image (HTTP 500) replaced with a plain link; install command name aligned
  across README and SKILL.md.
- **`claude-desktop-config.json` and `.env.example` carried the same `INDEXER_URL=localhost:8080`
  ghost**; `.env.example` also labelled it "default shown below" and listed a `faucet` tool that does
  not exist. Both corrected.
- `llms-install.md` carried the same `verification.verified` and "Cheapest way" claims as the README;
  both corrected there too.

## 0.13.0 — 2026-09-09

**Release of work already on main since 0.12.3 (published 2026-08-21).** No new tools; the
two served tool-schema descriptions below are what an agent actually reads, which is why this
is a minor and not a patch.

- **Served schema copy carries no typed prices.** `byte_query_fact.max_byte_cost` said
  "≈$1 at $0.0005/byte"; it now points at the publisher's registered price-per-KB and names
  `byte_get_publisher` / `byte_search_publishers` as where to read it. `byte_buy_data`'s output
  `price` example was `'$0.003000'` — equal to a live feed price at the time — and is now a
  format-only example. `byte_buy_data`'s tool description also dropped a hardcoded feed name
  and price.
- **README and SKILL.md derive every price** from the 402 challenge and the live feed list
  (https://x402.payperbyte.io/feeds) instead of repeating numbers that drift when the catalog
  changes. The "flagship" label is gone from both.
- **`byte_list_feeds` returns `pricePerCall`**; `pricePerKB` remains as a deprecated alias and
  resolves from the same source value, so the two fields are always identical. Both carry the
  gateway catalog's price string verbatim — a dollar-formatted value such as `$0.0050`, not
  atomic units — and the schema descriptions now say exactly that instead of asserting a unit
  this server never converts to.
- **Dependencies.** The package's audit surface went from 8 advisories at 0.12.3 to 0: a
  lockfile refresh (viem 2.55.19) cleared six, raising the `qs` override floor to `^6.16.0`
  cleared one, and `hono` 4.13.7 cleared the last. Of those, only the `qs` override is a
  `package.json` change and therefore ships; lockfiles are not published. `overrides` are
  honoured only when this package is the root project, so installing it as a dependency
  resolves exactly as before.
- **Docs.** One reciprocal directory link added to the README Links section.

Note: 0.12.0 through 0.12.3 were released without CHANGELOG entries. This entry covers what
changed since 0.12.3 only; it does not reconstruct those four releases.

## 0.11.9 — 2026-07-03

**Docs / metadata sync.** README install snippets now use `payperbyte` as the MCP server key (retiring the old `byte-library` slug), and the verdict-tier pricing copy is synced to $0.10 (the x402-fetch default-client cap). No tool, schema, or settlement-code changes.

## 0.11.8 — 2026-07-02

- **Optional server-side spend cap for `byte_buy_data` — `MAX_PAYMENT_USDC`.** When set (decimal USDC, e.g. `0.25`), any 402 quote above the cap is refused *before* any payment is signed — exact bigint comparison in 6-decimal USDC units, **fail-closed** on an unparseable quote or cap value ("never guess about money"). Unset = uncapped (unchanged behavior); a dedicated thin wallet remains the hard backstop. (`enforceSpendCap`.)
- **Dependencies.** `@x402/core` and `@x402/evm` pinned to exactly `2.13.0` in the lockfile.
- **Docs.** README env-table row for `MAX_PAYMENT_USDC` + a short starter-kits section (free/MIT framing).

## 0.11.7 — 2026-06-28

**Two-leg `byte_buy_data` verification + single-sourced version.** The buy path now verifies the `X-BYTE-Attestation` receipt over both legs before returning bytes — it recomputes `keccak256` of the delivered payload AND recovers the EIP-712 signer, confirming the signer is the named publisher — instead of checking only one. The package version is now read from a single source so `package.json`, `server.json`, and the running server can't drift apart. `byte_buy_data`'s description was updated to match. (R4/R5 hardening.)

## 0.11.6 — 2026-06-25

**Reconciliation/republish bump.** Version incremented to clear npm's already-published-version 403 after a `prepublishOnly` rebuild; no functional change versus 0.11.5. The substantive two-leg-verify hardening this bump was staged for fully landed in 0.11.7.

## 0.11.5 — 2026-06-25

- **`byte_query_fact` honesty wording.** Tool description tightened to the authenticity/tamper-evidence scope — "proves who signed the exact bytes," not that the data is correct.
- **`buy.ts` fail-closed hardening.** The buy path halts rather than proceeding when it cannot verify state.
- **`package.json` description** aligned to the same honest scope wording.

## 0.11.4 — 2026-06-25

- **`byte_buy_data` POST support.** Agents can now buy the POST verdict oracles over MCP (previously GET feeds only).
- **Inline verify-before-act on the `X-BYTE-Attestation` receipt.** `byte_buy_data` recomputes the payload hash and checks the receipt inline on delivery, and **fails closed (`isError`) when a receipt does not verify** rather than returning unverified bytes.
- **Attestation signer chainId derived from `CONFIG`** to prevent migration desync — the EIP-712 signing domain can no longer silently drift from the configured chain.
- **Docs.** README demo CTA points at `npx @foreseal/demo` (post-migration consumer rename); the Kit/Gate/demo one-liner is surfaced in the README.

## 0.11.3 — 2026-06-13

**Discoverability / brand pass.** `server.json`, `smithery.yaml`, and `package.json` normalized to the PayPerByte display name with Base-mainnet x402 framing and refreshed brand keywords. Also: catalog cache + a dynamic `byte_buy_data` slug list (the buyable-feed set is derived from the live catalog instead of hardcoded); a probe wash-safe split; and `repository.url` normalized to the `git+https` form. No tool, schema, or settlement-code changes.

## 0.11.2 — 2026-06-10

**Truth pass: the x402 payment rail is live on Base mainnet.** Docs, tool descriptions, and package metadata now state the two rails honestly instead of the blanket "testnet only" frame:

- **x402 pay-per-call (`byte_buy_data`): Base mainnet (`eip155:8453`), real USDC.** The buy path was already challenge-driven (it signs whatever network the gateway's 402 challenge quotes), so no code change was needed for settlement — the gateway flipped, and the docs now say so. Flagship feed: the $0.05 Address Reputation Oracle (signed ALLOW/WARN/BLOCK verdict on a receiving address). Paid 200s carry the `X-BYTE-Attestation` EIP-712 receipt header.
- **On-chain layer (subscriptions, broadcasts, fact-oracle escrow, indexer): unchanged — Arbitrum Sepolia testnet (chain `421614`)**, mainnet gated on an external security audit. The EIP-712 `PayloadAttestation` signing domain stays anchored at `421614` regardless of payment rail.
- `byte_buy_data` and `byte_get_token_balances` tool descriptions updated accordingly (`byte_get_token_balances` now states explicitly that it does NOT show the Base-mainnet balance buys spend from).
- `PRIVATE_KEY` guidance flipped from "testnet-only wallet" to "dedicated wallet holding only what you intend to spend" — one key signs real Base-mainnet USDC for buys and testnet txs for everything else.
- Doc fixes: README env table showed the pre-0.10.4 `INDEXER_URL` default (`localhost:8080` → `https://feeds.payperbyte.io`); same fix in the `byte_list_my_subscriptions` input description. llms-install.md claimed 10 read-only tools (it's 9 — `byte_query_fact` requires a key). manifest.json `PRIVATE_KEY` description referenced a "faucet" tool that doesn't exist.

No tool, schema, or settlement-code changes — descriptions and metadata only.

## 0.11.1 — 2026-06-03

**Branding: consolidated the display name to PayPerByte.** Normalized the display/marketing name across the npm description, `server.json`, `manifest.json`, and the README to one brand — **PayPerByte** — and retired the fragmented "BYTE Library" display name. No code or API changes: the package name (`byte-mcp-server`), the MCP Registry id (`io.github.0rkz/byte-protocol`), and the `byte_*` tool names are all unchanged, so existing installs and configs are unaffected.

## 0.11.0 — 2026-06-03

**New tool: `byte_verify_payload` — verify-before-act** (15 tools total). The provenance gate the whole protocol is built around, now exposed over MCP. An agent recomputes `keccak256` of the bytes it received and checks them against the publisher's on-chain EIP-712 `PayloadAttestation` *before acting* — anchored by either an `expectedHash` it already holds (e.g. from `byte_query_fact` / `byte_buy_data`) or the settlement `txHash` (which also recovers the attestation signer and confirms it is the named publisher). On `verified: false` the bytes were tampered or corrupted in transit and the agent must refuse. Read-only; no wallet or payment required. Implemented in `src/lib/verify.ts`.

- **Test hardening.** `test/r2-publish-smoke.mjs` now pins its EIP-712 domain to `config.ts` (`ADDRESSES.DataStream` / `CONFIG.chainId`) — the same source the real publish path reads — instead of a hardcoded constant. It had been carrying the dead v1 DataStream (`0x4b24...4c053`, the same address the 0.10.4 config bug fixed), so it was validating the wrong domain; it now validates production and can't silently drift on future redeploys.

## 0.10.6 — 2026-05-27

**`registerTool` migration.** All 14 tools moved to the SDK's `registerTool` API with explicit `outputSchema` + `annotations` (readOnly / destructive / idempotent / openWorld hints) for richer client and scanner introspection.

## 0.10.5 — 2026-05-27

**Description-only patch + MCP Registry copy refresh.** `package.json` / `server.json` descriptions trimmed to the ≤100-char registry schema cap and aligned with the README hero. No code-path changes.

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
