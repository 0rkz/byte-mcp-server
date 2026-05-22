/** Runtime configuration loaded from environment variables. */
export declare const CONFIG: {
    readonly rpcUrl: string;
    readonly indexerUrl: string;
    readonly privateKey: `0x${string}` | undefined;
    readonly chainId: 421614;
};
/** Deployed contract addresses on Arbitrum Sepolia (testnet).
 *  BYTE Library v1 (first-party MVP), deployed 2026-05-22 — DataRegistry,
 *  DataStream and SchemaRegistry are the BYTE Library set; MockUSDC and
 *  PQSVerifier are reused. PPBToken / ReputationEngine are not part of
 *  BYTE Library (no token, no dispute engine) — kept here only so existing
 *  tool code referencing them still type-checks. */
export declare const ADDRESSES: {
    readonly DataRegistry: "0x086990937Cf931e36E01487CD63407f281f1Fc6A";
    readonly DataStream: "0x4b24006bc32A08176D5e2E779f8328Ce4384c053";
    readonly SchemaRegistry: "0x4102BA342A3e9f495bD553D99D1590470C32EE88";
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
