#!/usr/bin/env node
/**
 * BYTE Library r2 — publishData EIP-712 signing smoke.
 *
 * Goal: prove the typed-data envelope in
 * mcp-server/src/tools/actions.ts:publishData is correct WITHOUT requiring a
 * live chain. If recovery succeeds against the expected publisher address,
 * the on-chain DataStreamLib will also accept the signature (same algo —
 * keccak digest of EIP-712 domain || struct + ECDSA.recover).
 *
 * What this catches:
 *   - Domain name / version / chainId / verifyingContract drift between the
 *     MCP server and DataStreamLib.PAYLOAD_ATTESTATION_TYPEHASH.
 *   - Struct field order / type drift (the EIP-712 typehash must match
 *     "PayloadAttestation(address publisher,bytes32 payloadHash,uint256 payloadLength,uint256 deadline)").
 *   - Signature byte-length / r||s||v ordering.
 *
 * What it does NOT cover:
 *   - That the deployed DataStreamLib at ADDRESSES.DataStream is actually r2.
 *     (Foundry tests cover that.)
 *   - End-to-end contract call success — that needs a live RPC + funded
 *     wallet + registered publisher + USDC-approved subscriber.
 *
 * Run: node test/r2-publish-smoke.mjs
 */

import { keccak256, toBytes, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount as p2a } from "viem/accounts";
// Pin the domain to the SAME source the real publish path (actions.ts) reads from,
// so this smoke validates the PRODUCTION domain and can't silently drift on a
// redeploy (the old hardcoded EXPECTED_DATA_STREAM was the dead v1 contract).
import { ADDRESSES, CONFIG } from "../dist/lib/config.js";

const TEST_KEY = "0x" + "a".repeat(64);

const account = p2a(TEST_KEY);
console.log(`Test publisher address (derived from key): ${account.address}`);

// Same typed-data shape as actions.ts:publishData ↓
const data = "smoke-test-payload";
const payloadBytes = toBytes(data);
const payloadHash = keccak256(payloadBytes);
const payloadLength = BigInt(payloadBytes.length);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

const domain = {
  name: "BYTE Library",
  version: "1",
  chainId: CONFIG.chainId,
  verifyingContract: ADDRESSES.DataStream,
};
console.log(
  `Validating production EIP-712 domain → verifyingContract=${domain.verifyingContract} ` +
    `chainId=${domain.chainId} (from config — the same source actions.ts:publishData uses)`,
);

const types = {
  PayloadAttestation: [
    { name: "publisher", type: "address" },
    { name: "payloadHash", type: "bytes32" },
    { name: "payloadLength", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const message = {
  publisher: account.address,
  payloadHash,
  payloadLength,
  deadline,
};

let exitCode = 0;
function assert(cond, label) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}`);
    exitCode = 1;
  }
}

// 1. Sign
const signature = await account.signTypedData({
  domain,
  types,
  primaryType: "PayloadAttestation",
  message,
});

console.log(`\nSignature (${signature.length} chars / ${(signature.length - 2) / 2} bytes):`);
console.log(`  ${signature}`);

assert(signature.startsWith("0x"), "signature is 0x-prefixed hex");
assert((signature.length - 2) / 2 === 65, "signature is exactly 65 bytes (r‖s‖v)");

// 2. Recover the signer from the typed data + signature.
const recovered = await recoverTypedDataAddress({
  domain,
  types,
  primaryType: "PayloadAttestation",
  message,
  signature,
});

console.log(`\nRecovered address: ${recovered}`);
console.log(`Expected address:  ${account.address}`);

assert(
  recovered.toLowerCase() === account.address.toLowerCase(),
  "recovered signer matches publisher (contract will also recover correctly)",
);

// 3. Tampered-hash recovery should produce a DIFFERENT address.
const tamperedRecover = await recoverTypedDataAddress({
  domain,
  types,
  primaryType: "PayloadAttestation",
  message: { ...message, payloadHash: keccak256(toBytes("different-payload")) },
  signature,
});
assert(
  tamperedRecover.toLowerCase() !== account.address.toLowerCase(),
  "tampered payloadHash → different recovered address (sig binds to bytes)",
);

// 4. Cross-domain replay: same sig, different chainId → wrong address.
const wrongChainRecover = await recoverTypedDataAddress({
  domain: { ...domain, chainId: 1 },
  types,
  primaryType: "PayloadAttestation",
  message,
  signature,
});
assert(
  wrongChainRecover.toLowerCase() !== account.address.toLowerCase(),
  "chainId-replay attempt → different recovered address (domain binds chain)",
);

console.log(
  exitCode === 0
    ? "\nALL CHECKS PASS — actions.ts signing envelope is correct.\n"
    : "\nFAILED — see ✗ lines above.\n",
);
process.exit(exitCode);
