#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { searchPublishers, listFeeds } from "./tools/search.js";
import { getPublisher, getNetworkStats } from "./tools/publisher.js";
import { getTokenBalances, checkSubscription, listMySubscriptions, getSubscriptionHealth, } from "./tools/wallet.js";
import { subscribe, unsubscribe, registerPublisher, publishData, } from "./tools/actions.js";
import { queryFact } from "./tools/fact.js";
import { buyData } from "./tools/buy.js";
import { verifyPayload } from "./lib/verify.js";
import { CONFIG } from "./lib/config.js";
const DEFAULT_INDEXER_URL = CONFIG.indexerUrl;
// Each MCP session needs its own McpServer instance (the SDK Server class
// errors with "Already connected to a transport" if one instance is reused
// across concurrent transports). The HTTP transport spawns a fresh one per
// session via this factory.
function createMcpServer() {
    const server = new McpServer({
        name: "byte-protocol",
        version: "0.11.0",
    });
    // ─── Read-only tools ────────────────────────────────────────────────────────
    server.registerTool("byte_search_publishers", {
        description: "Search BYTE Library publishers by topic and sort order. Returns publisher addresses, topics, subscriber counts, message counts, and price-per-KB.",
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
                .array(z
                .object({
                address: z.string().describe("Publisher Ethereum address (0x...)"),
                topic: z.string().optional().describe("Registered topic slug"),
                subscribers: z.number().optional().describe("Active subscriber count"),
                messages: z.number().optional().describe("Total messages published"),
                pricePerKB: z.number().optional().describe("Price per KB in USDC"),
            })
                .passthrough())
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
    server.registerTool("byte_get_publisher", {
        description: "Get on-chain info for a specific BYTE Library publisher: status, subscriber and message counts, USDC revenue, and the registered schema (size bounds, cadence, price-per-KB).",
        inputSchema: {
            address: z.string().describe("Publisher Ethereum address (0x...)"),
        },
        outputSchema: {
            address: z.string().describe("Publisher Ethereum address"),
            status: z.string().optional().describe("On-chain publisher status"),
            subscribers: z.number().optional().describe("Active subscriber count"),
            messages: z.number().optional().describe("Total messages published"),
            revenue: z.string().optional().describe("Total USDC revenue (atomic)"),
            schema: z.unknown().optional().describe("Registered schema (topic, sizes, cadence, price)"),
        },
        annotations: {
            title: "Get publisher info",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
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
    server.registerTool("byte_get_network_stats", {
        description: "Get BYTE Library network-wide statistics: total publishers, messages streamed, and total subscriber fees settled in USDC.",
        inputSchema: {},
        outputSchema: {
            totalPublishers: z.number().optional().describe("Active publisher count network-wide"),
            totalMessages: z.number().optional().describe("Total messages streamed all-time"),
            totalSubscriberFees: z.string().optional().describe("Total subscriber fees settled (USDC atomic)"),
        },
        annotations: {
            title: "Get network stats",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async () => {
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
    server.registerTool("byte_check_subscription", {
        description: "Check if an address is subscribed to a specific publisher on BYTE Library.",
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
    server.registerTool("byte_get_token_balances", {
        description: "Get USDC and ETH balances for an address on Arbitrum Sepolia. USDC is the BYTE Library settlement asset; ETH covers gas.",
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
    server.registerTool("byte_list_feeds", {
        description: "List all active data feeds in the BYTE Library catalog with topics, price-per-KB, and frequency.",
        inputSchema: {},
        outputSchema: {
            feeds: z
                .array(z
                .object({
                slug: z.string().optional().describe("Feed slug used in x402 routes"),
                topic: z.string().optional().describe("Topic identifier"),
                pricePerKB: z.number().optional().describe("Price per KB in USDC"),
                frequency: z.number().optional().describe("Expected publish cadence in seconds"),
                status: z.string().optional().describe("Feed status"),
            })
                .passthrough())
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
    }, async () => {
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
    server.registerTool("byte_list_my_subscriptions", {
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
                .describe("Optional indexer URL override (default: BYTE_INDEXER_URL env or http://localhost:8080)"),
        },
        outputSchema: {
            subscriptions: z
                .array(z
                .object({
                publisher: z.string().optional().describe("Publisher address subscribed to"),
                topic: z.string().optional().describe("Publisher topic"),
                status: z.string().optional().describe("Subscription status"),
                subscribedAt: z.number().optional().describe("Unix timestamp of subscribe tx"),
                messages7d: z.number().optional().describe("Messages received in last 7 days"),
                messages30d: z.number().optional().describe("Messages received in last 30 days"),
                spent7d: z.string().optional().describe("USDC spent in last 7 days (atomic)"),
                spent30d: z.string().optional().describe("USDC spent in last 30 days (atomic)"),
                lastMessageAt: z.number().optional().describe("Unix timestamp of most recent message"),
            })
                .passthrough())
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
    server.registerTool("byte_subscription_health", {
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
        outputSchema: {
            status: z
                .enum(["stable", "moderate", "significant", "unknown"])
                .optional()
                .describe("Content-drift bucket for the publisher"),
            details: z.unknown().optional().describe("Underlying counts, cadence ratios, and last-message timestamp"),
        },
        annotations: {
            title: "Subscription health",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
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
    server.registerTool("byte_unsubscribe", {
        description: "Unsubscribe from a publisher's data feed. Takes effect next block: no more billing, no more data flow. Reversible — you can resubscribe later via byte_subscribe. Use this when a publisher has pivoted content (check with byte_subscription_health first) or when you simply don't want the feed anymore. Requires PRIVATE_KEY for the connected wallet.",
        inputSchema: {
            publisher: z
                .string()
                .regex(/^0x[a-fA-F0-9]{40}$/, "Must be a 0x-prefixed 40-hex-char address")
                .describe("Publisher address to unsubscribe from"),
        },
        outputSchema: {
            txHash: z.string().optional().describe("Unsubscribe transaction hash"),
            success: z.boolean().optional().describe("True if the unsubscribe landed on-chain"),
            error: z.string().optional().describe("Error message if the operation failed"),
        },
        annotations: {
            title: "Unsubscribe",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
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
    server.registerTool("byte_subscribe", {
        description: "Subscribe to a BYTE Library publisher's data feed. By default also sets USDC allowance to DataStreamLib to type(uint256).max so the subscription doesn't silently lose payments when allowance depletes (the contract's allowance-skip path emits DataStreamed with amount=0 on transferFrom failure rather than reverting). Pass skipAllowance: true to opt out and set a finite cap manually. Requires PRIVATE_KEY.",
        inputSchema: {
            publisher: z.string().describe("Publisher Ethereum address (0x...) to subscribe to"),
            skipAllowance: z
                .boolean()
                .optional()
                .describe("If true, don't bundle the USDC approve(max) call. Default false. Auto-approve is also skipped when the wallet already has ≥ $1000 USDC of allowance to DataStreamLib."),
        },
        outputSchema: {
            subscribeTx: z.string().optional().describe("Subscribe transaction hash"),
            approveTx: z.string().optional().describe("USDC approve(max) transaction hash, if bundled"),
            success: z.boolean().optional().describe("True if subscribe landed on-chain"),
            error: z.string().optional().describe("Error message if the operation failed"),
        },
        annotations: {
            title: "Subscribe",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
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
    server.registerTool("byte_register_publisher", {
        description: "Register as a data publisher on BYTE Library. Registers a schema and the publisher on-chain. Requires PRIVATE_KEY. BYTE Library v1 publishers are first-party and unstaked — leave stake at '0'; a non-zero USDC stake is approved to DataRegistry first if you choose to post one.",
        inputSchema: {
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
        },
        outputSchema: {
            txHash: z.string().optional().describe("Register transaction hash"),
            publisherAddress: z.string().optional().describe("Registered publisher address (the signer)"),
            success: z.boolean().optional().describe("True if registration landed on-chain"),
            error: z.string().optional().describe("Error message if the operation failed"),
        },
        annotations: {
            title: "Register publisher",
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
        },
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
    server.registerTool("byte_publish_data", {
        description: "Publish data to a subscriber via the BYTE Library DataStream contract. Hashes the payload, records size on-chain, and settles the fee in USDC. Requires PRIVATE_KEY.",
        inputSchema: {
            subscriber: z.string().describe("Subscriber Ethereum address (0x...)"),
            data: z.string().describe("Data payload to publish (will be hashed on-chain)"),
            maxFee: z
                .number()
                .describe("Maximum fee in USDC willing to pay for this publish (e.g. 0.05)"),
        },
        outputSchema: {
            txHash: z.string().optional().describe("Publish transaction hash"),
            payloadHash: z.string().optional().describe("keccak256 of the payload as recorded on-chain"),
            feePaid: z.string().optional().describe("Actual USDC fee paid (atomic)"),
            success: z.boolean().optional().describe("True if publish landed on-chain"),
            error: z.string().optional().describe("Error message if the operation failed"),
        },
        annotations: {
            title: "Publish data",
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
        },
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
    server.registerTool("byte_query_fact", {
        description: "Query a BYTE Library fact-oracle publisher for a verified factual answer with citations. Posts the question to a registered fact-oracle publisher (topic='fact-oracle'), waits for the on-chain BroadcastStreamed response, and returns the answer plus structured citation URLs. Use for grounding LLM outputs in real-time verified information.",
        inputSchema: {
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
        },
        outputSchema: {
            answer: z.string().optional().describe("Publisher's grounded answer to the question"),
            citations: z
                .array(z.string())
                .optional()
                .describe("URLs cited by the publisher in support of the answer"),
            publisher: z.string().optional().describe("Publisher address that fulfilled the query"),
            txHash: z.string().optional().describe("BroadcastStreamed transaction hash"),
            payloadHash: z.string().optional().describe("keccak256 of the response payload"),
            feePaid: z.string().optional().describe("USDC fee paid for the broadcast (atomic)"),
            error: z.string().optional().describe("Error message if the query failed (no eligible publisher, broadcast timeout, etc.)"),
        },
        annotations: {
            title: "Query fact",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
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
    server.registerTool("byte_buy_data", {
        description: "Buy a single data packet from any BYTE Library feed via the x402 payment gateway. No subscription, no allowance, no prior on-chain setup — pay-per-call USDC settlement. The MCP server signs an EIP-3009 transferWithAuthorization on behalf of the wallet whose PRIVATE_KEY is configured, the x402 facilitator submits the tx, and the data comes back inline with the on-chain settlement tx hash. Use byte_subscribe instead if you want a continuous stream of broadcasts from a publisher. The catalog of available feed slugs lives at https://x402.payperbyte.io/feeds (free GET). Requires PRIVATE_KEY env var on the MCP server and USDC balance on the configured wallet (Arbitrum Sepolia).",
        inputSchema: {
            feed: z
                .string()
                .min(1)
                .describe("Feed slug — one of: weather, earthquakes, space-weather, news-feed, " +
                "code-pulse, runtime-eol, threat-intel, btc-metrics, pkg-facts, " +
                "cve-facts, wiki-facts, merchant-trust, crypto-top100, defi-yields, " +
                "byte-status. (For fact-oracle Q&A use byte_query_fact instead — it " +
                "uses a different request-response flow.)"),
        },
        outputSchema: {
            data: z.unknown().optional().describe("Decoded feed payload returned by the publisher"),
            payloadHash: z.string().optional().describe("keccak256 of the response payload"),
            txHash: z.string().optional().describe("x402 settlement transaction hash"),
            feed: z.string().optional().describe("Echoed feed slug"),
            pricePaid: z.string().optional().describe("USDC paid for this packet (atomic)"),
            error: z.string().optional().describe("Error message if the buy failed"),
        },
        annotations: {
            title: "Buy data",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
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
    // ─── Verify-before-act tool (provenance gate) ──────────────────────────────
    //
    // The verb the whole protocol is for: recompute keccak256 of the bytes an agent
    // is about to act on and check them against the publisher's on-chain EIP-712
    // PayloadAttestation BEFORE acting. Pass txHash to also recover the attestation
    // signer and confirm it is the named publisher. On mismatch the agent must refuse.
    server.registerTool("byte_verify_payload", {
        description: "Verify-before-act: confirm a data payload an agent is about to act on actually matches what the publisher cryptographically attested to on-chain. Recomputes keccak256 of the received bytes and compares it to the on-chain EIP-712 PayloadAttestation hash. ALWAYS call this on BYTE-sourced data before acting on it; if verified=false the bytes were tampered/corrupted in transit and MUST NOT be used. Anchor the check with EITHER expectedHash (an on-chain payloadHash you already hold, e.g. from byte_query_fact / byte_buy_data) OR txHash (the settlement tx — also recovers the attestation signer and confirms it is the named publisher). Read-only; no wallet or payment required.",
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
            reason: z.string().describe("Human-readable verdict an agent can surface when it acts or refuses"),
        },
        annotations: {
            title: "Verify payload (verify-before-act)",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async ({ data, expectedHash, txHash, hashMode }) => {
        try {
            const verdict = await verifyPayload({
                received: data,
                expectedHash,
                txHash,
                mode: hashMode,
            });
            return {
                content: [{ type: "text", text: JSON.stringify(verdict, null, 2) }],
                isError: !verdict.verified,
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error verifying payload: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
                isError: true,
            };
        }
    });
    return server;
}
// ─── Start server ───────────────────────────────────────────────────────────
async function main() {
    const useHttp = process.argv.includes("--http") || process.env.MCP_TRANSPORT === "http";
    if (useHttp) {
        const port = Number(process.env.PORT ?? 8787);
        const app = express();
        app.use(express.json());
        // One transport per MCP session. Smithery / Claude / Cursor each get
        // their own session; initialize requests spawn a new transport, follow-up
        // requests reuse it via the Mcp-Session-Id header.
        const transports = {};
        app.post("/mcp", async (req, res) => {
            const sessionId = req.headers["mcp-session-id"];
            let transport;
            if (sessionId && transports[sessionId]) {
                transport = transports[sessionId];
            }
            else if (!sessionId && isInitializeRequest(req.body)) {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (id) => {
                        transports[id] = transport;
                    },
                });
                transport.onclose = () => {
                    if (transport.sessionId)
                        delete transports[transport.sessionId];
                };
                const sessionServer = createMcpServer();
                await sessionServer.connect(transport);
            }
            else if (!sessionId &&
                typeof req.body?.method === "string" &&
                req.body.method.startsWith("notifications/")) {
                // Orphan notification — some clients (e.g. Smithery's scanner) don't
                // propagate the Mcp-Session-Id header on follow-up requests. Per JSON-RPC
                // 2.0, notifications expect no response; ACK with 202 and drop.
                res.status(202).end();
                return;
            }
            else if (!sessionId) {
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
            }
            else {
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
        const sessionRouted = async (req, res) => {
            const sessionId = req.headers["mcp-session-id"];
            if (!sessionId || !transports[sessionId]) {
                res.status(400).send("Invalid or missing session ID");
                return;
            }
            await transports[sessionId].handleRequest(req, res);
        };
        app.get("/mcp", sessionRouted);
        app.delete("/mcp", sessionRouted);
        app.get("/health", (_req, res) => res.json({
            status: "ok",
            version: "0.11.0",
            transport: "http",
            sessions: Object.keys(transports).length,
        }));
        app.listen(port, () => {
            console.error(`BYTE Library MCP server (HTTP) listening on :${port}`);
        });
    }
    else {
        const server = createMcpServer();
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("BYTE Library MCP server running on stdio");
    }
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
