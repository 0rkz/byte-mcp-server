/**
 * byte_buy_data — pay-per-call purchase of a single data packet from any
 * feed exposed by the BYTE Library x402 gateway. The agent-native one-off
 * verb that complements byte_subscribe (continuous stream).
 *
 * Flow:
 *   1. GET https://x402.payperbyte.io/feeds/<slug>
 *   2. Server returns HTTP 402 with x402 v2 PAYMENT-REQUIRED header
 *   3. We construct a signed EIP-3009 USDC transferWithAuthorization
 *      ("exact" scheme) using the wallet's PRIVATE_KEY
 *   4. Replay the GET with the encoded payment header
 *   5. Server verifies + settles through the x402 facilitator, returns the
 *      data + a PAYMENT-RESPONSE header carrying the settlement tx hash
 *   6. Return the data, settlement tx hash, and metadata to the caller
 *
 * No subscription, no allowance, no prior on-chain setup — the only
 * pre-requisite is USDC + ETH for gas in the wallet whose key is
 * PRIVATE_KEY. The facilitator (not the caller) submits the tx that
 * actually moves the USDC, so the caller doesn't need ETH at all in
 * principle — but the wallet must hold USDC to be debited.
 */
interface BuyResult {
    feed: string;
    paid: boolean;
    /** USD amount paid (e.g., "$0.001000"). Omitted on free-feed responses. */
    price?: string;
    /** On-chain settlement tx hash from the facilitator. */
    txHash?: string;
    /** Wallet that signed the EIP-3009 authorization. */
    payer?: `0x${string}`;
    /** The actual data payload returned by the gateway. */
    data: unknown;
    /** Status code from the final (post-payment) response. */
    status: number;
}
interface BuyError {
    error: string;
    detail?: string;
}
export declare function buyData(params: {
    feed: string;
    body?: unknown;
}): Promise<BuyResult | BuyError>;
export {};
