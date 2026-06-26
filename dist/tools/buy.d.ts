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
/** The GATEWAY leg: the X-BYTE-Attestation receipt over the EXACT response bytes,
 *  recovered to the pinned gateway attester. Proves the gateway DELIVERED these
 *  exact bytes — it is NOT a verification of the data publisher's own attestation. */
interface GatewayLeg {
    /** hashMatch AND signerMatch — the GATEWAY delivered these exact bytes intact.
     *  NOT a guarantee the per-feed publisher attestation verifies (see embeddedAttestation). */
    gatewayVerified: boolean;
    /** keccak256(responseBody) === receipt.payloadHash. */
    hashMatch: boolean;
    /** the receipt recovered to the PINNED gateway attester. */
    signerMatch: boolean;
    /** the EIP-712 signer recovered from the receipt, or null. */
    recovered: string | null;
    /** the attester the receipt was pinned against. */
    attester: string;
    reason: string;
}
/** Two-leg-aware verification: the gateway DELIVERY envelope (verified here) PLUS
 *  the per-feed PUBLISHER attestation embedded in the answer — whose PRESENCE is
 *  surfaced but which is NOT verified here (that is the verifyEmbeddedAttestation
 *  fast-follow). An agent must verify the embedded leg before trusting the DATA. */
interface Verification extends GatewayLeg {
    /** The publisher's EIP-712 attestation embedded in the answer (answer.attestation):
     *  "present" on POST verdict-oracle responses, "absent" on plain GET data feeds. */
    embeddedAttestation: "present" | "absent";
    /** Two-leg guidance — exactly what gatewayVerified does and does not cover. */
    note: string;
}
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
    /** Inline verify-before-act result over the X-BYTE-Attestation receipt. */
    verification?: Verification;
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
