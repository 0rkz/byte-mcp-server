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
 *
 * By default also sets USDC allowance to DataStreamLib to `type(uint256).max`
 * so the subscription doesn't silently lose payments when the allowance
 * depletes mid-window. The contract's allowance-skip path emits
 * `DataStreamed` with `amount=0` on `transferFrom` failure rather than
 * reverting, so a subscriber with insufficient allowance gets data but no
 * USDC moves — a real silent-failure footgun the bundled approval closes
 * for the common case. Pass `skipAllowance: true` to opt out (e.g., to set
 * a finite cap manually for security reasons).
 *
 * The auto-approve is a no-op when the wallet already has ≥ $1000 USDC of
 * allowance to DataStreamLib (avoids wasteful txs on already-configured
 * subscribers).
 *
 * @param params.publisher       Publisher address to subscribe to.
 * @param params.skipAllowance   Opt out of the bundled approve(max).
 */
export declare function subscribe(params: {
    publisher: string;
    skipAllowance?: boolean;
}): Promise<{
    success: boolean;
    txHash: `0x${string}`;
    allowanceTxHash: `0x${string}` | undefined;
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
