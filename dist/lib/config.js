import dotenv from "dotenv";
dotenv.config();
/** Runtime configuration loaded from environment variables. */
export const CONFIG = {
    rpcUrl: process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    indexerUrl: process.env.INDEXER_URL || "http://localhost:8080",
    privateKey: process.env.PRIVATE_KEY,
    chainId: 421614,
};
/** Deployed contract addresses on Arbitrum Sepolia (testnet).
 *  v0.6 bundled redeploy 2026-05-20 — DataRegistry, DataStream,
 *  ReputationEngine, and USDC (now MockUSDC3009) migrated to fresh
 *  addresses; SchemaRegistry, PPBToken, and PQSVerifier are reused. */
export const ADDRESSES = {
    DataRegistry: "0x85868CEF6db4531c8c6E378b725BC2813233e014",
    DataStream: "0x8a20759a89f037B9c2062758f2789A1f858b0b27",
    SchemaRegistry: "0x2e490F33180F3d387d46c213ADf776135c052acf",
    PPBToken: "0x37a86eD3ee87109ff8cF96B3fe45c70a2ebB69f3",
    MockUSDC: "0x1c16659aeb3aE28467E90348fAAB8874a0D3A4d3",
    TestnetFaucet: "0x19d25F286b8Dca21886bCBe9c21334C6F0C532FB",
    ReputationEngine: "0xaF7cd2544B742Ea9Df439f0f5DD43Ab02Cbb9b56",
    PQSVerifier: "0xD7c8423296a6E2Dd36466AC0e41884846a27cdE9",
};
/** Gas limits for write operations. */
export const GAS_LIMITS = {
    approve: 100000n,
    subscribe: 200000n,
    publish: 300000n,
    registerPublisher: 500000n,
    registerSchema: 300000n,
    drip: 150000n,
};
