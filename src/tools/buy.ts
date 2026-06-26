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
import { recoverAttestationSigner, computePayloadHash } from "../lib/verify.js";

/** Gateway attester to PIN receipts against (out-of-band, from
 *  /.well-known/agent.json → receipt.attester). Env-overridable if it rotates. */
const PINNED_GATEWAY_ATTESTER = (
  process.env.BYTE_GATEWAY_ATTESTER || "0x77c86a5367d941091a31BC97104609F2Db33C472"
).toLowerCase();

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

/**
 * Verify-before-act on the X-BYTE-Attestation receipt the gateway returns:
 * recompute keccak256(EXACT body bytes) === payloadHash AND recover the EIP-712
 * signer and confirm it is the pinned gateway attester. Throw-free.
 */
async function verifyReceiptInline(
  body: string,
  headerValue: string | null,
): Promise<GatewayLeg> {
  const base = { attester: PINNED_GATEWAY_ATTESTER };
  if (!headerValue) {
    return { gatewayVerified: false, hashMatch: false, signerMatch: false, recovered: null, ...base,
      reason: "no X-BYTE-Attestation header on the paid response — gateway delivery unproven" };
  }
  try {
    const r = JSON.parse(headerValue);
    const hashMatch = computePayloadHash(body).toLowerCase() === String(r.payloadHash).toLowerCase();
    const { signer } = await recoverAttestationSigner({
      publisher: r.publisher,
      payloadHash: r.payloadHash,
      payloadLength: BigInt(r.payloadLength),
      deadline: BigInt(r.deadline),
      signature: r.signature,
    });
    const signerMatch = signer.toLowerCase() === PINNED_GATEWAY_ATTESTER;
    return {
      gatewayVerified: hashMatch && signerMatch,
      hashMatch,
      signerMatch,
      recovered: signer,
      ...base,
      reason:
        hashMatch && signerMatch
          ? "gateway delivery verified — these exact bytes were signed by the pinned gateway attester"
          : !hashMatch
            ? "HASH MISMATCH — the response bytes are NOT what the gateway attester signed; do not act"
            : "gateway receipt did not recover to the pinned gateway attester; do not act",
    };
  } catch {
    return { gatewayVerified: false, hashMatch: false, signerMatch: false, recovered: null, ...base,
      reason: "X-BYTE-Attestation header malformed or unverifiable — fail-closed" };
  }
}

/**
 * Two-leg-aware verification + parse, used by BOTH the paid and free response
 * paths. The GATEWAY leg (verifyReceiptInline) proves the gateway delivered these
 * exact bytes. The per-feed PUBLISHER attestation embedded in the answer
 * (answer.attestation) is only DETECTED here, NOT verified — surfacing it (with a
 * note + the verify recipe) keeps byte_buy_data honest until the
 * verifyEmbeddedAttestation SDK helper lands (fast-follow).
 */
async function verifyDelivery(
  body: string,
  headerValue: string | null,
): Promise<{ data: unknown; verification: Verification }> {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    data = body;
  }
  const leg = await verifyReceiptInline(body, headerValue);
  const att = (data as { attestation?: { signature?: unknown } } | null)?.attestation;
  const embeddedPresent = !!(att && typeof att === "object" && att.signature);
  return {
    data,
    verification: {
      ...leg,
      embeddedAttestation: embeddedPresent ? "present" : "absent",
      note: embeddedPresent
        ? "gatewayVerified covers the DELIVERY envelope only (the gateway signed these exact " +
          "bytes). The per-feed PUBLISHER attestation (answer.attestation) is PRESENT but NOT " +
          "verified here — before acting on the verdict/data, recompute keccak256 over the " +
          "canonical (insertion-order, minified) `answer` bytes and recover its signer, then " +
          "confirm it is the feed's publisher (verify recipe; verifyEmbeddedAttestation is a fast-follow)."
        : "gatewayVerified covers the delivery envelope; no embedded per-feed attestation in this " +
          "response (e.g. a plain GET data feed).",
    },
  };
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

let cachedClient: x402HTTPClient | null = null;

/**
 * Build the x402 HTTP client once and reuse. The signer is bound to
 * PRIVATE_KEY at first use; if the env var is missing we surface a clear
 * error rather than crashing at module-load (deferred so tools the user
 * doesn't actually invoke don't break MCP startup).
 */
