/**
 * byte_query_fact — query a Byte Protocol fact-oracle publisher for a
 * verified factual answer with citations.
 *
 * Flow:
 *   1. Search indexer for publishers with topic="fact-oracle" + minPQS filter
 *   2. Parse each publisher's DataRegistry.metadata to find request_endpoint
 *   3. POST {question, subscriber_address, max_byte_cost} → publisher HTTP
 *   4. Receive 202 ACK with {request_id, est_eta_ms}
 *   5. Watch DataStream.BroadcastStreamed events filtered by publisher
 *   6. For each matching event, fetch payload from off-chain archive
 *   7. Match payload.request_id to our request_id → return answer + citations
 *
 * Architecture per FACT_ORACLE_PROTOTYPE_DESIGN.md §6, decisions per
 * FACT_ORACLE_RESEARCH_2026-05-14.md §7. Tool name locked: byte_query_fact.
 */
import { createPublicClient, http, parseAbi, bytesToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { randomBytes } from "node:crypto";
import { CONFIG, ADDRESSES } from "../lib/config.js";
const DATASTREAM_EVENT_ABI = parseAbi([
    "event BroadcastStreamed(address indexed publisher, uint256 subscriberCount, bytes32 payloadHash, uint256 payloadLength, uint256 totalSubscriberFees, uint256 totalPublisherFees)",
]);
const PAYLOAD_ARCHIVE_BASE = process.env.PAYLOAD_ARCHIVE_BASE || "https://api.payperbyte.io/payload";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTE_COST = 2000;
// v0.6 §7 — Subscriber-signed request authentication.
// Domain MUST match fact-oracle/server.py exactly.
const EIP712_DOMAIN_NAME = "Byte Protocol Fact Oracle";
const EIP712_DOMAIN_VERSION = "0.6";
// Server caps deadline horizon at 600s (FACT_MAX_DEADLINE_HORIZON_S). We stay
// safely below: max 540s ahead. The signature lifetime is bounded by either
// (timeout_ms / 1000) for the agent's intent OR this ceiling, whichever is
// smaller — prevents leaked keys from being usable far in the future.
const MAX_SIGNATURE_HORIZON_S = 540;
const FACT_QUERY_TYPES = {
    FactQuery: [
        { name: "publisher", type: "address" },
        { name: "subscriber", type: "address" },
        { name: "question", type: "string" },
        { name: "maxByteCost", type: "uint256" },
        { name: "nonce", type: "bytes32" },
        { name: "deadline", type: "uint256" },
    ],
};
// ─── Helpers ─────────────────────────────────────────────────────
/**
 * Find publishers with topic="fact-oracle" via the indexer.
 * Optionally filter by minimum PQS.
 */
async function searchFactPublishers(opts) {
    const url = new URL("/publishers", CONFIG.indexerUrl);
    // Fact-oracle publishers register with topic "fact-oracle".
    url.searchParams.set("topic", opts.topic_filter || "fact-oracle");
    if (opts.min_pqs !== undefined) {
        url.searchParams.set("minPQS", String(opts.min_pqs));
    }
    url.searchParams.set("sort", "pqs");
    url.searchParams.set("limit", String(opts.limit ?? 5));
    const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
        throw new Error(`Indexer publishers API ${res.status} at ${CONFIG.indexerUrl}. ` +
            `Ensure the indexer is reachable.`);
    }
    const data = (await res.json());
    return Array.isArray(data) ? data : [];
}
/**
 * Fetch a publisher's full record (includes metadata JSON string) from the indexer.
 * Parses metadata for the `request_endpoint` field (set when registering a
 * fact-oracle publisher; see fact-oracle README §5.4).
 */
