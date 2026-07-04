#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
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
  subscribe,
  unsubscribe,
  registerPublisher,
  publishData,
} from "./tools/actions.js";
import { queryFact } from "./tools/fact.js";
import { buyData } from "./tools/buy.js";
import { verifyPayload } from "./lib/verify.js";
import { primeCatalogCache, getCachedCatalog } from "./lib/catalog.js";

import { CONFIG } from "./lib/config.js";
import { createRequire } from "node:module";
const DEFAULT_INDEXER_URL = CONFIG.indexerUrl;

// Single source of truth for the server version — read from package.json at
// runtime (from dist/index.js, ../package.json is the package root) so the MCP
// never self-reports a stale hardcoded number.
const PKG_VERSION = (createRequire(import.meta.url)("../package.json") as { version: string }).version;

// Each MCP session needs its own McpServer instance (the SDK Server class
// errors with "Already connected to a transport" if one instance is reused
// across concurrent transports). The HTTP transport spawns a fresh one per
// session via this factory.
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "byte-protocol",
    version: PKG_VERSION,
  });

// ─── Read-only tools ────────────────────────────────────────────────────────

server.registerTool(
  "byte_search_publishers",
  {
    description: "Search PayPerByte publishers by topic and sort order. Returns publisher addresses, topics, subscriber counts, message counts, and price-per-KB.",
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe("Topic keyword to search (e.g. 'weather', 'crypto', 'cve')"),
      sortBy: z
        .string()
        .optional()
        .describe("Sort field: 'subscribers', 'revenue', 'messages'"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Max results to return (default 20)"),
    },
    outputSchema: {
      publishers: z
        .array(
          z
            .object({
              address: z.string().describe("Publisher Ethereum address (0x...)"),
              topic: z.string().optional().describe("Registered topic slug"),
              subscribers: z.number().optional().describe("Active subscriber count"),
              messages: z.number().optional().describe("Total messages published"),
              pricePerKB: z.number().optional().describe("Price per KB in USDC"),
            })
            .passthrough(),
        )
        .optional()
        .describe("Matching publishers, sorted by the requested field"),
    },
    annotations: {
      title: "Search publishers",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
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
        structuredContent: { publishers: results },
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

server.registerTool(
  "byte_get_publisher",
  {
    description: "Get on-chain info for a specific PayPerByte publisher: status, subscriber and message counts, USDC revenue, and the registered schema (size bounds, cadence, price-per-KB).",
    inputSchema: {
      address: z.string().describe("Publisher Ethereum address (0x...)"),
    },
    outputSchema: {
      address: z.string().describe("Publisher Ethereum address"),
      status: z.string().optional().describe("On-chain publisher status"),
      subscribers: z.number().optional().describe("Active subscriber count"),
      messages: z.number().optional().describe("Total messages published"),
      revenueUsdc: z.string().optional().describe("Total USDC revenue (decimal string)"),
      registeredAt: z.number().optional().describe("Unix timestamp of publisher registration"),
      lastActive: z.number().optional().describe("Unix timestamp of last on-chain activity"),
      schema: z.unknown().optional().describe("Registered schema (topic, sizes, cadence, price)"),
    },
    annotations: {
      title: "Get publisher info",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
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
        structuredContent: result,
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

server.registerTool(
  "byte_get_network_stats",
  {
    description: "Get PayPerByte network-wide statistics: total publishers, messages streamed, and total subscriber fees settled in USDC.",
    inputSchema: {},
    outputSchema: {
      publishers: z.number().optional().describe("Active publisher count network-wide"),
      messages: z.number().optional().describe("Total messages streamed all-time"),
      totalSubscriberFeesUsdc: z.string().optional().describe("Total subscriber fees settled (USDC, decimal string)"),
    },
    annotations: {
      title: "Get network stats",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
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
        structuredContent: stats,
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

server.registerTool(
  "byte_check_subscription",
  {
    description: "Check if an address is subscribed to a specific publisher on PayPerByte.",
    inputSchema: {
      subscriber: z.string().describe("Subscriber Ethereum address (0x...)"),
      publisher: z.string().describe("Publisher Ethereum address (0x...)"),
    },
    outputSchema: {
      subscribed: z.boolean().describe("True if the subscriber has an active subscription to the publisher"),
    },
    annotations: {
      title: "Check subscription",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
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
        structuredContent: result,
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

server.registerTool(
  "byte_get_token_balances",
  {
    description: "Get USDC and ETH balances for an address on Arbitrum Sepolia (the on-chain testnet layer — MockUSDC settles subscriptions and fact-oracle queries there). Does NOT show the Base-mainnet USDC balance that byte_buy_data spends.",
    inputSchema: {
      address: z.string().describe("Ethereum address (0x...)"),
    },
    outputSchema: {
      usdc: z.string().optional().describe("USDC balance (atomic, 6 decimals)"),
      eth: z.string().optional().describe("ETH balance (wei)"),
      address: z.string().optional().describe("Echoed address"),
    },
    annotations: {
      title: "Get token balances",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
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
        structuredContent: result,
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

server.registerTool(
  "byte_list_feeds",
  {
    description: "List all active data feeds in the PayPerByte catalog with topics, price-per-KB, and frequency.",
    inputSchema: {},
    outputSchema: {
      feeds: z
        .array(
          z
            .object({
              publisher: z.string().optional().describe("Publisher address for the feed"),
              topic: z.string().optional().describe("Topic identifier"),
              pricePerKB: z.string().optional().describe("Price per KB in USDC (decimal string)"),
              frequency: z.number().optional().describe("Expected publish cadence in seconds"),
            })
            .passthrough(),
        )
        .optional()
        .describe("Catalog of active feeds"),
    },
    annotations: {
      title: "List feeds",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
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
        structuredContent: { feeds },
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

server.registerTool(
  "byte_list_my_subscriptions",
  {
    description: "List every active subscription for a given wallet address. Each entry has the publisher address, topic, status, when you subscribed, messages received in 7/30 days, USDC spent in 7/30 days, and the timestamp of the last message received. Use this to see what you're currently paying for and decide whether to unsubscribe.",
    inputSchema: {
      subscriber: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a 0x-prefixed 40-hex-char address")
        .describe("Wallet address to list subscriptions for"),
      indexerUrl: z
        .string()
        .url()
        .optional()
        .describe("Optional indexer URL override (default: INDEXER_URL/BYTE_INDEXER_URL env or https://feeds.payperbyte.io)"),
    },
    outputSchema: {
      subscriptions: z
        .array(
          z
            .object({
              publisher: z.string().optional().describe("Publisher address subscribed to"),
              topic: z.string().optional().describe("Publisher topic"),
              status: z.union([z.string(), z.number()]).nullable().optional().describe("Subscription status (string label or numeric code)"),
              subscribedAt: z.union([z.number(), z.string()]).nullable().optional().describe("Unix timestamp of subscribe tx"),
              messages7d: z.number().optional().describe("Messages received in last 7 days"),
              messages30d: z.number().optional().describe("Messages received in last 30 days"),
              spend7dUsdc: z.string().optional().describe("USDC spent in last 7 days (decimal string)"),
              spend30dUsdc: z.string().optional().describe("USDC spent in last 30 days (decimal string)"),
              lastMessageAt: z.union([z.number(), z.string()]).nullable().optional().describe("Unix timestamp of most recent message"),
            })
            .passthrough(),
        )
        .optional()
        .describe("Active subscriptions for the given wallet"),
    },
    annotations: {
      title: "List my subscriptions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ subscriber, indexerUrl }) => {
    try {
      const results = await listMySubscriptions(subscriber, indexerUrl ?? DEFAULT_INDEXER_URL);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
        structuredContent: { subscriptions: results },
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

server.registerTool(
  "byte_subscription_health",
  {
    description: "Get the content-drift signal for a publisher. Compares their last 7 days of publishing activity (cadence, message count) against their 23-day baseline (days 8-30). Returns 'stable' (steady publishing), 'moderate' (20-50% cadence shift or 24-48h silence), 'significant' (>50% shift or >48h silence), or 'unknown' (new publisher, insufficient baseline). Use this to detect when a publisher you subscribe to has pivoted content or gone dormant.",
    inputSchema: {
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
    outputSchema: z
      .object({
        publisher: z.string().optional().describe("Publisher address checked"),
        signal: z
          .enum(["stable", "moderate", "significant", "unknown"])
          .optional()
          .describe("Content-drift bucket for the publisher"),
        messages7d: z.number().nullable().optional().describe("Messages in the last 7 days"),
        messages30d: z.number().nullable().optional().describe("Messages in the last 30 days"),
        messages_7d: z.number().nullable().optional().describe("Messages in the last 7 days (indexer key)"),
        messages_30d: z.number().nullable().optional().describe("Messages in the last 30 days (indexer key)"),
        silence_hours: z.number().nullable().optional().describe("Hours since the last message (null if never)"),
        cadence_drift_bps: z.number().nullable().optional().describe("Cadence drift vs 23-day baseline (bps)"),
        volume_ratio_bps: z.number().nullable().optional().describe("7d/baseline volume ratio (bps)"),
      })
      .passthrough(),
    annotations: {
      title: "Subscription health",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ publisher, indexerUrl }) => {
    try {
      const result = await getSubscriptionHealth(publisher, indexerUrl ?? DEFAULT_INDEXER_URL);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
        structuredContent: result as unknown as Record<string, unknown>,
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

server.registerTool(
  "byte_unsubscribe",
  {
    description: "Unsubscribe from a publisher's data feed. Takes effect next block: no more billing, no more data flow. Reversible — you can resubscribe later via byte_subscribe. Use this when a publisher has pivoted content (check with byte_subscription_health first) or when you simply don't want the feed anymore. Requires PRIVATE_KEY for the connected wallet.",
    inputSchema: {
      publisher: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a 0x-prefixed 40-hex-char address")
        .describe("Publisher address to unsubscribe from"),
    },
    outputSchema: {
      subscriber: z.string().optional().describe("Subscriber address (the signer)"),
      publisher: z.string().optional().describe("Publisher unsubscribed from"),
      txHash: z.string().optional().describe("Unsubscribe transaction hash"),
      status: z.string().optional().describe("Receipt status ('success' | 'reverted')"),
      blockNumber: z.string().optional().describe("Block number the tx landed in"),
    },
    annotations: {
      title: "Unsubscribe",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ publisher }) => {
    try {
      const result = await unsubscribe(publisher);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
        structuredContent: result,
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

server.registerTool(
  "byte_subscribe",
  {
    description: "Subscribe to a PayPerByte publisher's data feed. By default also sets USDC allowance to DataStreamLib to type(uint256).max so the subscription doesn't silently lose payments when allowance depletes (the contract's allowance-skip path emits DataStreamed with amount=0 on transferFrom failure rather than reverting). Pass skipAllowance: true to opt out and set a finite cap manually. Requires PRIVATE_KEY.",
    inputSchema: {
      publisher: z.string().describe("Publisher Ethereum address (0x...) to subscribe to"),
      skipAllowance: z
        .boolean()
        .optional()
        .describe("If true, don't bundle the USDC approve(max) call. Default false. Auto-approve is also skipped when the wallet already has ≥ $1000 USDC of allowance to DataStreamLib."),
    },
    outputSchema: {
      success: z.boolean().optional().describe("True if subscribe landed on-chain"),
      txHash: z.string().optional().describe("Subscribe transaction hash"),
      allowanceTxHash: z.string().optional().describe("USDC approve(max) transaction hash, if bundled"),
      publisher: z.string().optional().describe("Publisher subscribed to"),
    },
    annotations: {
      title: "Subscribe",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ publisher, skipAllowance }) => {
    try {
      const result = await subscribe({ publisher, skipAllowance });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
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

server.registerTool(
  "byte_register_publisher",
  {
    description: "Register as a data publisher on PayPerByte. Registers a schema and the publisher on-chain. Requires PRIVATE_KEY. PayPerByte v1 publishers are first-party and unstaked — leave stake at '0'; a non-zero USDC stake is approved to DataRegistry first if you choose to post one.",
    inputSchema: {
      stake: z
        .string()
        .describe("USDC reputation stake to post, as a decimal string. Default '0' — PayPerByte v1 publishers are unstaked."),
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
        .describe("Price per kilobyte in USDC (e.g. 0.003)"),
    },
    outputSchema: {
      success: z.boolean().optional().describe("True if registration landed on-chain"),
      txHash: z.string().optional().describe("Publisher-registration transaction hash"),
      schemaTxHash: z.string().optional().describe("Schema-registration transaction hash"),
      approveTxHash: z.string().optional().describe("USDC stake approval tx hash, if a non-zero stake was posted"),
      publisher: z.string().optional().describe("Registered publisher address (the signer)"),
      stakeUsdc: z.string().optional().describe("USDC stake posted (decimal string; '0' for v1 first-party)"),
      topic: z.string().optional().describe("Registered feed topic"),
    },
    annotations: {
      title: "Register publisher",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
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
        structuredContent: result,
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

server.registerTool(
  "byte_publish_data",
  {
    description: "Publish data to a subscriber via the PayPerByte DataStream contract. Hashes the payload, records size on-chain, and settles the fee in USDC. Requires PRIVATE_KEY.",
    inputSchema: {
      subscriber: z.string().describe("Subscriber Ethereum address (0x...)"),
      data: z.string().describe("Data payload to publish (will be hashed on-chain)"),
      maxFee: z
        .number()
        .describe("Maximum fee in USDC willing to pay for this publish (e.g. 0.05)"),
    },
    outputSchema: {
      success: z.boolean().optional().describe("True if publish landed on-chain"),
      txHash: z.string().optional().describe("Publish transaction hash"),
      payloadSize: z.number().optional().describe("Payload size recorded on-chain (bytes)"),
      payloadHash: z.string().optional().describe("keccak256 of the payload as recorded on-chain"),
    },
    annotations: {
      title: "Publish data",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
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
        structuredContent: result,
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

server.registerTool(
  "byte_query_fact",
  {
    description: "Query a PayPerByte fact-oracle publisher for a signed answer with citations. Posts the question to a registered fact-oracle publisher (topic='fact-oracle'), waits for the on-chain BroadcastStreamed response, and returns the answer plus structured citation URLs. The signed receipt proves which publisher produced the answer (provenance + tamper-evidence), NOT that the answer is correct — ground your output in the cited sources, not in a truth guarantee. Availability: this requires a registered fact-oracle publisher actively broadcasting; if none is live the call returns a timeout rather than an answer.",
    inputSchema: {
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
        .max(180000)
        .optional()
        .describe(
          "Max time to wait for the publisher's broadcast (default 30000 ms). Local-LLM publishers (Ollama + Searxng + 3-sample NLI gate) take ~30-60s; Anthropic + passthrough takes ~10-20s. Hard ceiling 180s."
        ),
    },
    outputSchema: z
      .object({
        answer: z.string().optional().describe("Publisher's grounded answer to the question"),
        citations: z
          .array(z.unknown())
          .optional()
          .describe("URLs/sources cited by the publisher in support of the answer"),
        publisher_address: z.string().optional().describe("Publisher address that fulfilled the query"),
        publisher_pqs: z.number().optional().describe("Publisher quality score (PQS) at fulfillment"),
        confidence: z.number().optional().describe("Publisher-reported confidence (0-1)"),
        request_id: z.string().optional().describe("Request id binding the query to this answer"),
        payload_hash: z.string().optional().describe("keccak256 of the response payload"),
        response_size_bytes: z.number().optional().describe("Size of the response payload (bytes)"),
        publisher_tx_or_status: z.string().optional().describe("Delivery status or settlement reference"),
        elapsed_ms: z.number().optional().describe("End-to-end time to obtain the answer (ms)"),
        error: z.string().optional().describe("Error message if the query failed (no eligible publisher, broadcast timeout, etc.)"),
      })
      .passthrough(),
    annotations: {
      title: "Query fact",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
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
        structuredContent: result as unknown as Record<string, unknown>,
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

// ─── Pay-per-call (x402) tool ─────────────────────────────────────────────

server.registerTool(
  "byte_buy_data",
  {
    description: "Buy a single data packet from any PayPerByte feed via the x402 payment gateway. No subscription, no allowance, no prior on-chain setup — pay-per-call USDC settlement. The MCP server signs an EIP-3009 transferWithAuthorization on behalf of the wallet whose PRIVATE_KEY is configured, the x402 facilitator submits the tx, and the data comes back inline with the on-chain settlement tx hash. Use byte_subscribe instead if you want a continuous stream of broadcasts from a publisher. The catalog of available feed slugs lives at https://x402.payperbyte.io/feeds (free GET). GET data feeds (weather, earthquakes, …) need only `feed`; the 9 POST oracles — address-reputation, sanctions-screen, pkg-verdict, reasoning-verdict, evidence-pack, liquidation-stream, positioning-snapshot, runtime-eol, threat-intel — additionally require a JSON `body` (the query) — supplying `body` switches this call to POST. Requires PRIVATE_KEY env var on the MCP server and USDC on the configured wallet. NOTE: paid feeds settle REAL USDC on Base mainnet (eip155:8453) — the exact price is quoted in the 402 challenge (flagship address-reputation: $0.10/verdict). Use a dedicated wallet holding only what you intend to spend.",
    inputSchema: {
      feed: z
        .string()
        .min(1)
        .describe(buildFeedSlugDescribe()),
      body: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Optional JSON query body for POST oracles. Supplying it switches the " +
            "call from GET to POST. Required by the verdict oracles, e.g. " +
            "address-reputation {domain,address[,amount,chain]}, " +
            "sanctions-screen {address|name}, pkg-verdict {ecosystem,package[,version]}, " +
            "reasoning-verdict {subject}. Omit for GET data feeds (weather, earthquakes, …).",
        ),
    },
    outputSchema: z
      .object({
        feed: z.string().optional().describe("Echoed feed slug"),
        paid: z.boolean().optional().describe("True if an x402 payment was made (false on free/cached feeds)"),
        price: z.string().optional().describe("USDC paid for this packet (e.g. '$0.003000'); omitted on free feeds"),
        txHash: z.string().optional().describe("x402 settlement transaction hash"),
        payer: z.string().optional().describe("Wallet that signed the EIP-3009 authorization"),
        status: z.number().optional().describe("HTTP status of the (post-payment) gateway response"),
        data: z.unknown().optional().describe("Decoded feed payload returned by the publisher"),
        verification: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Two-leg verify-before-act result: {gatewayVerified, hashMatch, signerMatch, " +
              "recovered, attester, embeddedAttestation, reason, note}. gatewayVerified=true means " +
              "the GATEWAY delivered these exact bytes (signed by the pinned gateway attester) — it " +
              "does NOT verify the per-feed publisher's embedded attestation (answer.attestation). " +
              "When embeddedAttestation==='present', verify that leg before trusting the data (see note).",
          ),
        error: z.string().optional().describe("Error message if the buy failed"),
        detail: z.string().optional().describe("Additional error detail, if any"),
      })
      .passthrough(),
    annotations: {
      title: "Buy data",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ feed, body }) => {
    try {
      const result = await buyData({ feed, body });
      // Fail closed on verify-before-act: a 200 whose GATEWAY-delivery leg did NOT
      // verify (forged signer / tampered bytes / missing-or-malformed receipt) MUST
      // surface as isError so an MCP client never silently acts on undelivered-intact
      // bytes. isError gates on the gateway leg (what byte_buy_data verifies); the
      // per-feed embedded publisher attestation is surfaced in verification.note for
      // the agent to verify before trusting the DATA (verifyEmbeddedAttestation is a
      // fast-follow). Any data result that is NOT an explicit error must carry a
      // verdict; an absent verification block fails closed too.
      const v = (result as { verification?: { gatewayVerified?: boolean } }).verification;
      const verifyFailed = "error" in result ? false : v === undefined || v.gatewayVerified !== true;
      return {
        content: [
          {
            type: "text" as const,
            text: verifyFailed
              ? `RECEIPT UNVERIFIED — do NOT act on these bytes.\n${JSON.stringify(result, null, 2)}`
              : JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result as unknown as Record<string, unknown>,
        isError: "error" in result || verifyFailed,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error buying data: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ─── Verify-before-act tool (provenance gate) ──────────────────────────────
//
// The verb the whole protocol is for: recompute keccak256 of the bytes an agent
// is about to act on and check them against the publisher's on-chain EIP-712
// PayloadAttestation BEFORE acting. Pass txHash to also recover the attestation
// signer and confirm it is the named publisher. On mismatch the agent must refuse.
server.registerTool(
  "byte_verify_payload",
  {
    description:
      "Verify-before-act: confirm a data payload an agent is about to act on actually matches what the publisher cryptographically attested to on-chain. Recomputes keccak256 of the received bytes and compares it to the on-chain EIP-712 PayloadAttestation hash. ALWAYS call this on BYTE-sourced data before acting on it; if verified=false the bytes were tampered/corrupted in transit and MUST NOT be used. Anchor the check with EITHER expectedHash (an on-chain payloadHash you already hold, e.g. from byte_query_fact / byte_buy_data) OR txHash (the settlement tx — also recovers the attestation signer and confirms it is the named publisher). Read-only; no wallet or payment required.",
    inputSchema: {
      data: z
        .string()
        .describe("The exact payload bytes the agent received and is about to act on — the raw delivered string, or a 0x-prefixed hex byte string."),
      expectedHash: z
        .string()
        .regex(/^0x[0-9a-fA-F]{64}$/)
        .optional()
        .describe("On-chain payloadHash to verify against (0x + 64 hex), e.g. the payloadHash returned by byte_query_fact or byte_buy_data."),
      txHash: z
        .string()
        .regex(/^0x[0-9a-fA-F]{64}$/)
        .optional()
        .describe("Settlement tx hash whose on-chain BroadcastStreamed attestation to verify against. When provided, also recovers the EIP-712 signer and confirms it is the attesting publisher."),
      hashMode: z
        .enum(["raw", "canonical"])
        .optional()
        .describe("How to hash structured payloads: 'raw' (keccak of the utf8 string, default — matches byte_publish_data) or 'canonical' (keccak of key-sorted, whitespace-free JSON)."),
    },
    outputSchema: {
      verified: z.boolean().describe("True only if the recomputed hash matches the on-chain attested hash AND (when a signer was recovered) the signer is the publisher. If false: do NOT act on the data."),
      recomputedHash: z.string().describe("keccak256 of the received bytes"),
      onChainHash: z.string().describe("The on-chain attested payloadHash compared against"),
      hashMatch: z.boolean().describe("Whether the recomputed hash equals the on-chain hash"),
      signer: z.string().optional().describe("Recovered EIP-712 attestation signer (txHash mode)"),
      attestingPublisher: z.string().optional().describe("Publisher named in the on-chain event (txHash mode)"),
      signerMatch: z.boolean().optional().describe("Whether the recovered signer is the attesting publisher"),
      source: z.string().optional().describe("Which anchor was used: 'txHash' or 'expectedHash'"),
      txHash: z.string().optional().describe("Settlement tx hash verified against (txHash mode)"),
      blockNumber: z.string().optional().describe("Block number of the settlement tx (txHash mode)"),
      reason: z.string().describe("Human-readable verdict an agent can surface when it acts or refuses"),
    },
    annotations: {
      title: "Verify payload (verify-before-act)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ data, expectedHash, txHash, hashMode }) => {
    try {
      const verdict = await verifyPayload({
        received: data,
        expectedHash,
        txHash,
        mode: hashMode,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(verdict, null, 2) }],
        structuredContent: verdict as unknown as Record<string, unknown>,
        isError: !verdict.verified,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error verifying payload: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

  return server;
}

// ─── Start server ───────────────────────────────────────────────────────────

function buildFeedSlugDescribe(): string {
  const feeds = getCachedCatalog();
  if (!feeds.length) {
    return (
      "Feed slug — see https://x402.payperbyte.io/feeds for the live catalog. " +
      "(For fact-oracle Q&A use byte_query_fact instead — it uses a different request-response flow.)"
    );
  }
  const list = feeds.map((f) => `${f.id} (${f.price})`).join(", ");
  return (
    `Feed slug — one of: ${list}. ` +
    "Full catalog: https://x402.payperbyte.io/feeds (free GET). " +
    "(For fact-oracle Q&A use byte_query_fact instead — it uses a different request-response flow.)"
  );
}

async function main() {
  await primeCatalogCache();

  const useHttp =
    process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http";

  if (useHttp) {
    const port = Number(process.env.PORT ?? 8787);
    const app = express();
    app.use(express.json());

    // One transport per MCP session. Smithery / Claude / Cursor each get
    // their own session; initialize requests spawn a new transport, follow-up
    // requests reuse it via the Mcp-Session-Id header.
    const transports: Record<string, StreamableHTTPServerTransport> = {};

    app.post("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports[id] = transport;
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) delete transports[transport.sessionId];
        };
        const sessionServer = createMcpServer();
        await sessionServer.connect(transport);
      } else if (
        !sessionId &&
        typeof (req.body as { method?: string })?.method === "string" &&
        (req.body as { method: string }).method.startsWith("notifications/")
      ) {
        // Orphan notification — some clients (e.g. Smithery's scanner) don't
        // propagate the Mcp-Session-Id header on follow-up requests. Per JSON-RPC
        // 2.0, notifications expect no response; ACK with 202 and drop.
        res.status(202).end();
        return;
      } else if (!sessionId) {
        // Session-less non-initialize, non-notification request — spin up a
        // one-shot stateless transport so scanner-style probes (tools/list etc.)
        // get an answer. Heavyweight per request, but only fires for clients
        // that fail to propagate the session id.
        const onceTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        const onceServer = createMcpServer();
        res.on("close", () => {
          void onceTransport.close();
          void onceServer.close();
        });
        await onceServer.connect(onceTransport);
        await onceTransport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: invalid session ID" },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    });

    // GET = server-initiated SSE stream; DELETE = explicit session termination.
    const sessionRouted = async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }
      await transports[sessionId].handleRequest(req, res);
    };
    app.get("/mcp", sessionRouted);
    app.delete("/mcp", sessionRouted);

    app.get("/health", (_req, res) =>
      res.json({
        status: "ok",
        version: PKG_VERSION,
        transport: "http",
        sessions: Object.keys(transports).length,
      }),
    );

    app.listen(port, () => {
      console.error(`PayPerByte MCP server (HTTP) listening on :${port}`);
    });
  } else {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("PayPerByte MCP server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
