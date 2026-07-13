/**
 * Subscriber-side provenance verification for BYTE Library r2 payloads — the
 * "verify-before-act" primitive, exposed to agents as the byte_verify_payload tool.
 *
 * The on-chain DataStreamed / BroadcastStreamed event certifies that the publisher
 * SIGNED an EIP-712 PayloadAttestation over (publisher, payloadHash, payloadLength,
 * deadline). That proves the publisher attested *to a payload with the given hash*.
 * It does NOT prove the bytes an agent received over its delivery channel (archive,
 * gateway, MITM-able transport) match that hash.
 *
 * verifyPayload() closes the gap: recompute keccak256 of the bytes the agent is
 * about to act on and compare to the on-chain attested hash. recoverAttestationSigner()
 * adds the second leg: the on-chain hash was actually signed by the named publisher.
 * Together: "the bytes I'm about to act on are exactly what publisher P cryptographically
 * attested to on-chain." An agent calls this BEFORE acting; on mismatch it refuses.
 */
import { keccak256, toBytes, recoverTypedDataAddress, parseAbiItem, } from "viem";
import { publicClient } from "./contracts.js";
import { ADDRESSES, CONFIG } from "./config.js";
// ─── Canonical JSON (byte-identical with the SDK's canonical.ts / canonical.py) ──
// Recursively key-sorted, no insignificant whitespace, UTF-8. Arrays keep order.
function sortDeep(v) {
    if (Array.isArray(v))
        return v.map(sortDeep);
    if (v && typeof v === "object") {
        const out = {};
        for (const k of Object.keys(v).sort()) {
            out[k] = sortDeep(v[k]);
        }
        return out;
    }
    return v;
}
export function canonicalBytes(value) {
    return new TextEncoder().encode(JSON.stringify(sortDeep(value)));
}
/**
 * Recompute the keccak256 of received payload bytes.
 *  - "raw"       : keccak256(utf8(string)) — matches byte_publish_data and publishers
 *                  that hash a JSON.stringify(payload) string verbatim.
 *  - "canonical" : keccak256(canonicalBytes(object)) — matches publishers that hash
 *                  the canonical (key-sorted, whitespace-free) JSON of the payload.
 * Hex 0x-strings are hashed as raw bytes regardless of mode.
 */
export function computePayloadHash(received, mode = "raw") {
    if (received instanceof Uint8Array)
        return keccak256(received).toLowerCase();
    if (typeof received === "string") {
        return (received.startsWith("0x") && received.length % 2 === 0
            ? keccak256(received)
            : keccak256(toBytes(received))).toLowerCase();
    }
    // object → caller wants structured hashing
    return mode === "canonical"
        ? keccak256(canonicalBytes(received)).toLowerCase()
        : keccak256(toBytes(JSON.stringify(received))).toLowerCase();
}
function normalizeHash(h) {
    const lower = h.toLowerCase();
    return (lower.startsWith("0x") ? lower : `0x${lower}`);
}
// BYTE Library r2 broadcast event (signature verified live against the contract).
const BROADCAST_EVENT = parseAbiItem("event BroadcastStreamed(address indexed publisher, uint256 subscriberCount, bytes32 payloadHash, uint256 payloadLength, uint256 totalSubscriberFees, uint256 timestamp, uint256 attestationDeadline, bytes attestation)");
const ATTESTATION_TYPES = {
    PayloadAttestation: [
        { name: "publisher", type: "address" },
        { name: "payloadHash", type: "bytes32" },
        { name: "payloadLength", type: "uint256" },
        { name: "deadline", type: "uint256" },
    ],
};
/**
 * Recover the EIP-712 PayloadAttestation signer and confirm it is the named
 * publisher. This is the cryptographic "publisher really signed this hash" leg.
 */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export async function recoverAttestationSigner(att) {
    // Fail CLOSED on empty/malformed input. recoverTypedDataAddress THROWS on a
    // short/garbage signature or malformed message field — which would turn a
    // forged/empty on-chain attestation into a crash instead of a clean
    // signerMatch=false. Treat any recovery failure as "not the publisher".
    if (!att || typeof att.signature !== "string" || att.signature.length <= 2) {
        return { signer: ZERO_ADDRESS, match: false };
    }
    try {
        const signer = await recoverTypedDataAddress({
            domain: {
                name: "BYTE Library",
                version: "1",
                chainId: CONFIG.chainId,
                verifyingContract: ADDRESSES.DataStream,
            },
            types: ATTESTATION_TYPES,
            primaryType: "PayloadAttestation",
            message: {
                publisher: att.publisher,
                payloadHash: att.payloadHash,
                payloadLength: att.payloadLength,
                deadline: att.deadline,
            },
            signature: att.signature,
        });
        return { signer, match: signer.toLowerCase() === att.publisher.toLowerCase() };
    }
    catch {
        return { signer: ZERO_ADDRESS, match: false };
    }
}
/**
 * Verify-before-act. Recompute the hash of `received` and compare to the on-chain
 * attested hash. The attested hash comes from one of:
 *   - `expectedHash`: an on-chain payloadHash the agent already holds (e.g. from
 *      byte_query_fact). Fast path, no extra RPC; no signer check.
 *   - `txHash`: a settlement tx. We read its BroadcastStreamed log to get the
 *      authoritative on-chain hash AND recover the attestation signer.
 * `verified` is true only when the recomputed hash matches AND (if a signer was
 * recovered) the signer is the attesting publisher.
 */
