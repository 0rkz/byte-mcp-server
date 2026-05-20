/** Runtime configuration loaded from environment variables. */
export declare const CONFIG: {
    readonly rpcUrl: string;
    readonly indexerUrl: string;
    readonly privateKey: `0x${string}` | undefined;
    readonly chainId: 421614;
};
/** Deployed contract addresses on Arbitrum Sepolia (testnet).
 *  v0.6 bundled redeploy 2026-05-20 — DataRegistry, DataStream,
 *  ReputationEngine, and USDC (now MockUSDC3009) migrated to fresh
 *  addresses; SchemaRegistry, PPBToken, and PQSVerifier are reused. */
export declare const ADDRESSES: {
    readonly DataRegistry: "0x85868CEF6db4531c8c6E378b725BC2813233e014";
    readonly DataStream: "0x8a20759a89f037B9c2062758f2789A1f858b0b27";
    readonly SchemaRegistry: "0x2e490F33180F3d387d46c213ADf776135c052acf";
    readonly PPBToken: "0x37a86eD3ee87109ff8cF96B3fe45c70a2ebB69f3";
    readonly MockUSDC: "0x1c16659aeb3aE28467E90348fAAB8874a0D3A4d3";
    readonly TestnetFaucet: "0x19d25F286b8Dca21886bCBe9c21334C6F0C532FB";
    readonly ReputationEngine: "0xaF7cd2544B742Ea9Df439f0f5DD43Ab02Cbb9b56";
    readonly PQSVerifier: "0xD7c8423296a6E2Dd36466AC0e41884846a27cdE9";
};
/** Gas limits for write operations. */
export declare const GAS_LIMITS: {
    readonly approve: 100000n;
    readonly subscribe: 200000n;
    readonly publish: 300000n;
    readonly registerPublisher: 500000n;
    readonly registerSchema: 300000n;
    readonly drip: 150000n;
};