async function getRequestEndpoint(publisher) {
    const url = new URL(`/publisher/${publisher.toLowerCase()}`, CONFIG.indexerUrl);
    try {
        const res = await fetch(url.toString(), {
            signal: AbortSignal.timeout(3_000),
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        // Indexer returns publisher row including raw metadata string
        const metadataRaw = data.metadata;
        if (!metadataRaw)
            return null;
        let meta;
        try {
            meta = JSON.parse(metadataRaw);
        }
        catch {
            return null;
        }
        return typeof meta.request_endpoint === "string" ? meta.request_endpoint : null;
    }
    catch {
        return null;
    }
}
/**
 * Sign an EIP-712 FactQuery message with the subscriber's private key.
 * Returns the signature, nonce, and deadline that must be sent in the
 * POST body alongside the existing fields. Throws if CONFIG.privateKey
 * isn't configured.
 *
 * v0.6 §7 — Closes the "spend someone else's escrow" attack. Without
 * this, any actor could submit /query naming any subscriber_address
 * and burn that subscriber's on-chain USDC escrow.
 */
async function signFactQuery(opts) {
    if (!CONFIG.privateKey) {
        throw new Error("PRIVATE_KEY env required to sign fact-query requests (v0.6 §7). " +
            "Set the subscriber's EOA private key in your MCP server env.");
    }
    const account = privateKeyToAccount(CONFIG.privateKey);
    if (account.address.toLowerCase() !== opts.subscriber.toLowerCase()) {
        throw new Error(`signer address ${account.address} doesn't match subscriber_address ${opts.subscriber} — ` +
            `PRIVATE_KEY in env must correspond to the subscriber EOA`);
    }
    const now = Math.floor(Date.now() / 1000);
    const desiredHorizon = Math.floor(opts.timeoutMs / 1000) + 30; // 30s buffer over agent timeout
    const horizon = Math.min(desiredHorizon, MAX_SIGNATURE_HORIZON_S);
    const deadline_unix = now + horizon;
    // Cryptographically-random 32-byte nonce. Prevents replay.
    const nonce_bytes = randomBytes(32);
    const request_nonce = bytesToHex(nonce_bytes);
    const signature = await account.signTypedData({
        domain: {
            name: EIP712_DOMAIN_NAME,
            version: EIP712_DOMAIN_VERSION,
            chainId: CONFIG.chainId,
            verifyingContract: opts.publisher,
        },
        types: FACT_QUERY_TYPES,
        primaryType: "FactQuery",
        message: {
            publisher: opts.publisher,
            subscriber: opts.subscriber,
            question: opts.question,
            maxByteCost: BigInt(opts.maxByteCost),
            nonce: request_nonce,
            deadline: BigInt(deadline_unix),
        },
    });
    return { subscriber_signature: signature, request_nonce, deadline_unix };
}
/**
 * POST the question to the publisher's HTTP endpoint. Returns the 202 ACK body
 * (request_id + est_eta_ms) or null on transport/HTTP failure.
 *
 * v0.6 §7: body now includes subscriber_signature + request_nonce +
 * deadline_unix. The publisher's server rejects (401) any request whose
 * signature doesn't recover to subscriber_address or whose nonce has been
 * seen before or whose deadline has passed.
 */
async function postQuery(endpoint, body) {
    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(3_000),
        });
        if (res.status !== 202) {
            return null;
        }
        return (await res.json());
    }
    catch {
        return null;
    }
}
/**
 * Watch DataStream for BroadcastStreamed events from `publisher` and find the
 * one whose payload matches our request_id. Returns the matched event metadata
 * (payloadHash, blockNumber, etc.) and the parsed payload, or null on timeout.
 */
async function waitForBroadcastMatch(opts) {
    const client = createPublicClient({
        chain: arbitrumSepolia,
        transport: http(CONFIG.rpcUrl),
    });
    const deadline = Date.now() + opts.timeout_ms;
    let cursor = opts.start_block;
    while (Date.now() < deadline) {
        const head = await client.getBlockNumber();
        if (head > cursor) {
            const logs = await client.getLogs({
                address: ADDRESSES.DataStream,
                event: DATASTREAM_EVENT_ABI[0],
                args: { publisher: opts.publisher },
                fromBlock: cursor,
                toBlock: head,
            });
            for (const log of logs) {
                const args = log.args;
                if (!args?.payloadHash)
                    continue;
                const payload = await fetchPayload(args.payloadHash);
                if (!payload)
                    continue;
                if (payload.request_id === opts.request_id) {
                    return {
                        payloadHash: args.payloadHash,
                        payloadLength: args.payloadLength ? Number(args.payloadLength) : 0,
                        payload,
                    };
                }
            }
            cursor = head + 1n;
        }
        // Poll every 1.5s — gives BroadcastStreamed + indexer + archive time to settle
        await new Promise((r) => setTimeout(r, 1_500));
    }
    return null;
}
/**
 * Fetch the off-chain payload archive entry for a given payloadHash.
 * Returns parsed JSON or null on miss/error.
 */
