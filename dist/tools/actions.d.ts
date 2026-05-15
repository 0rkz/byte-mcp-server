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
 * Requests testnet PPB tokens from the faucet.
 * Subject to 24h cooldown and 1000 PPB lifetime cap.
 */
export declare function dripFaucet(): Promise<{
    success: boolean;
    txHash: `0x${string}`;
    amount: string;
    recipient: `0x${string}`;
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
 * Registers a new data publisher on Byte Protocol.
 * Performs three on-chain transactions: register schema, approve stake, register publisher.
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
    approveTxHash: `0x${string}`;
    publisher: `0x${string}`;
    stake: string;
    topic: string;
}>;
/**
 * Publishes data to a subscriber via the DataStream contract.
 * Hashes the payload and records size on-chain.
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
