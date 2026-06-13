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
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { CONFIG } from "../lib/config.js";
let cachedClient = null;
/**
 * Build the x402 HTTP client once and reuse. The signer is bound to
 * PRIVATE_KEY at first use; if the env var is missing we surface a clear
 * error rather than crashing at module-load (deferred so tools the user
 * doesn't actually invoke don't break MCP startup).
 */
function getClient() {
    if (cachedClient)
        return cachedClient;
    if (!CONFIG.privateKey) {
        throw new Error("PRIVATE_KEY env required to sign x402 payments — set it to the EOA " +
            "private key of the wallet that should be debited per request.");
    }
    const account = privateKeyToAccount(CONFIG.privateKey);
    const core = new x402Client();
    registerExactEvmScheme(core, { signer: account });
    cachedClient = new x402HTTPClient(core);
    return cachedClient;
}
export async function buyData(params) {
    const slug = params.feed.replace(/^\/+/, "").replace(/^feeds\//, "");
    const url = `${CONFIG.gatewayUrl}/feeds/${slug}`;
    let client;
    try {
        client = getClient();
    }
    catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
    const initial = await fetch(url);
    // Free / cached / unknown-error pass-through.
    if (initial.status !== 402) {
        if (!initial.ok) {
            return {
                error: `gateway returned ${initial.status} ${initial.statusText}`,
                detail: (await initial.text()).slice(0, 500),
            };
        }
        return {
            feed: slug,
            paid: false,
            status: initial.status,
            data: await initial.json(),
        };
    }
    // 402 — extract payment requirements and sign.
    const challenge = await initial.json().catch(() => ({}));
    const required = client.getPaymentRequiredResponse((name) => initial.headers.get(name), challenge);
    let paymentPayload;
    try {
        paymentPayload = await client.createPaymentPayload(required);
    }
    catch (e) {
        return {
            error: "Failed to sign x402 payment",
            detail: e instanceof Error ? e.message : String(e),
        };
    }
    const headers = client.encodePaymentSignatureHeader(paymentPayload);
    const paid = await fetch(url, { headers });
    if (!paid.ok) {
        return {
            error: `gateway rejected payment: ${paid.status} ${paid.statusText}`,
            detail: (await paid.text()).slice(0, 500),
        };
    }
    let settlement;
    try {
        settlement = client.getPaymentSettleResponse((name) => paid.headers.get(name));
    }
    catch {
        settlement = undefined;
    }
    const selected = required.accepts?.[0];
    const usdc = selected && "amount" in selected
        ? `$${(Number(selected.amount) / 1_000_000).toFixed(6)}`
        : undefined;
    const account = privateKeyToAccount(CONFIG.privateKey);
    return {
        feed: slug,
        paid: true,
        price: usdc,
        txHash: settlement?.transaction,
        payer: account.address,
        status: paid.status,
        data: await paid.json(),
    };
}
