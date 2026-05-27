interface PublisherSearchResult {
    address: string;
    topic: string;
    subscribers: number;
    messages: number;
    pricePerKB: string;
}
interface FeedInfo {
    publisher: string;
    topic: string;
    pricePerKB: string;
    frequency: number;
}
/**
 * Searches publishers via the indexer API, with optional filtering by topic,
 * sort order, and result limit.
 */
export declare function searchPublishers(params: {
    query?: string;
    sortBy?: string;
    limit?: number;
}): Promise<PublisherSearchResult[]>;
/**
 * Lists all active data feeds from the x402 gateway catalog with
 * topics, pricing, and update cadence. The gateway is the source of
 * truth for the feed catalog (it owns the per-feed price + expected
 * payload size); the indexer aggregates on-chain events but does not
 * expose `/feeds`.
 */
export declare function listFeeds(): Promise<FeedInfo[]>;
export {};
