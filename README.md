# Byte Protocol MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI agents direct access to the Byte Protocol data marketplace on Arbitrum Sepolia.

## What is MCP?

The Model Context Protocol is an open standard that lets AI assistants (like Claude) use external tools. This server exposes Byte Protocol's on-chain operations as MCP tools, so an AI agent can discover data publishers, check reputation scores, subscribe to feeds, and publish data -- all through natural language.

## Tools

This server exposes **14 tools** across read and write operations:

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
| `byte_query_fact` | Query a Byte Protocol fact-oracle publisher for a grounded answer with citations |

### Write (require `PRIVATE_KEY`)

| Tool | Description |
|------|-------------|
| `byte_drip_faucet` | Request 500 testnet PPB tokens (24h cooldown, 1000 PPB lifetime cap) |
| `byte_subscribe` | Subscribe to a publisher's data feed |
| `byte_unsubscribe` | Unsubscribe from a publisher's data feed |
| `byte_register_publisher` | Register as a data publisher (schema + stake + on-chain registration) |
| `byte_publish_data` | Publish data to a subscriber via the DataStream contract |

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

- [Byte Protocol](https://byte.protocol)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
