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
 * Lists all active data feeds from the indexer API with topics,
 * pricing, and frequency.
 */
export async function listFeeds() {
    const url = new URL("/feeds", CONFIG.indexerUrl);
    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`Indexer API error: ${response.status} ${response.statusText}. ` +
            `Ensure the indexer is running at ${CONFIG.indexerUrl}`);
    }
    const data = await response.json();
    return data;
}
