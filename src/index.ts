#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchPublishers, listFeeds } from "./tools/search.js";
import { getPublisher, getNetworkStats } from "./tools/publisher.js";
import {
  getTokenBalances,
  checkSubscription,
  listMySubscriptions,
  getSubscriptionHealth,
} from "./tools/wallet.js";
import {
  dripFaucet,
  subscribe,
  unsubscribe,
  registerPublisher,
  publishData,
} from "./tools/actions.js";
import { queryFact } from "./tools/fact.js";

const server = new McpServer({
  name: "byte-protocol",
  version: "0.4.0",
});

const DEFAULT_INDEXER_URL = process.env.BYTE_INDEXER_URL ?? "http://localhost:8080";

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

server.tool(
  "byte_list_my_subscriptions",
  "List every active subscription for a given wallet address. Each entry has the publisher address, topic, tier, PQS score (0-10000 BPS), when you subscribed, messages received in 7/30 days, USDC spent in 7/30 days, and the timestamp of the last message received. Use this to see what you're currently paying for and decide whether to unsubscribe.",
  {
    subscriber: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a 0x-prefixed 40-hex-char address")
      .describe("Wallet address to list subscriptions for"),
    indexerUrl: z
      .string()
      .url()
      .optional()
      .describe("Optional indexer URL override (default: BYTE_INDEXER_URL env or http://localhost:8080)"),
  },
  async ({ subscriber, indexerUrl }) => {
    try {
      const results = await listMySubscriptions(subscriber, indexerUrl ?? DEFAULT_INDEXER_URL);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing subscriptions: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "byte_subscription_health",
  "Get the content-drift signal for a publisher. Compares their last 7 days of publishing activity (cadence, message count) against their 23-day baseline (days 8-30). Returns 'stable' (steady publishing), 'moderate' (20-50% cadence shift or 24-48h silence), 'significant' (>50% shift or >48h silence), or 'unknown' (new publisher, insufficient baseline). Use this to detect when a publisher you subscribe to has pivoted content or gone dormant.",
  {
    publisher: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a 0x-prefixed 40-hex-char address")
      .describe("Publisher address to check"),
    indexerUrl: z
      .string()
      .url()
      .optional()
      .describe("Optional indexer URL override"),
  },
  async ({ publisher, indexerUrl }) => {
    try {
      const result = await getSubscriptionHealth(publisher, indexerUrl ?? DEFAULT_INDEXER_URL);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching drift signal: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ─── Write tools (require PRIVATE_KEY) ──────────────────────────────────────

server.tool(
  "byte_unsubscribe",
  "Unsubscribe from a publisher's data feed. Takes effect next block: no more billing, no more data flow. Reversible — you can resubscribe later via byte_subscribe. Use this when a publisher has pivoted content (check with byte_subscription_health first) or when you simply don't want the feed anymore. Requires PRIVATE_KEY for the connected wallet.",
  {
    publisher: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a 0x-prefixed 40-hex-char address")
      .describe("Publisher address to unsubscribe from"),
  },
  async ({ publisher }) => {
    try {
      const result = await unsubscribe(publisher);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

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
  "Register as a data publisher on Byte Protocol. This registers a schema, approves PPB token stake, and registers the publisher on-chain. Requires PRIVATE_KEY. Draft 7.5 tier gates: stake determines your ceiling tier — NEW 25 / ESTABLISHED 50 / TRUSTED 100 / PREMIUM 200 / ELITE 350 PPB. Register with at least the stake for the tier you want to reach; otherwise you're capped regardless of PQS performance.",
  {
    stake: z
      .string()
      .describe("PPB tokens to stake (min 25, max 2000). Stake caps your max reachable tier per Draft 7.5: 25=NEW (35% take), 50=ESTABLISHED (42%), 100=TRUSTED (50%), 200=PREMIUM (60%), 350=ELITE (70%)."),
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

// ─── Fact-oracle tool (NEW in v0.4.0) ──────────────────────────────────────

server.tool(
  "byte_query_fact",
  "Query a Byte Protocol fact-oracle publisher for a verified factual answer with citations. Posts the question to a registered fact-oracle publisher (topic='fact-oracle'), waits for the on-chain BroadcastStreamed response, returns the answer + structured citation URLs + the publisher's PQS. Use for grounding LLM outputs in real-time verified information — publishers stake reputation against accuracy, so bad answers are economically slashable.",
  {
    question: z
      .string()
      .min(3)
      .max(2048)
      .describe(
        "The factual question to ask (e.g. 'What was last night's Lakers vs Warriors score?'). Should be specific and verifiable."
      ),
    subscriber_address: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/)
      .describe(
        "Your wallet address. You MUST be subscribed to the chosen publisher (with sufficient USDC escrow) or the publisher's on-chain broadcast will be skipped."
      ),
    max_byte_cost: z
      .number()
      .min(100)
      .max(10000)
      .optional()
      .describe(
        "Max response payload bytes you're willing to pay for (defaults to 2000, ≈$1 at $0.0005/byte). Publisher refuses if can't fit answer."
      ),
    topic_filter: z
      .string()
      .optional()
      .describe(
        "Optional topic filter (e.g. 'fact-oracle' default; future: 'sports', 'finance')."
      ),
    min_publisher_pqs: z
      .number()
      .min(0)
      .max(10000)
      .optional()
      .describe(
        "Minimum PQS to consider (BPS scale, 0-10000). 9000 = Elite-only, 7500 = Premium+."
      ),
    max_response_latency_ms: z
      .number()
      .min(5000)
      .max(60000)
      .optional()
      .describe(
        "Max time to wait for the publisher's broadcast (default 30000 ms). Publishers using SelfCheckGPT self-check take ~50s; passthrough mode ~20s."
      ),
  },
  async (params) => {
    try {
      const result = await queryFact(params);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: "error" in result,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error querying fact-oracle: ${error instanceof Error ? error.message : String(error)}`,
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
