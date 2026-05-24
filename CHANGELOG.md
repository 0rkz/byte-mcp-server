# Changelog

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
