# Installing PayPerByte (byte-mcp-server) in Cline

PayPerByte's MCP server runs straight from npm — no clone, no build step.

## Add the server

Add this to your Cline MCP settings (`cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "payperbyte": {
      "command": "npx",
      "args": ["-y", "byte-mcp-server"]
    }
  }
}
```

That is the only required setup. The server starts over stdio and exposes 15 tools.

## Configuration (all optional)

| Env var | Default | Purpose |
|---|---|---|
| `RPC_URL` | Arbitrum Sepolia public RPC | Arbitrum RPC endpoint |
| `INDEXER_URL` | `https://feeds.payperbyte.io` | hosted indexer (read tools) |
| `PRIVATE_KEY` | — | **only** for write / x402 pay-per-call tools. Use a testnet-only key; leave unset for read-only use. |

The 10 read-only tools (discovery, feed catalog, publisher info, network stats, balances, fact-oracle queries, and `byte_verify_payload`) need **no wallet and no config**.

## Verify the install

Ask Cline to run a read-only tool — no wallet required:

- *"List the PayPerByte feed catalog"* → calls `byte_list_feeds`
- *"Get PayPerByte network stats"* → calls `byte_get_network_stats`

If a feed list / stats come back, the server is set up correctly.

## Notes

- Network: Arbitrum Sepolia **testnet**; settlement asset is a MockUSDC. No token.
- Write tools (`byte_subscribe`, `byte_publish_data`, `byte_buy_data`, `byte_register_publisher`) require `PRIVATE_KEY` set to a testnet wallet.
