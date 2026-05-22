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
 * Lists all active data feeds from the indexer API with topics,
 * pricing, and frequency.
 */
export declare function listFeeds(): Promise<FeedInfo[]>;
export {};
