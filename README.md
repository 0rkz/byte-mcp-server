# BYTE Library MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI agents direct access to **[BYTE Library](https://www.payperbyte.io)** — a per-byte USDC data marketplace on Arbitrum. Agents discover feeds, subscribe to streams, or pay-per-call for one-off data. No tokens, no API keys, no off-chain accounts: settle in USDC, route through MCP.

> **⚠ Migration window — 0.9.0.** This release prepares `byte_publish_data` for the upcoming **DataStreamLib r2** contract revision (EIP-712 PayloadAttestation). During the migration, `byte_publish_data` will revert against the current v1 contract — the new 5-arg `streamData` signature isn't accepted until r2 deploys on Arbitrum Sepolia. Read-only tools, `byte_subscribe`, `byte_query_fact`, and `byte_buy_data` are unaffected. See [CHANGELOG.md](CHANGELOG.md) for older releases.

## Quick start

```bash
npx -y byte-mcp-server
```

Wire it into your MCP client (Claude Desktop config below), then your agent can:

- **Discover** feeds: *"List the BYTE Library catalog"* / *"Search publishers for weather"*
- **Buy one packet** (x402, no setup): *"Buy the latest weather data"* → ~$0.021 USDC, ~3 seconds, on-chain receipt
- **Subscribe** to a stream: *"Subscribe me to the earthquakes feed"* → auto-approves USDC for ongoing settlement
- **Query a fact**: *"Ask the fact-oracle who won the last Lakers vs Warriors game"* → on-chain signed answer with citations

The live catalog is at **[x402.payperbyte.io/feeds](https://x402.payperbyte.io/feeds)** — 15 feeds across weather, markets, code, security, knowledge.

## Two paradigms: subscribe vs. buy

| Mode | Tool | Best for | Pricing |
|---|---|---|---|
| **Subscribe** | `byte_subscribe` | Continuous streams (every weather update, every new earthquake) | $0.003 USDC / KB per delivery |
| **Buy** (x402) | `byte_buy_data` | One-off needs (single snapshot for *this* user query) | $0.005 USDC / KB per call, $0.001 floor |

Subscribe is cheaper per byte and gives the agent every broadcast; buy is zero-setup and pay-as-you-go. Pick by access pattern, not by price alone.

## Tools (14 total)

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
| `byte_buy_data` | Buy one packet from any feed via the **x402 gateway**. No subscription, no allowance. Signs EIP-3009 `transferWithAuthorization`; the facilitator settles on-chain. Returns the data + tx hash inline |
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
| `PRIVATE_KEY` | only for write/buy/query tools | — | Arbitrum Sepolia wallet key |
| `RPC_URL` | no | `https://sepolia-rollup.arbitrum.io/rpc` | Arbitrum Sepolia RPC |
| `INDEXER_URL` | no | `http://localhost:8080` | BYTE Library indexer API |
| `BYTE_GATEWAY_URL` | no | `https://x402.payperbyte.io` | x402 gateway base URL (used by `byte_buy_data`) |

## Network

Current release targets **Arbitrum Sepolia** (chain `421614`) — BYTE Library's testnet. Mainnet (Arbitrum One) is the next milestone, gated on the external security audit. Contract addresses are pinned in the bundled config; the npm release ships ready-to-use defaults.

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

- **[payperbyte.io](https://www.payperbyte.io)** — BYTE Library home
- **[x402.payperbyte.io/feeds](https://x402.payperbyte.io/feeds)** — live feed catalog
- **[Model Context Protocol](https://modelcontextprotocol.io/)** — MCP spec
- **[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)**
