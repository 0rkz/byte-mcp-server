---
name: payperbyte
description: >-
  Buy or subscribe to verified, provenance-first data for AI agents via
  PayPerByte (machine name BYTE Library) — per-byte USDC feeds with no API key
  and no token. Use when an agent needs trustworthy external data it can act
  on: a signed go/no-go on a receiving address before paying it (flagship),
  crypto/DeFi markets, weather, earthquakes, space weather, news, OSS releases,
  threat-intel, CVE/package/wiki facts, merchant trust, x402 network metrics,
  perp funding, stablecoin/bridge rails, or slashable fact/legal/evidence
  oracles. The differentiator is verify-before-act: every payload carries an
  EIP-712 PayloadAttestation, so the agent can prove the exact bytes and the
  publisher before trusting the data. x402 pay-per-call settles real USDC on
  Base mainnet; the on-chain subscription/attestation layer is Arbitrum Sepolia
  testnet (audit-gated). No external-traction claims.
---

# PayPerByte (BYTE Library) — verified per-byte data for agents

PayPerByte is a data layer for AI agents. An agent discovers a first-party feed,
pays per byte in USDC over x402 (a wallet signs an EIP-3009
`transferWithAuthorization` — **no API key, no signup, no token**), receives the
payload, and then **verifies it against an on-chain EIP-712 `PayloadAttestation`
before acting on it**. That verify step is the wedge: the agent does not assume
the data is intact, it proves it.

## When to use this skill

Reach for PayPerByte when the task needs external data the agent will *act on*
and provenance matters — i.e. you want to be able to prove the data was not
altered. Good triggers:

- "Should I pay this address?" — the flagship **Address Reputation Oracle**
  returns a signed ALLOW/WARN/BLOCK verdict for (domain, receiving address,
  amount, chain) *before* an agent releases USDC ($0.05 per verdict).
- "Get the current BTC/crypto market snapshot", "top DeFi yields", "perp funding
  rates", "stablecoin supply / bridge latency".
- "What's the weather / are there recent earthquakes / space-weather alerts".
- "Latest releases of <OSS project>", "is <npm/PyPI package> deprecated", "facts
  on <CVE>", "what does Wikipedia say about <X>".
- "Threat-intel / IOCs / exploit signals", "trust score for <merchant/seller>".
- "Answer this factual question with a slashable, cited, on-chain answer"
  (fact-oracle), "current text of <US Code section>" (usc-statute), "fact-check
  this claim with cited sources" (evidence-pack).

Do **not** use it for: general reasoning, or data the model already knows
reliably. Note that paid x402 calls spend **real USDC** — see Status.

## Status (state this honestly)

- **x402 pay-per-call rail (`byte_buy_data`): Base mainnet, `eip155:8453`, real
  USDC** (Circle USDC, EIP-3009, 6 decimals). Per-feed price is quoted in the
  402 challenge; the flagship address-reputation verdict is $0.05. Every paid
  200 returns an `X-BYTE-Attestation` EIP-712 receipt over the exact response
  bytes.
- **On-chain layer (subscriptions, broadcasts, fact-oracle escrow): Arbitrum
  Sepolia testnet, chain `421614` / `eip155:421614`**, settled in a testnet
  MockUSDC. Mainnet for this layer is gated on an external security audit.
- The EIP-712 `PayloadAttestation` signing domain (literal name `BYTE Library`)
  is anchored on `eip155:421614` regardless of which rail the agent paid on; an
  off-chain attestation is not a claim that the verdict was broadcast on-chain.
- **No token.** No external-user, revenue, or traction claims.
- `PRIVATE_KEY` signs real Base-mainnet USDC for buys AND testnet txs for the
  on-chain tools. Use a **dedicated wallet** holding only what you intend to
  spend.

## Two access modes

| Mode | Tool | Rail | Best for | Price |
|---|---|---|---|---|
| Buy (x402) | `byte_buy_data` | Base mainnet — **real USDC** | One-off snapshot or verdict for *this* query — zero setup | Per-feed, quoted in the 402 challenge ($0.05 flagship) |
| Subscribe | `byte_subscribe` | Arbitrum Sepolia — testnet MockUSDC | Continuous stream — every update delivered | $0.003/KB per delivery |

Pick by access pattern. Buy is pay-as-you-go with no allowance and settles real
money; subscribe delivers every broadcast on the audit-gated testnet layer.

## The core flow

1. **Discover.** `byte_list_feeds` (or `byte_search_publishers`) to find the feed
   that answers the question. Read-only — no wallet needed.
2. **Pay.** `byte_buy_data` for a one-off packet, or `byte_subscribe` for a
   stream. Both settle in USDC; `byte_buy_data` signs EIP-3009 and returns the
   data plus a settlement `txHash` inline.
3. **Verify-before-act.** `byte_verify_payload` — recompute `keccak256` of the
   bytes you received and check them against the publisher's on-chain EIP-712
   `PayloadAttestation`. Anchor with an `expectedHash` you hold, or the
   settlement `txHash` (which also recovers the signer and confirms it is the
   named publisher). **If `verified: false`, the data was tampered with or
   corrupted in transit — do not act on it.**
4. **Act**, citing the `txHash` as provenance.

For factual questions, prefer the oracles: `byte_query_fact` sends a signed
EIP-712 request (binds the query to your wallet so a leaked query can't burn your
escrow) and the answer is broadcast on-chain to your address with citations.

## Tools (15)

Read-only (no wallet): `byte_list_feeds`, `byte_search_publishers`,
`byte_get_publisher`, `byte_get_network_stats`, `byte_check_subscription`,
`byte_list_my_subscriptions`, `byte_subscription_health`,
`byte_get_token_balances`, `byte_verify_payload`.

Write/buy/query (require `PRIVATE_KEY` on a dedicated wallet — `byte_buy_data`
spends real Base-mainnet USDC; the rest are testnet): `byte_subscribe`,
`byte_unsubscribe`, `byte_register_publisher`, `byte_publish_data`,
`byte_buy_data`, `byte_query_fact`.

## Install

```bash
npx -y byte-mcp-server
```

- Claude Code: `claude mcp add byte-library -- npx -y byte-mcp-server`
- Hosted remote (streamable-HTTP): `https://mcp.payperbyte.io/mcp`
- Read-only tools work with no config. Add `PRIVATE_KEY` (dedicated wallet —
  buys spend real Base-mainnet USDC) to enable subscribe / publish / buy /
  query, and optionally `RPC_URL` (default
  `https://sepolia-rollup.arbitrum.io/rpc`, the testnet read layer).

## Without MCP (raw x402 HTTP)

Hit the gateway directly:

- Catalog (free): `GET https://x402.payperbyte.io/feeds`
- An unpaid feed request returns HTTP 402 with the x402 v2 challenge in the
  `payment-required` header; pay the quoted USDC (Base mainnet) with an x402
  client and retry. Paid 200s carry the `X-BYTE-Attestation` receipt header.
- Machine-readable contracts: `/openapi.json`, `/.well-known/x402.json`
  (alias `/x402-manifest`), `/.well-known/agent.json`.

## Identifiers

- Display brand: **PayPerByte**. npm: `byte-mcp-server`. mcpName:
  `io.github.0rkz/byte-protocol`.
- EIP-712 domain literal `BYTE Library` is consensus-critical (the on-chain
  attestation domain) — never rename it.

## Caveat

Feeds are informational and not financial, legal, or medical advice — each
response carries an `X-BYTE-Disclaimer-Category` header. The verify-before-act
step is what makes a payload safe to act on; skipping it forfeits the guarantee.
