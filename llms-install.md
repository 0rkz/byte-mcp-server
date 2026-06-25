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
| `RPC_URL` | Arbitrum Sepolia public RPC | Arbitrum RPC endpoint (on-chain read layer) |
| `INDEXER_URL` | `https://feeds.payperbyte.io` | hosted indexer (read tools) |
| `PRIVATE_KEY` | — | **only** for write / x402 pay-per-call tools. `byte_buy_data` spends **real USDC on Base mainnet** — use a dedicated wallet; leave unset for read-only use. |

The 9 read-only tools (discovery, feed catalog, publisher info, network stats, balances, subscription checks, and `byte_verify_payload`) need **no wallet and no config**.

## Verify the install

Ask Cline to run a read-only tool — no wallet required:

- *"List the PayPerByte feed catalog"* → calls `byte_list_feeds`
- *"Get PayPerByte network stats"* → calls `byte_get_network_stats`

If a feed list / stats come back, the server is set up correctly.

## Buy a verdict (POST oracle)

`byte_buy_data` buys one packet from any feed. GET data feeds (weather, defi-yields, …) need only `feed`; the **verdict oracles** (`address-reputation`, `sanctions-screen`, `pkg-verdict`, `reasoning-verdict`) are POST endpoints — supply a JSON `body` and the call switches from GET to POST:

```jsonc
// screen a payee before releasing USDC (real $0.05 on Base mainnet — needs PRIVATE_KEY)
{ "feed": "address-reputation", "body": { "domain": "example.com", "address": "0x1234…abcd" } }
```

The result includes the signed verdict in `data` plus an inline `verification` block (`{ verified, hashMatch, signerMatch, reason }`) — act only when `verification.verified` is `true`. Other bodies: `sanctions-screen {address|name}`, `pkg-verdict {ecosystem,package}`, `reasoning-verdict {subject}`.

## Notes

- Two rails: x402 pay-per-call (`byte_buy_data`) settles **real USDC on Base mainnet** (`eip155:8453`); the on-chain subscribe/publish/fact-oracle layer is Arbitrum Sepolia **testnet** (MockUSDC, mainnet audit-gated). No token.
- Write tools (`byte_subscribe`, `byte_publish_data`, `byte_buy_data`, `byte_register_publisher`) require `PRIVATE_KEY` — use a dedicated wallet holding only what you intend to spend.