async function fetchPayload(payloadHash) {
    const hashHex = payloadHash.startsWith("0x") ? payloadHash.slice(2) : payloadHash;
    const url = `${PAYLOAD_ARCHIVE_BASE}/${hashHex}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
        if (!res.ok)
            return null;
        const data = await res.json();
        // Archive wraps payloads — `.payload` is the actual envelope.
        // 2026-05-15: was `.body` (never existed — would always fall through and
        // return the wrapper record instead of the envelope, breaking request_id
        // matching downstream). Verified against the local archive directory's
        // `<payload-hash>.json` records that the discovery-api serves.
        if (typeof data === "object" &&
            data !== null &&
            "payload" in data) {
            return data.payload;
        }
        return data;
    }
    catch {
        return null;
    }
}
// ─── Main tool entry ─────────────────────────────────────────────
export async function queryFact(params) {
    const start = Date.now();
    const max_byte_cost = params.max_byte_cost ?? DEFAULT_MAX_BYTE_COST;
    const timeout_ms = params.max_response_latency_ms ?? DEFAULT_TIMEOUT_MS;
    if (!/^0x[0-9a-fA-F]{40}$/.test(params.subscriber_address)) {
        return { error: "subscriber_address must be 0x-prefixed 40-hex" };
    }
    // 1. Find eligible publishers (sorted by PQS desc).
    let publishers;
    try {
        publishers = await searchFactPublishers({
            topic_filter: params.topic_filter,
            min_pqs: params.min_publisher_pqs,
            limit: 5,
        });
    }
    catch (e) {
        return { error: `Indexer search failed: ${String(e)}` };
    }
    if (publishers.length === 0) {
        return {
            error: "No fact-oracle publishers registered. Register one via byte-fact-oracle-feed and stake 100 PPB on DataRegistry.",
        };
    }
    // 2. Snapshot block height BEFORE posting query so the event watcher's window
    //    starts from this point (avoids matching old broadcasts from this publisher).
    const client = createPublicClient({
        chain: arbitrumSepolia,
        transport: http(CONFIG.rpcUrl),
    });
    const start_block = await client.getBlockNumber();
    // 3. Try publishers in PQS-descending order until one ACKs.
    const tried = [];
    for (const pub of publishers) {
        tried.push(pub.address);
        const endpoint = await getRequestEndpoint(pub.address);
        if (!endpoint)
            continue;
        // v0.6 §7: sign the request before posting. Bound to THIS publisher,
        // THIS subscriber, THIS question, THIS cost cap, THIS deadline. Server
        // rejects 401 on any tamper / replay / expiry.
        let signed;
        try {
            signed = await signFactQuery({
                publisher: pub.address,
                subscriber: params.subscriber_address,
                question: params.question,
                maxByteCost: max_byte_cost,
                timeoutMs: timeout_ms,
            });
        }
        catch (e) {
            return {
                error: `Cannot sign request: ${e instanceof Error ? e.message : String(e)}`,
            };
        }
        const ack = await postQuery(endpoint, {
            question: params.question,
            subscriber_address: params.subscriber_address,
            max_byte_cost,
            deadline_ms: Date.now() + timeout_ms,
            subscriber_signature: signed.subscriber_signature,
            request_nonce: signed.request_nonce,
            deadline_unix: signed.deadline_unix,
        });
        if (!ack)
            continue;
        // 4. Wait for the matching BroadcastStreamed event.
        const match = await waitForBroadcastMatch({
            publisher: pub.address,
            request_id: ack.request_id,
            start_block,
            timeout_ms,
        });
        if (!match) {
            // Publisher ACKed but didn't broadcast in time (insolvent subscriber,
            // LLM refused, broadcast tx failed). Try next publisher.
            continue;
        }
        const payload = match.payload;
        return {
            answer: typeof payload.answer === "string" ? payload.answer : "",
            citations: Array.isArray(payload.citations)
                ? payload.citations
                : [],
            publisher_address: pub.address,
            publisher_pqs: pub.pqs,
            confidence: typeof payload.confidence === "number" ? payload.confidence : 0,
            request_id: ack.request_id,
            payload_hash: match.payloadHash,
            response_size_bytes: match.payloadLength,
            publisher_tx_or_status: "delivered",
            elapsed_ms: Date.now() - start,
        };
    }
    return {
        error: "All fact-oracle publishers failed to deliver a matching response within the timeout. " +
            "Common causes: subscriber not subscribed to publisher, subscriber USDC escrow empty, " +
            "publishers' LLM refused due to low confidence.",
        publishers_tried: tried,
        attempted: tried.length,
    };
}
