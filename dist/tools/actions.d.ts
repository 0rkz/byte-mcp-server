/**
 * Unsubscribes from a publisher's data feed. Takes effect in the next block —
 * no more billing, no more data flow. Reversible via `subscribe(publisher)`
 * later. Use when a publisher pivots content, goes dormant, or you just don't
 * want the feed anymore.
 * @param publisher - Publisher address to unsubscribe from.
 */
export declare function unsubscribe(publisher: string): Promise<{
    subscriber: `0x${string}`;
    publisher: `0x${string}`;
    txHash: `0x${string}`;
    status: "success" | "reverted";
    blockNumber: string;
}>;
/**
 * Subscribes the connected wallet to a publisher's data feed.
 * @param publisher - Publisher Ethereum address to subscribe to.
 */
export declare function subscribe(publisher: string): Promise<{
    success: boolean;
    txHash: `0x${string}`;
    publisher: string;
}>;
/**
 * Registers a new data publisher on BYTE Library.
 * Registers a schema, then registers the publisher on-chain. An optional USDC
 * reputation stake (0 by default — BYTE Library v1 publishers are first-party
 * and unstaked) is approved to DataRegistry first when non-zero.
 */
export declare function registerPublisher(params: {
    stake: string;
    topic: string;
    expectedSize: number;
    maxSize: number;
    frequency: number;
    pricePerKB: number;
}): Promise<{
    success: boolean;
    txHash: `0x${string}`;
    schemaTxHash: `0x${string}`;
    approveTxHash: `0x${string}` | undefined;
    publisher: `0x${string}`;
    stakeUsdc: string;
    topic: string;
}>;
/**
 * Publishes data to a subscriber via the DataStream contract.
 * Hashes the payload, records size on-chain, and settles the fee in USDC.
 */
export declare function publishData(params: {
    subscriber: string;
    data: string;
    maxFee: number;
}): Promise<{
    success: boolean;
    txHash: `0x${string}`;
    payloadSize: number;
    payloadHash: `0x${string}`;
}>;
