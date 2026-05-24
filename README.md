# Byte Protocol MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI agents direct access to the Byte Protocol data marketplace on Arbitrum Sepolia.

> **New in 0.9.0 — EIP-712 PayloadAttestation prep (DataStreamLib r2).**
> `byte_publish_data` now signs the payload as an EIP-712 PayloadAttestation,
> ready for the upcoming DataStreamLib r2 contract revision. The signing
> path is live in this release; the contract upgrade lands on Arbitrum
> Sepolia shortly. **During the migration window**, `byte_publish_data`
> will revert against the current v1 contract (the new 5-arg `streamData`
> signature isn't accepted until r2 is deployed). The read-only,
> `byte_subscribe`, `byte_query_fact`, and `byte_buy_data` tools are
> unaffected and work normally throughout.

> **New in 0.8.0 — pay-per-call (`byte_buy_data`).** A new tool exposes the
> BYTE Library x402 gateway: an agent can buy a single data packet from any
> of the 16 catalog feeds (weather, earthquakes, crypto, DeFi yields, news,
> threat-intel, …) with no subscription, no allowance, no prior on-chain
> setup. The MCP server signs an EIP-3009 USDC `transferWithAuthorization`
> on the configured wallet and the x402 facilitator settles on-chain.
> Use `byte_buy_data` for one-off purchases; use `byte_subscribe` for
> continuous streams. The catalog is at `https://x402.payperbyte.io/feeds`.

> **⚠ Breaking change in 0.7.0 — v0.6 contract redeploy.** The Byte Protocol
> v0.6 bundled redeploy went live on Arbitrum Sepolia (chain 421614) on
> 2026-05-20, and v0.5 is now paused. This release re-points the bundled
> default contract addresses to the v0.6 deployment: `DataRegistry`,
> `DataStream`, `ReputationEngine`, and the USDC token (now `MockUSDC3009`,
> EIP-3009-enabled) all changed. `SchemaRegistry`, `PPBToken`, and
> `PQSVerifier` are reused from v0.5 and unchanged. Any client pinned to
> `0.6.x` keeps talking to the paused v0.5 contracts — upgrade to `0.7.0`
> to transact against the live v0.6 deployment.

> **Upgrading from 0.5.x?** v0.6 adds EIP-712 signatures to `byte_query_fact`
> (closes the "spend someone else's escrow" attack — anyone could previously
> submit a query naming any subscriber's address and burn that subscriber's
> on-chain USDC escrow on an answer they never asked for). The fact-oracle
> server now requires every `/query` request to include a `subscriber_signature`
> that recovers to the claimed `subscriber_address`. Set `PRIVATE_KEY` in your
> env to the subscriber EOA; the MCP server signs each query automatically.
> Unsigned clients receive HTTP 401 with the EIP-712 domain echoed for debug.

## What is MCP?

The Model Context Protocol is an open standard that lets AI assistants (like Claude) use external tools. This server exposes Byte Protocol's on-chain operations as MCP tools, so an AI agent can discover data publishers, check reputation scores, subscribe to feeds, and publish data -- all through natural language.

## Tools

This server exposes **14 tools** across read, write, and pay-per-call (x402) operations:

### Read-only (no wallet required)

| Tool | Description |
|------|-------------|
| `byte_search_publishers` | Search publishers by topic, minimum PQS score, and sort order |
| `byte_get_publisher` | Get detailed on-chain info for a publisher (status, tier, stake, PQS breakdown) |
| `byte_get_network_stats` | Get network-wide stats (total publishers, messages, fees, revenue) |
| `byte_check_subscription` | Check if an address is subscribed to a specific publisher |
| `byte_list_my_subscriptions` | List all publishers a subscriber is currently subscribed to |
| `byte_subscription_health` | Check escrow + allowance health for a subscription pair |
| `byte_get_token_balances` | Get PPB, USDC, and ETH balances for any address |
| `byte_list_feeds` | List all active data feeds with pricing and quality scores |
| `byte_query_fact` | Query a Byte Protocol fact-oracle publisher for a grounded answer with citations. **v0.6+: requires `PRIVATE_KEY` to sign the request** (closes the "spend someone else's escrow" attack — the signing subscriber must match the `subscriber_address` field). |

### Write (require `PRIVATE_KEY`)

| Tool | Description |
|------|-------------|
| `byte_subscribe` | Subscribe to a publisher's data feed (auto-approves USDC max allowance unless `skipAllowance: true`) |
| `byte_unsubscribe` | Unsubscribe from a publisher's data feed |
| `byte_register_publisher` | Register as a data publisher (schema + on-chain registration) |
| `byte_publish_data` | Publish data to a subscriber via the DataStream contract |

### Pay-per-call (x402, require `PRIVATE_KEY`)

| Tool | Description |
|------|-------------|
| `byte_buy_data` | Buy a single data packet from any BYTE Library feed via the x402 gateway. No subscription required. Signs an EIP-3009 USDC `transferWithAuthorization`; the facilitator settles on-chain. Catalog: `https://x402.payperbyte.io/feeds` |

## Installation

### From npm (recommended)

```bash
npx -y byte-mcp-server
```

### From source

```bash
git clone https://github.com/0rkz/byte-mcp-server.git
cd byte-mcp-server
npm install
npm run build
node dist/index.js
```

## Configuration

### Claude Desktop

Add this to your Claude Desktop config (`~/.config/claude/claude_desktop_config.json` on Linux, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "byte-protocol": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "RPC_URL": "https://sepolia-rollup.arbitrum.io/rpc",
        "INDEXER_URL": "http://localhost:8080"
      }
    }
  }
}
```

To enable write operations (subscribe, publish, faucet), add your private key:

```json
{
  "mcpServers": {
    "byte-protocol": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "0x...",
        "RPC_URL": "https://sepolia-rollup.arbitrum.io/rpc",
        "INDEXER_URL": "http://localhost:8080"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add byte-protocol node /path/to/mcp-server/dist/index.js
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRIVATE_KEY` | No | -- | Wallet private key for write operations. Without it, only read tools work. |
| `RPC_URL` | No | `https://sepolia-rollup.arbitrum.io/rpc` | Arbitrum Sepolia RPC endpoint |
| `INDEXER_URL` | No | `http://localhost:8080` | Byte Protocol indexer API URL |

## Usage

Once connected, your AI agent can do things like:

> "Search for weather data publishers with a PQS score above 5000"

> "What are the network stats for Byte Protocol?"

> "Check the balance of 0xABC...123 on the testnet"

> "Subscribe me to publisher 0xDEF...456"

> "Register as a publisher for the topic eth-price with a 50 PPB stake"

> "Get me some testnet tokens from the faucet"

## Development

```bash
npm run dev    # Watch mode -- recompiles on changes
npm run build  # One-time build
npm start      # Run the server
```

## Network

This server connects to **Arbitrum Sepolia** (chain ID 421614) by default. All contract addresses are for the testnet deployment.

## License

MIT -- see [LICENSE](LICENSE).

## Links

- [Byte Protocol](https://www.payperbyte.io)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
