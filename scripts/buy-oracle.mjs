#!/usr/bin/env node
/**
 * buy-oracle.mjs — one-off POST x402 purchase of a flagship POST oracle
 * (address-reputation, sanctions-screen, pkg-verdict, reasoning-verdict, …).
 *
 * byte_buy_data only does GET; the verdict oracles are POST + require a JSON
 * query body. This mirrors buy.ts's exact x402 signing path (x402Client +
 * registerExactEvmScheme + x402HTTPClient) but issues a POST with the body, so a
 * real paid 200 flows through the instrumented gateway → per-delivery logging.
 *
 * Usage (PRIVATE_KEY stays in your shell — never committed/echoed):
 *   PRIVATE_KEY=0x... node scripts/buy-oracle.mjs <slug> '<json-body>'
 *
 * Settles real USDC on Base mainnet to the Safe. ~$0.10 per oracle.
 */
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const GATEWAY = process.env.BYTE_GATEWAY_URL || "https://x402.payperbyte.io";
const slug = (process.argv[2] || "").replace(/^\/+/, "").replace(/^feeds\//, "");
const bodyArg = process.argv[3] || "{}";

if (!slug) {
  console.error("usage: PRIVATE_KEY=0x.. node scripts/buy-oracle.mjs <slug> '<json-body>'");
  process.exit(2);
}
const pk = process.env.PRIVATE_KEY;
if (!pk) {
  console.error("PRIVATE_KEY env required to sign the x402 payment (it is never logged).");
  process.exit(2);
}
try {
  JSON.parse(bodyArg);
} catch {
  console.error(`body is not valid JSON: ${bodyArg}`);
  process.exit(2);
}

const url = `${GATEWAY}/feeds/${slug}`;
const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
const core = new x402Client();
registerExactEvmScheme(core, { signer: account });
const client = new x402HTTPClient(core);

const post = (extraHeaders) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(extraHeaders || {}) },
    body: bodyArg,
  });

const initial = await post();
if (initial.status !== 402) {
  console.error(`expected HTTP 402, got ${initial.status}: ${(await initial.text()).slice(0, 400)}`);
  process.exit(1);
}

const challenge = await initial.json().catch(() => ({}));
const required = client.getPaymentRequiredResponse((n) => initial.headers.get(n), challenge);
const payload = await client.createPaymentPayload(required);
const payHeaders = client.encodePaymentSignatureHeader(payload);

const paid = await post(payHeaders);
const text = await paid.text();
if (!paid.ok) {
  console.error(`gateway rejected payment: ${paid.status} ${paid.statusText} — ${text.slice(0, 400)}`);
  process.exit(1);
}

let settle = {};
try {
  settle = client.getPaymentSettleResponse((n) => paid.headers.get(n)) || {};
} catch {
  /* settlement header optional */
}

console.log(
  JSON.stringify(
    {
      feed: slug,
      paid: true,
      status: paid.status,
      payer: account.address,
      txHash: settle.transaction || settle.txHash || settle.tx || null,
      attestation: !!paid.headers.get("x-byte-attestation"),
      data: (() => {
        try {
          return JSON.parse(text);
        } catch {
          return text.slice(0, 600);
        }
      })(),
    },
    null,
    2,
  ),
);
