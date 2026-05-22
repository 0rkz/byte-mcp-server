import dotenv from "dotenv";
dotenv.config();

/** Runtime configuration loaded from environment variables. */
export const CONFIG = {
  rpcUrl: process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
  indexerUrl: process.env.INDEXER_URL || "http://localhost:8080",
  privateKey: process.env.PRIVATE_KEY as `0x${string}` | undefined,
  chainId: 421614,
} as const;

/** Deployed contract addresses on Arbitrum Sepolia (testnet).
 *  BYTE Library v1 (first-party MVP), deployed 2026-05-22 — DataRegistry,
 *  DataStream and SchemaRegistry are the BYTE Library set; MockUSDC and
 *  PQSVerifier are reused. PPBToken / ReputationEngine are not part of
 *  BYTE Library (no token, no dispute engine) — kept here only so existing
 *  tool code referencing them still type-checks. */
export const ADDRESSES = {
  DataRegistry: "0x086990937Cf931e36E01487CD63407f281f1Fc6A" as const,
  DataStream: "0x4b24006bc32A08176D5e2E779f8328Ce4384c053" as const,
  SchemaRegistry: "0x4102BA342A3e9f495bD553D99D1590470C32EE88" as const,
  PPBToken: "0x37a86eD3ee87109ff8cF96B3fe45c70a2ebB69f3" as const,
  MockUSDC: "0x1c16659aeb3aE28467E90348fAAB8874a0D3A4d3" as const,
  TestnetFaucet: "0x19d25F286b8Dca21886bCBe9c21334C6F0C532FB" as const,
  ReputationEngine: "0xaF7cd2544B742Ea9Df439f0f5DD43Ab02Cbb9b56" as const,
  PQSVerifier: "0xD7c8423296a6E2Dd36466AC0e41884846a27cdE9" as const,
} as const;

/** Gas limits for write operations. */
export const GAS_LIMITS = {
  approve: 100_000n,
  subscribe: 200_000n,
  publish: 300_000n,
  registerPublisher: 500_000n,
  registerSchema: 300_000n,
  drip: 150_000n,
} as const;