export async function verifyPayload(opts) {
    // Fail CLOSED if the received payload can't be hashed — computePayloadHash does
    // JSON.stringify on objects, which THROWS on a BigInt (or BigInt-containing
    // object/array) from untrusted/adversarial input. A verify path must return a
    // negative verdict, never throw.
    let recomputed;
    try {
        recomputed = computePayloadHash(opts.received, opts.mode ?? "raw");
    }
    catch {
        return {
            verified: false,
            recomputedHash: "0x",
            onChainHash: "0x",
            hashMatch: false,
            source: opts.txHash ? "txHash" : "expectedHash",
            reason: "could not hash the received payload (unserializable input, e.g. a BigInt) — fail-closed; pass JSON-serializable bytes/string",
        };
    }
    if (opts.txHash) {
        const receipt = await publicClient.getTransactionReceipt({
            hash: opts.txHash,
        });
        const log = receipt.logs.find((l) => l.address.toLowerCase() === ADDRESSES.DataStream.toLowerCase() &&
            l.topics[0] === keccak256(toBytes("BroadcastStreamed(address,uint256,bytes32,uint256,uint256,uint256,uint256,bytes)")));
        if (!log) {
            return {
                verified: false,
                recomputedHash: recomputed,
                onChainHash: "0x",
                hashMatch: false,
                source: "txHash",
                txHash: opts.txHash,
                reason: "no BroadcastStreamed event found in that tx on the r2 DataStream — pass expectedHash instead, or use the broadcast settlement tx",
            };
        }
        const { decodeEventLog } = await import("viem");
        const decoded = decodeEventLog({
            abi: [BROADCAST_EVENT],
            data: log.data,
            topics: log.topics,
        });
        const args = decoded.args;
        const onChainHash = normalizeHash(args.payloadHash);
        const hashMatch = recomputed === onChainHash;
        let signer;
        let signerMatch;
        if (args.attestation && args.attestation.length > 2) {
            const r = await recoverAttestationSigner({
                publisher: args.publisher,
                payloadHash: args.payloadHash,
                payloadLength: args.payloadLength,
                deadline: args.attestationDeadline,
                signature: args.attestation,
            });
            signer = r.signer;
            signerMatch = r.match;
        }
        else {
            // The r2 contract REQUIRES a valid attestation to emit BroadcastStreamed
            // (DataStreamLib._verifyPayloadAttestation), so an empty/missing one on a
            // DataStream event is anomalous → FAIL CLOSED (do not pass on the hash leg
            // alone). Mirrors the Foreseal Kit's verify-before-act semantics.
            signerMatch = false;
        }
        const verified = hashMatch && signerMatch === true;
        return {
            verified,
            recomputedHash: recomputed,
            onChainHash,
            hashMatch,
            signer,
            attestingPublisher: args.publisher,
            signerMatch,
            source: "txHash",
            txHash: opts.txHash,
            blockNumber: receipt.blockNumber.toString(),
            reason: verified
                ? "received bytes match the publisher's on-chain attested hash; attestation signed by the named publisher — safe to act"
                : !hashMatch
                    ? "HASH MISMATCH — the received bytes are NOT what the publisher attested on-chain; do not act"
                    : "attestation signature did not recover to the named publisher (or is missing); do not act",
        };
    }
    // Guard the type: normalizeHash does .toLowerCase(), which THROWS on a
    // non-string expectedHash. A non-string falls through to the fail-closed
    // "provide a valid anchor" return below rather than crashing.
    if (typeof opts.expectedHash === "string" && opts.expectedHash.length > 0) {
        const onChainHash = normalizeHash(opts.expectedHash);
        const hashMatch = recomputed === onChainHash;
        return {
            verified: hashMatch,
            recomputedHash: recomputed,
            onChainHash,
            hashMatch,
            source: "expectedHash",
            reason: hashMatch
                ? "received bytes match the expected attested hash — safe to act"
                : "HASH MISMATCH — the received bytes do NOT match the expected attested hash; do not act",
        };
    }
    return {
        verified: false,
        recomputedHash: recomputed,
        onChainHash: "0x",
        hashMatch: false,
        source: "expectedHash",
        reason: "provide either expectedHash (an on-chain payloadHash) or txHash (a settlement tx) to verify against",
    };
}
