interface PublisherSearchResult {
    address: string;
    topic: string;
    tier: string;
    pqs: number;
    subscribers: number;
    messages: number;
    pricePerKB: string;
}
interface FeedInfo {
    publisher: string;
    topic: string;
    pricePerKB: string;
    frequency: number;
    pqs: number;
    tier: string;
}
/**
 * Searches publishers via the indexer API, with optional filtering by topic,
 * minimum PQS score, sort order, and result limit.
 */
export declare function searchPublishers(params: {
    query?: string;
    minPQS?: number;
    sortBy?: string;
    limit?: number;
}): Promise<PublisherSearchResult[]>;
/**
 * Lists all active data feeds from the indexer API with topics,
 * pricing, frequency, PQS scores, and tier information.
 */
export declare function listFeeds(): Promise<FeedInfo[]>;
export {};
