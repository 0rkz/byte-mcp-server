/**
 * Verify-path fail-closed regressions for the MCP server (byte_verify_payload).
 *
 * Part of the pre-ship gate (ops/preship/PRESHIP_GATE.md): every verify path must
 * fail CLOSED on empty / forged / malformed input — never throw, never return
 * verified=true on garbage. Offline-only (no RPC): exercises recoverAttestationSigner
 * directly and verifyPayload's expectedHash / no-anchor paths.
 *
 * Run: node --test test/verify-failclosed.test.mjs   (after `npm run build`)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  recoverAttestationSigner,
  verifyPayload,
  computePayloadHash,
} from "../dist/lib/verify.js";
import { CONFIG, ADDRESSES } from "../dist/lib/config.js";

// anvil well-known #0 / #1
const A = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const B = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

const DOMAIN = {
  name: "BYTE Library",
  version: "1",
  chainId: CONFIG.chainId,
  verifyingContract: ADDRESSES.DataStream,
};
const TYPES = {
  PayloadAttestation: [
    { name: "publisher", type: "address" },
    { name: "payloadHash", type: "bytes32" },
    { name: "payloadLength", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};
const sign = (account, message) =>
  account.signTypedData({ domain: DOMAIN, types: TYPES, primaryType: "PayloadAttestation", message });

test("recoverAttestationSigner: empty signature → match=false, no throw", async () => {
  const r = await recoverAttestationSigner({
    publisher: A.address, payloadHash: keccak256(toBytes("x")), payloadLength: 1n, deadline: 1n, signature: "0x",
  });
  assert.equal(r.match, false);
});

test("recoverAttestationSigner: garbage signature → match=false, no throw", async () => {
  const r = await recoverAttestationSigner({
    publisher: A.address, payloadHash: keccak256(toBytes("x")), payloadLength: 1n, deadline: 1n, signature: "0xdeadbeef",
  });
  assert.equal(r.match, false);
});

test("recoverAttestationSigner: wrong key (B signs, header claims A) → match=false", async () => {
  const msg = { publisher: A.address, payloadHash: keccak256(toBytes("hello")), payloadLength: 5n, deadline: 9999999999n };
  const signature = await sign(B, msg); // B signs a message that names A as publisher
  const r = await recoverAttestationSigner({ ...msg, signature });
  assert.equal(r.match, false);
});

test("recoverAttestationSigner: genuine A signature → match=true (positive control)", async () => {
  const msg = { publisher: A.address, payloadHash: keccak256(toBytes("hello")), payloadLength: 5n, deadline: 9999999999n };
  const signature = await sign(A, msg);
  const r = await recoverAttestationSigner({ ...msg, signature });
  assert.equal(r.match, true);
  assert.equal(r.signer.toLowerCase(), A.address.toLowerCase());
});

test("verifyPayload: neither expectedHash nor txHash → verified=false (fail-closed)", async () => {
  const v = await verifyPayload({ received: "anything" });
  assert.equal(v.verified, false);
});

test("verifyPayload: expectedHash mismatch (tampered bytes) → verified=false", async () => {
  const v = await verifyPayload({ received: "the real bytes", expectedHash: keccak256(toBytes("different bytes")) });
  assert.equal(v.verified, false);
  assert.equal(v.hashMatch, false);
  assert.match(v.reason, /MISMATCH/);
});

test("verifyPayload: expectedHash match → verified=true (positive control)", async () => {
  const body = "the real bytes";
  const v = await verifyPayload({ received: body, expectedHash: computePayloadHash(body, "raw") });
  assert.equal(v.verified, true);
  assert.equal(v.hashMatch, true);
});

// ── unserializable / non-string input must fail closed, never throw ──
const GOODHASH = "0x" + "ab".repeat(32);

test("verifyPayload: bigint received (+expectedHash) → verified=false, no throw", async () => {
  const v = await verifyPayload({ received: 123n, expectedHash: GOODHASH });
  assert.equal(v.verified, false);
});

test("verifyPayload: object-with-bigint received (canonical) → verified=false, no throw", async () => {
  const v = await verifyPayload({ received: { a: 1n }, mode: "canonical", expectedHash: GOODHASH });
  assert.equal(v.verified, false);
});

test("verifyPayload: bigint received, no anchor → verified=false, no throw", async () => {
  const v = await verifyPayload({ received: 7n });
  assert.equal(v.verified, false);
});

test("verifyPayload: non-string expectedHash (number) → verified=false, no throw", async () => {
  const v = await verifyPayload({ received: "hello", expectedHash: 12345 });
  assert.equal(v.verified, false);
});