function getClient(): x402HTTPClient {
  if (cachedClient) return cachedClient;
  if (!CONFIG.privateKey) {
    throw new Error(
      "PRIVATE_KEY env required to sign x402 payments — set it to the EOA " +
        "private key of the wallet that should be debited per request.",
    );
  }
  const account = privateKeyToAccount(CONFIG.privateKey);
  const core = new x402Client();
  registerExactEvmScheme(core, { signer: account });
  cachedClient = new x402HTTPClient(core);
  return cachedClient;
}

export async function buyData(params: { feed: string; body?: unknown }): Promise<BuyResult | BuyError> {
  const slug = params.feed.replace(/^\/+/, "").replace(/^feeds\//, "");
  const url = `${CONFIG.gatewayUrl}/feeds/${slug}`;

  // POST oracles (address-reputation, sanctions-screen, pkg-verdict,
  // reasoning-verdict, …) require a JSON query body. When `body` is supplied this
  // call becomes a POST carrying that body (on both the 402 probe and the paid
  // replay); without `body` it stays a GET — the plain data-feed path.
  const hasBody = params.body !== undefined && params.body !== null;
  const bodyStr = hasBody ? JSON.stringify(params.body) : undefined;

  let client: x402HTTPClient;
  try {
    client = getClient();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  const initial = await fetch(
    url,
    hasBody
      ? { method: "POST", headers: { "content-type": "application/json" }, body: bodyStr }
      : {},
  );

  // Free / cached / unknown-error pass-through.
  if (initial.status !== 402) {
    if (!initial.ok) {
      return {
        error: `gateway returned ${initial.status} ${initial.statusText}`,
        detail: (await initial.text()).slice(0, 500),
      };
    }
    // Non-402 200 (free / cached / broadcast). Verify-before-act STILL applies:
    // read the exact bytes once, verify any X-BYTE-Attestation receipt inline
    // (fails closed when the response carries no attestation), then parse — so a
    // 200 that skipped the 402 handshake can never reach the agent as actable
    // bytes without a verification verdict.
    const text = await initial.text();
    const { data, verification } = await verifyDelivery(
      text,
      initial.headers.get("x-byte-attestation"),
    );
    return {
      feed: slug,
      paid: false,
      status: initial.status,
      data,
      verification,
    };
  }

  // 402 — extract payment requirements and sign.
  const challenge = await initial.json().catch(() => ({}));
  const required = client.getPaymentRequiredResponse(
    (name) => initial.headers.get(name),
    challenge,
  );

  let paymentPayload;
  try {
    paymentPayload = await client.createPaymentPayload(required);
  } catch (e) {
    return {
      error: "Failed to sign x402 payment",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  const payHeaders = client.encodePaymentSignatureHeader(paymentPayload);
  // Merge the x402 payment header(s) with the POST content-type when sending a
  // body. `new Headers()` accepts either a plain object or a Headers instance.
  const reqHeaders = new Headers(payHeaders as HeadersInit);
  if (hasBody) reqHeaders.set("content-type", "application/json");
  const paid = await fetch(
    url,
    hasBody
      ? { method: "POST", headers: reqHeaders, body: bodyStr }
      : { headers: reqHeaders },
  );

  if (!paid.ok) {
    return {
      error: `gateway rejected payment: ${paid.status} ${paid.statusText}`,
      detail: (await paid.text()).slice(0, 500),
    };
  }

  let settlement;
  try {
    settlement = client.getPaymentSettleResponse((name) => paid.headers.get(name));
  } catch {
    settlement = undefined;
  }

  const selected = required.accepts?.[0];
  const usdc = selected && "amount" in selected
    ? `$${(Number((selected as { amount: string }).amount) / 1_000_000).toFixed(6)}`
    : undefined;
  const account = privateKeyToAccount(CONFIG.privateKey!);

  // Read the EXACT response bytes ONCE (the bytes the gateway hashed + signed),
  // run the two-leg verify (gateway delivery leg + embedded-attestation presence),
  // and parse for the caller.
  const text = await paid.text();
  const { data, verification } = await verifyDelivery(text, paid.headers.get("x-byte-attestation"));

  return {
    feed: slug,
    paid: true,
    price: usdc,
    txHash: (settlement as { transaction?: string } | undefined)?.transaction,
    payer: account.address,
    status: paid.status,
    data,
    verification,
  };
}
