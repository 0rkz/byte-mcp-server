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
import { type Hex, type Address } from "viem";
export declare function canonicalBytes(value: unknown): Uint8Array;
export type HashMode = "raw" | "canonical";
/**
 * Recompute the keccak256 of received payload bytes.
 *  - "raw"       : keccak256(utf8(string)) — matches byte_publish_data and publishers
 *                  that hash a JSON.stringify(payload) string verbatim.
 *  - "canonical" : keccak256(canonicalBytes(object)) — matches publishers that hash
 *                  the canonical (key-sorted, whitespace-free) JSON of the payload.
 * Hex 0x-strings are hashed as raw bytes regardless of mode.
 */
export declare function computePayloadHash(received: string | Uint8Array | unknown, mode?: HashMode): Hex;
export interface PayloadVerdict {
    verified: boolean;
    recomputedHash: Hex;
    onChainHash: Hex;
    hashMatch: boolean;
    signer?: Address;
    attestingPublisher?: Address;
    signerMatch?: boolean;
    source: "expectedHash" | "txHash";
    txHash?: Hex;
    blockNumber?: string;
    reason: string;
}
/**
 * Recover the EIP-712 PayloadAttestation signer and confirm it is the named
 * publisher. This is the cryptographic "publisher really signed this hash" leg.
 */
export declare function recoverAttestationSigner(att: {
    publisher: Address;
    payloadHash: Hex;
    payloadLength: bigint;
    deadline: bigint;
    signature: Hex;
}): Promise<{
    signer: Address;
    match: boolean;
}>;
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
export declare function verifyPayload(opts: {
    received: string | Uint8Array | unknown;
    mode?: HashMode;
    expectedHash?: string;
    txHash?: string;
}): Promise<PayloadVerdict>;
