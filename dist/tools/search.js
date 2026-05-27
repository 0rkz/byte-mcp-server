import { CONFIG } from "../lib/config.js";
/**
 * Searches publishers via the indexer API, with optional filtering by topic,
 * sort order, and result limit.
 */
export async function searchPublishers(params) {
    const { query, sortBy, limit } = params;
    const url = new URL("/publishers", CONFIG.indexerUrl);
    if (query)
        url.searchParams.set("topic", query);
    if (sortBy)
        url.searchParams.set("sort", sortBy);
    if (limit !== undefined)
        url.searchParams.set("limit", String(limit));
    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`Indexer API error: ${response.status} ${response.statusText}. ` +
            `Ensure the indexer is running at ${CONFIG.indexerUrl}`);
    }
    const data = await response.json();
    return data;
}
/**
 * Lists all active data feeds from the x402 gateway catalog with
 * topics, pricing, and update cadence. The gateway is the source of
 * truth for the feed catalog (it owns the per-feed price + expected
 * payload size); the indexer aggregates on-chain events but does not
 * expose `/feeds`.
 */
export async function listFeeds() {
    const url = new URL("/feeds", CONFIG.gatewayUrl);
    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`x402 gateway error: ${response.status} ${response.statusText}. ` +
            `Tried ${CONFIG.gatewayUrl}/feeds`);
    }
    const payload = (await response.json());
    const feeds = payload.feeds ?? [];
    return feeds.map((f) => ({
        publisher: f.publisher ?? "",
        topic: f.id ?? f.endpoint ?? "",
        pricePerKB: f.price ?? f.priceAtomic ?? "",
        frequency: Number.isFinite(Number(f.updateFrequency))
            ? Number(f.updateFrequency)
            : 0,
    }));
}
