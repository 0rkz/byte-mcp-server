#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchPublishers, listFeeds } from "./tools/search.js";
import { getPublisher, getNetworkStats } from "./tools/publisher.js";
import { getTokenBalances, checkSubscription } from "./tools/wallet.js";
import {
  dripFaucet,
  subscribe,
  registerPublisher,
  publishData,
} from "./tools/actions.js";

const server = new McpServer({
  name: "byte-protocol",
  version: "0.1.0",
});

// ─── Read-only tools ────────────────────────────────────────────────────────

server.tool(
  "byte_search_publishers",
  "Search Byte Protocol publishers by topic, minimum PQS score, and sort order. Returns publisher addresses, topics, tiers, PQS scores, subscriber counts, message counts, and pricing.",
  {
    query: z
      .string()
      .optional()
      .describe("Topic keyword to search (e.g. 'weather', 'price-feed', 'defi')"),
    minPQS: z
      .number()
      .min(0)
      .max(10000)
      .optional()
      .describe("Minimum PQS (Publisher Quality Score) to filter by, 0-10000"),
    sortBy: z
      .string()
      .optional()
      .describe("Sort field: 'subscribers', 'revenue', 'pqs', 'messages'"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Max results to return (default 20)"),
  },
  async (params) => {
    try {
      const results = await searchPublishers(params);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching publishers: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "byte_get_publisher",
  "Get detailed on-chain info for a specific Byte Protocol publisher: status, tier, stake, subscribers, messages, revenue, schema config, and PQS breakdown (freshness, accuracy, availability, completeness).",
  {
    address: z.string().describe("Publisher Ethereum address (0x...)"),
  },
  async ({ address }) => {
    try {
      const result = await getPublisher(address);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting publisher: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "byte_get_network_stats",
  "Get Byte Protocol network-wide statistics: total publishers, messages streamed, subscriber fees, publishing fees, and total revenue.",
  {},
  async () => {
    try {
      const stats = await getNetworkStats();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting network stats: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "byte_check_subscription",
  "Check if an address is subscribed to a specific publisher on Byte Protocol.",
  {
    subscriber: z.string().describe("Subscriber Ethereum address (0x...)"),
    publisher: z.string().describe("Publisher Ethereum address (0x...)"),
  },
  async ({ subscriber, publisher }) => {
    try {
      const result = await checkSubscription(subscriber, publisher);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error checking subscription: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "byte_get_token_balances",
  "Get PPB token, USDC, and ETH balances for an address on Arbitrum Sepolia.",
  {
    address: z.string().describe("Ethereum address (0x...)"),
  },
  async ({ address }) => {
    try {
      const result = await getTokenBalances(address);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error getting balances: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "byte_list_feeds",
  "List all active data feeds on Byte Protocol with topics, pricing, frequency, PQS scores, and tier information.",
  {},
  async () => {
    try {
      const feeds = await listFeeds();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(feeds, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing feeds: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Write tools (require PRIVATE_KEY) ──────────────────────────────────────

server.tool(
  "byte_drip_faucet",
  "Request testnet PPB tokens from the Byte Protocol faucet. Drips 500 PPB to the connected wallet. Subject to 24h cooldown and 1000 PPB lifetime cap. Requires PRIVATE_KEY.",
  {},
  async () => {
    try {
      const result = await dripFaucet();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error dripping faucet: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "byte_subscribe",
  "Subscribe to a Byte Protocol publisher's data feed. Requires PRIVATE_KEY. The connected wallet will be registered as a subscriber to the given publisher.",
  {
    publisher: z.string().describe("Publisher Ethereum address (0x...) to subscribe to"),
  },
  async ({ publisher }) => {
    try {
      const result = await subscribe(publisher);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error subscribing: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "byte_register_publisher",
  "Register as a data publisher on Byte Protocol. This registers a schema, approves PPB token stake, and registers the publisher on-chain. Requires PRIVATE_KEY.",
  {
    stake: z
      .string()
      .describe("PPB tokens to stake (e.g. '25' for 25 PPB). Min 25, max 10000."),
    topic: z
      .string()
      .describe("Data feed topic (e.g. 'eth-price', 'weather-nyc', 'gas-tracker')"),
    expectedSize: z
      .number()
      .describe("Expected payload size in bytes per message"),
    maxSize: z.number().describe("Maximum payload size in bytes per message"),
    frequency: z.number().describe("Expected publishing frequency in seconds"),
    pricePerKB: z
      .number()
      .describe("Price per kilobyte in PPB tokens (e.g. 0.001)"),
  },
  async (params) => {
    try {
      const result = await registerPublisher(params);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error registering publisher: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "byte_publish_data",
  "Publish data to a subscriber via the Byte Protocol DataStream contract. Hashes the payload, records size on-chain, and charges fees. Requires PRIVATE_KEY.",
  {
    subscriber: z.string().describe("Subscriber Ethereum address (0x...)"),
    data: z.string().describe("Data payload to publish (will be hashed on-chain)"),
    maxFee: z
      .number()
      .describe("Maximum fee in PPB tokens willing to pay for this publish"),
  },
  async (params) => {
    try {
      const result = await publishData(params);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error publishing data: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Start server ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Byte Protocol MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
