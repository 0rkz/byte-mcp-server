#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchPublishers, listFeeds } from "./tools/search.js";
import { getPublisher, getNetworkStats } from "./tools/publisher.js";
import { getTokenBalances, checkSubscription, listMySubscriptions, getSubscriptionHealth, } from "./tools/wallet.js";
import { subscribe, unsubscribe, registerPublisher, publishData, } from "./tools/actions.js";
import { queryFact } from "./tools/fact.js";
import { buyData } from "./tools/buy.js";
const server = new McpServer({
    name: "byte-protocol",
    version: "0.8.0",
});
const DEFAULT_INDEXER_URL = process.env.BYTE_INDEXER_URL ?? "http://localhost:8080";
// ─── Read-only tools ────────────────────────────────────────────────────────
server.tool("byte_search_publishers", "Search BYTE Library publishers by topic and sort order. Returns publisher addresses, topics, subscriber counts, message counts, and price-per-KB.", {
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
}, async (params) => {
    try {
        const results = await searchPublishers(params);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(results, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error searching publishers: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
server.tool("byte_get_publisher", "Get on-chain info for a specific BYTE Library publisher: status, subscriber and message counts, USDC revenue, and the registered schema (size bounds, cadence, price-per-KB).", {
    address: z.string().describe("Publisher Ethereum address (0x...)"),
}, async ({ address }) => {
    try {
        const result = await getPublisher(address);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error getting publisher: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
server.tool("byte_get_network_stats", "Get BYTE Library network-wide statistics: total publishers, messages streamed, and total subscriber fees settled in USDC.", {}, async () => {
    try {
        const stats = await getNetworkStats();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(stats, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error getting network stats: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
server.tool("byte_check_subscription", "Check if an address is subscribed to a specific publisher on BYTE Library.", {
    subscriber: z.string().describe("Subscriber Ethereum address (0x...)"),
    publisher: z.string().describe("Publisher Ethereum address (0x...)"),
}, async ({ subscriber, publisher }) => {
    try {
        const result = await checkSubscription(subscriber, publisher);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error checking subscription: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
server.tool("byte_get_token_balances", "Get USDC and ETH balances for an address on Arbitrum Sepolia. USDC is the BYTE Library settlement asset; ETH covers gas.", {
    address: z.string().describe("Ethereum address (0x...)"),
}, async ({ address }) => {
    try {
        const result = await getTokenBalances(address);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error getting balances: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
server.tool("byte_list_feeds", "List all active data feeds in the BYTE Library catalog with topics, price-per-KB, and frequency.", {}, async () => {
    try {
        const feeds = await listFeeds();
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(feeds, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error listing feeds: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
server.tool("byte_list_my_subscriptions", "List every active subscription for a given wallet address. Each entry has the publisher address, topic, status, when you subscribed, messages received in 7/30 days, USDC spent in 7/30 days, and the timestamp of the last message received. Use this to see what you're currently paying for and decide whether to unsubscribe.", {
    subscriber: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a 0x-prefixed 40-hex-char address")
        .describe("Wallet address to list subscriptions for"),
    indexerUrl: z
        .string()
        .url()
        .optional()
        .describe("Optional indexer URL override (default: BYTE_INDEXER_URL env or http://localhost:8080)"),
}, async ({ subscriber, indexerUrl }) => {
    try {
        const results = await listMySubscriptions(subscriber, indexerUrl ?? DEFAULT_INDEXER_URL);
        return {
            content: [
                { type: "text", text: JSON.stringify(results, null, 2) },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error listing subscriptions: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
server.tool("byte_subscription_health", "Get the content-drift signal for a publisher. Compares their last 7 days of publishing activity (cadence, message count) against their 23-day baseline (days 8-30). Returns 'stable' (steady publishing), 'moderate' (20-50% cadence shift or 24-48h silence), 'significant' (>50% shift or >48h silence), or 'unknown' (new publisher, insufficient baseline). Use this to detect when a publisher you subscribe to has pivoted content or gone dormant.", {
    publisher: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a 0x-prefixed 40-hex-char address")
        .describe("Publisher address to check"),
    indexerUrl: z
        .string()
        .url()
        .optional()
        .describe("Optional indexer URL override"),
}, async ({ publisher, indexerUrl }) => {
    try {
        const result = await getSubscriptionHealth(publisher, indexerUrl ?? DEFAULT_INDEXER_URL);
        return {
            content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error fetching drift signal: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
// ─── Write tools (require PRIVATE_KEY) ──────────────────────────────────────
server.tool("byte_unsubscribe", "Unsubscribe from a publisher's data feed. Takes effect next block: no more billing, no more data flow. Reversible — you can resubscribe later via byte_subscribe. Use this when a publisher has pivoted content (check with byte_subscription_health first) or when you simply don't want the feed anymore. Requires PRIVATE_KEY for the connected wallet.", {
    publisher: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a 0x-prefixed 40-hex-char address")
        .describe("Publisher address to unsubscribe from"),
}, async ({ publisher }) => {
    try {
        const result = await unsubscribe(publisher);
        return {
            content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error unsubscribing: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
server.tool("byte_subscribe", "Subscribe to a BYTE Library publisher's data feed. By default also sets USDC allowance to DataStreamLib to type(uint256).max so the subscription doesn't silently lose payments when allowance depletes (the contract's allowance-skip path emits DataStreamed with amount=0 on transferFrom failure rather than reverting). Pass skipAllowance: true to opt out and set a finite cap manually. Requires PRIVATE_KEY.", {
    publisher: z.string().describe("Publisher Ethereum address (0x...) to subscribe to"),
    skipAllowance: z
        .boolean()
        .optional()
        .describe("If true, don't bundle the USDC approve(max) call. Default false. Auto-approve is also skipped when the wallet already has ≥ $1000 USDC of allowance to DataStreamLib."),
}, async ({ publisher, skipAllowance }) => {
    try {
        const result = await subscribe({ publisher, skipAllowance });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error subscribing: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
server.tool("byte_register_publisher", "Register as a data publisher on BYTE Library. Registers a schema and the publisher on-chain. Requires PRIVATE_KEY. BYTE Library v1 publishers are first-party and unstaked — leave stake at '0'; a non-zero USDC stake is approved to DataRegistry first if you choose to post one.", {
    stake: z
        .string()
        .describe("USDC reputation stake to post, as a decimal string. Default '0' — BYTE Library v1 publishers are unstaked."),
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
}, async (params) => {
    try {
        const result = await registerPublisher(params);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error registering publisher: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
server.tool("byte_publish_data", "Publish data to a subscriber via the BYTE Library DataStream contract. Hashes the payload, records size on-chain, and settles the fee in USDC. Requires PRIVATE_KEY.", {
    subscriber: z.string().describe("Subscriber Ethereum address (0x...)"),
    data: z.string().describe("Data payload to publish (will be hashed on-chain)"),
    maxFee: z
        .number()
        .describe("Maximum fee in USDC willing to pay for this publish (e.g. 0.05)"),
}, async (params) => {
    try {
        const result = await publishData(params);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error publishing data: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
// ─── Fact-oracle tool (NEW in v0.4.0) ──────────────────────────────────────
server.tool("byte_query_fact", "Query a BYTE Library fact-oracle publisher for a verified factual answer with citations. Posts the question to a registered fact-oracle publisher (topic='fact-oracle'), waits for the on-chain BroadcastStreamed response, and returns the answer plus structured citation URLs. Use for grounding LLM outputs in real-time verified information.", {
    question: z
        .string()
        .min(3)
        .max(2048)
        .describe("The factual question to ask (e.g. 'What was last night's Lakers vs Warriors score?'). Should be specific and verifiable."),
    subscriber_address: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/)
        .describe("Your wallet address. You MUST be subscribed to the chosen publisher (with sufficient USDC escrow) or the publisher's on-chain broadcast will be skipped."),
    max_byte_cost: z
        .number()
        .min(100)
        .max(10000)
        .optional()
        .describe("Max response payload bytes you're willing to pay for (defaults to 2000, ≈$1 at $0.0005/byte). Publisher refuses if can't fit answer."),
    topic_filter: z
        .string()
        .optional()
        .describe("Optional topic filter (e.g. 'fact-oracle' default; future: 'sports', 'finance')."),
    min_publisher_pqs: z
        .number()
        .min(0)
        .max(10000)
        .optional()
        .describe("Minimum PQS to consider (BPS scale, 0-10000). 9000 = Elite-only, 7500 = Premium+."),
    max_response_latency_ms: z
        .number()
        .min(5000)
        .max(180000)
        .optional()
        .describe("Max time to wait for the publisher's broadcast (default 30000 ms). Local-LLM publishers (Ollama + Searxng + 3-sample NLI gate) take ~30-60s; Anthropic + passthrough takes ~10-20s. Hard ceiling 180s."),
}, async (params) => {
    try {
        const result = await queryFact(params);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
            isError: "error" in result,
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error querying fact-oracle: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
// ─── Pay-per-call (x402) tool ─────────────────────────────────────────────
server.tool("byte_buy_data", "Buy a single data packet from any BYTE Library feed via the x402 payment gateway. No subscription, no allowance, no prior on-chain setup — pay-per-call USDC settlement. The MCP server signs an EIP-3009 transferWithAuthorization on behalf of the wallet whose PRIVATE_KEY is configured, the x402 facilitator submits the tx, and the data comes back inline with the on-chain settlement tx hash. Use byte_subscribe instead if you want a continuous stream of broadcasts from a publisher. The catalog of available feed slugs lives at https://x402.payperbyte.io/feeds (free GET). Requires PRIVATE_KEY env var on the MCP server and USDC balance on the configured wallet (Arbitrum Sepolia).", {
    feed: z
        .string()
        .min(1)
        .describe("Feed slug — one of: weather, earthquakes, space-weather, news-feed, " +
        "code-pulse, runtime-eol, threat-intel, btc-metrics, pkg-facts, " +
        "cve-facts, wiki-facts, merchant-trust, crypto-top100, defi-yields, " +
        "byte-status. (For fact-oracle Q&A use byte_query_fact instead — it " +
        "uses a different request-response flow.)"),
}, async ({ feed }) => {
    try {
        const result = await buyData({ feed });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(result, null, 2),
                },
            ],
            isError: "error" in result,
        };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error buying data: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});
// ─── Start server ───────────────────────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("BYTE Library MCP server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
