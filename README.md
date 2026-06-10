# PayPerByte MCP Server

[![smithery badge](https://smithery.ai/badge/byte/byte-library)](https://smithery.ai/servers/byte/byte-library) [![0rkz/byte-mcp-server MCP server](https://glama.ai/mcp/servers/0rkz/byte-mcp-server/badges/score.svg)](https://glama.ai/mcp/servers/0rkz/byte-mcp-server)

A [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI agents direct access to **[PayPerByte](https://www.payperbyte.io)** — verified, provenance-first data feeds for AI agents. Agents discover feeds, pay-per-call via x402 (settled in **USDC on Base mainnet**), or subscribe to on-chain streams (Arbitrum Sepolia testnet). Every paid x402 response carries an EIP-712 `PayloadAttestation` receipt (`X-BYTE-Attestation` header) the agent verifies before acting. No tokens, no API keys, no off-chain accounts.

> **Two rails — read this before setting `PRIVATE_KEY`.**
>
> - **x402 pay-per-call (`byte_buy_data`): Base mainnet (`eip155:8453`), REAL USDC.** Paid feeds settle real money — the flagship [Address Reputation Oracle](https://x402.payperbyte.io/feeds/address-reputation) is $0.05 per verdict. Use a dedicated wallet holding only what you intend to spend.
> - **On-chain subscribe/publish/query layer (BYTE Library contracts + indexer): Arbitrum Sepolia testnet (chain `421614`), MockUSDC.** Mainnet for this layer is gated on an external security audit. The EIP-712 attestation signing domain stays anchored at `421614` regardless of which rail you paid on.
>
> One `PRIVATE_KEY` serves both rails. Never reuse a key holding funds you can't afford to spend.

## Quick start

```bash
npx -y byte-mcp-server
```

Wire it into your MCP client (Claude Desktop config below), then your agent can:

- **Discover** feeds: *"List the PayPerByte catalog"* / *"Search publishers for weather"*
- **Buy one packet** (x402, no setup): *"Check this receiving address before I pay it"* → $0.05 real USDC on Base mainnet, signed ALLOW/WARN/BLOCK verdict with an attestation receipt
- **Subscribe** to a stream (testnet): *"Subscribe me to the earthquakes feed"* → auto-approves MockUSDC for ongoing settlement on Arbitrum Sepolia
- **Query a fact** (testnet): *"Ask the fact-oracle who won the last Lakers vs Warriors game"* → on-chain signed answer with citations

The live catalog is at **[x402.payperbyte.io/feeds](https://x402.payperbyte.io/feeds)** — verified, provenance-first feeds across weather, markets, code, security, and knowledge.

## Two paradigms: subscribe vs. buy

| Mode | Tool | Rail | Best for | Pricing |
|---|---|---|---|---|
| **Buy** (x402) | `byte_buy_data` | **Base mainnet — real USDC** | One-off needs (single snapshot or verdict for *this* user query) | Per-feed, quoted in the 402 challenge ($0.05 flagship; most feeds cents or less) |
| **Subscribe** | `byte_subscribe` | Arbitrum Sepolia — testnet MockUSDC | Continuous streams (every weather update, every new earthquake) | $0.003 / KB per delivery |

Buy is zero-setup, pay-as-you-go, and live with real settlement; subscribe delivers every broadcast on the audit-gated testnet layer. Pick by access pattern.

## Tools (15 total)

### Discovery (read-only, no wallet)

| Tool | Description |
|---|---|
| `byte_search_publishers` | Search publishers by topic and sort order |
| `byte_list_feeds` | List the active feed catalog with prices and frequencies |
| `byte_get_publisher` | On-chain info for one publisher (status, subscribers, messages, USDC revenue, schema) |
| `byte_get_network_stats` | Network-wide stats: publishers, messages, total fees settled |
| `byte_check_subscription` | Is `subscriber` subscribed to `publisher`? |
| `byte_list_my_subscriptions` | All active subscriptions for a wallet — last 7d/30d messages + USDC spend |
| `byte_subscription_health` | Content-drift signal for a publisher: stable / moderate / significant / unknown |
| `byte_get_token_balances` | USDC + ETH balances on Arbitrum Sepolia |
| `byte_verify_payload` | **Verify-before-act.** Recompute `keccak256` of the bytes your agent received and check them against the publisher's on-chain EIP-712 `PayloadAttestation` — anchor with an `expectedHash` you hold or the settlement `txHash` (which also recovers the signer and confirms it's the named publisher). If `verified: false`, the data was tampered/corrupted in transit — don't act on it |

### Subscribe to a stream (requires `PRIVATE_KEY`)

| Tool | Description |
|---|---|
| `byte_subscribe` | Subscribe to a publisher's stream. Auto-bundles USDC `approve(max)` unless `skipAllowance: true` (closes a silent-payment-failure footgun where the contract's allowance-skip path delivered data with `amount=0`) |
| `byte_unsubscribe` | Unsubscribe — takes effect next block |
| `byte_register_publisher` | Register as a data publisher (schema + on-chain registration). v1 is first-party only; stake = 0 |
| `byte_publish_data` | Publish a payload to a subscriber via DataStream (settles fee in USDC). See migration notice above re: r2 |

### Buy on-demand (requires `PRIVATE_KEY`)

| Tool | Description |
|---|---|
| `byte_buy_data` | Buy one packet from any feed via the **x402 gateway** — **real USDC on Base mainnet**. No subscription, no allowance. Signs EIP-3009 `transferWithAuthorization` against the 402 challenge; the facilitator settles on-chain. Returns the data + tx hash inline |
| `byte_query_fact` | Ask a slashable fact-oracle publisher a question. Signed EIP-712 request (binds query to your wallet so leaked queries can't burn your escrow); the answer is broadcast on-chain to your address with citations |

## Configuration

### Claude Desktop

Edit `~/.config/claude/claude_desktop_config.json` (Linux) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "byte-library": {
      "command": "npx",
      "args": ["-y", "byte-mcp-server"],
      "env": {
        "PRIVATE_KEY": "0x...",
        "RPC_URL": "https://sepolia-rollup.arbitrum.io/rpc",
        "INDEXER_URL": "http://localhost:8080"
      }
    }
  }
}
```

`PRIVATE_KEY` is optional — read-only tools work without it. Add it to enable subscribe, publish, buy, and query.

### Claude Code

```bash
claude mcp add byte-library -- npx -y byte-mcp-server
```

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PRIVATE_KEY` | only for write/buy/query tools | — | EOA key. Signs **real Base-mainnet USDC** for `byte_buy_data` and testnet txs for subscribe/publish/query — use a dedicated wallet |
| `RPC_URL` | no | `https://sepolia-rollup.arbitrum.io/rpc` | Arbitrum Sepolia RPC (the on-chain read/subscribe layer) |
| `INDEXER_URL` | no | `https://feeds.payperbyte.io` | PayPerByte indexer API |
| `BYTE_GATEWAY_URL` | no | `https://x402.payperbyte.io` | x402 gateway base URL (used by `byte_buy_data`) |

## Network

Two rails, honestly stated:

- **x402 payment rail (`byte_buy_data`): Base mainnet (`eip155:8453`).** Paid feeds settle real USDC through the gateway at [x402.payperbyte.io](https://x402.payperbyte.io); each paid 200 returns an `X-BYTE-Attestation` EIP-712 receipt over the exact response bytes.
- **On-chain layer (subscriptions, broadcasts, fact-oracle escrow, indexer): Arbitrum Sepolia (chain `421614`).** Mainnet for the BYTE Library contracts is gated on an external security audit. The EIP-712 `PayloadAttestation` signing domain is anchored on `421614` regardless of the payment rail.

Contract addresses are pinned in the bundled config; the npm release ships ready-to-use defaults. No token.

## Development

```bash
git clone https://github.com/0rkz/byte-mcp-server.git
cd byte-mcp-server
npm install
npm run build && npm start
```

## License

MIT — see [LICENSE](LICENSE).

## Links

- **[payperbyte.io](https://www.payperbyte.io)** — PayPerByte home
- **[x402.payperbyte.io/feeds](https://x402.payperbyte.io/feeds)** — live feed catalog
- **[Model Context Protocol](https://modelcontextprotocol.io/)** — MCP spec
- **[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)**
