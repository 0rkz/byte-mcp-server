import dotenv from "dotenv";
dotenv.config();
/** Runtime configuration loaded from environment variables.
 *  `indexerUrl` accepts either INDEXER_URL or BYTE_INDEXER_URL (both names
 *  appeared in earlier docs/manifests; honor both to avoid silent default
 *  fall-through). Default is the hosted indexer — local dev can still
 *  override with INDEXER_URL=http://localhost:8080. */
export const CONFIG = {
    rpcUrl: process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    indexerUrl: process.env.INDEXER_URL ||
        process.env.BYTE_INDEXER_URL ||
        "https://feeds.payperbyte.io",
    /** x402 gateway base URL — serves the feed catalog (`/feeds`) and the
     *  pay-per-call endpoints. Distinct from the indexer (which serves
     *  publisher/subscription/event aggregates). */
    gatewayUrl: process.env.BYTE_GATEWAY_URL || "https://x402.payperbyte.io",
    privateKey: process.env.PRIVATE_KEY,
    chainId: 421614,
};
/** BYTE Library r2 contract addresses on Arbitrum Sepolia (testnet).
 *  Source: byte-protocol-contracts/deployments/arbitrum-sepolia.json "byte-library".
 *  BYTE Library is a no-token, first-party data catalog — settlement is in
 *  USDC. There is no PPB token, reputation engine, validator registry or
 *  on-chain PQS, so none of those addresses appear here.
 *  DataStream points at r2 (EIP-712 PayloadAttestation surface, devFund
 *  consolidated to PC wallet); v1 historical DataStream was 0x4b24...4c053. */
export const ADDRESSES = {
    DataRegistry: "0x086990937Cf931e36E01487CD63407f281f1Fc6A",
    DataStream: "0x44729bB148F46d8Db509E47b0453edc271e06e95",
    SchemaRegistry: "0x4102BA342A3e9f495bD553D99D1590470C32EE88",
    USDC: "0x1c16659aeb3aE28467E90348fAAB8874a0D3A4d3",
};
/** USDC has 6 decimals — used for every fee/price/balance amount. */
export const USDC_DECIMALS = 6;
/** Gas limits for write operations. */
export const GAS_LIMITS = {
    approve: 100000n,
    subscribe: 200000n,
    publish: 300000n,
    registerPublisher: 500000n,
    registerSchema: 300000n,
};
