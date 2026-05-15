/**
 * Fetches detailed on-chain info for a publisher including status, tier,
 * stake, schema config, and PQS (Publisher Quality Score) breakdown.
 * @param address - Publisher Ethereum address.
 */
export declare function getPublisher(address: string): Promise<{
    address: `0x${string}`;
    status: string;
    tier: string;
    stake: string;
    sandboxStartTime: number;
    subscribers: number;
    messages: number;
    revenue: string;
    registeredAt: number;
    lastActive: number;
    slashCount: number;
    schema: {
        expectedSize: number;
        maxSize: number;
        frequency: number;
        pricePerKB: string;
        active: boolean;
        topic: `0x${string}`;
    };
    pqs: {
        composite: number;
        disputeScore: number;
        retentionScore: number;
        freshnessScore: number;
        revenueQuality: number;
        lastUpdated: number;
    };
}>;
/**
 * Fetches network-wide statistics: total publishers, messages,
 * subscriber fees, publishing fees, and total revenue.
 */
export declare function getNetworkStats(): Promise<{
    publishers: number;
    messages: number;
    totalSubscriberFees: string;
    totalPublishingFees: string;
    totalRevenue: string;
}>;
