/**
 * Fetches on-chain info for a publisher: status, usage counts, USDC revenue,
 * and the registered schema (size bounds, cadence, price-per-KB).
 * @param address - Publisher Ethereum address.
 */
export declare function getPublisher(address: string): Promise<{
    address: `0x${string}`;
    status: string;
    subscribers: number;
    messages: number;
    revenueUsdc: string;
    registeredAt: number;
    lastActive: number;
    schema: {
        expectedSize: number;
        maxSize: number;
        frequency: number;
        pricePerKBUsdc: string;
        active: boolean;
        topic: `0x${string}`;
    };
}>;
/**
 * Fetches BYTE Library network-wide statistics: total publishers, messages
 * streamed, and total subscriber fees settled (USDC).
 */
export declare function getNetworkStats(): Promise<{
    publishers: number;
    messages: number;
    totalSubscriberFeesUsdc: string;
}>;
