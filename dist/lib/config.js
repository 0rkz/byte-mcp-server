import dotenv from "dotenv";
dotenv.config();
/** Runtime configuration loaded from environment variables. */
export const CONFIG = {
    rpcUrl: process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
    indexerUrl: process.env.INDEXER_URL || "http://localhost:8080",
    privateKey: process.env.PRIVATE_KEY,
    chainId: 421614,
};
/** Deployed contract addresses on Arbitrum Sepolia (testnet). */
export const ADDRESSES = {
    DataRegistry: "0x05D89769A066549115b1B4408bFf899D2737F30b",
    DataStream: "0x7E12bF2B0d43B9Ea0Bc37A06EcAC36b810351F35",
    SchemaRegistry: "0x2e490F33180F3d387d46c213ADf776135c052acf",
    PPBToken: "0x37a86eD3ee87109ff8cF96B3fe45c70a2ebB69f3",
    MockUSDC: "0x93BfEbF99AF028ee57B138Fd17a26cAe76a01Fd2",
    TestnetFaucet: "0x19d25F286b8Dca21886bCBe9c21334C6F0C532FB",
    ReputationEngine: "0x3b842Aac0b932D546ed6C87895350EaeF0bEbcc3",
    PQSVerifier: "0x67F97fc5E45889d3BFf7dcBA114Ca210f1896b0d",
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
