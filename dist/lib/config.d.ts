/** Runtime configuration loaded from environment variables. */
export declare const CONFIG: {
    readonly rpcUrl: string;
    readonly indexerUrl: string;
    readonly privateKey: `0x${string}` | undefined;
    readonly chainId: 421614;
};
/** Deployed contract addresses on Arbitrum Sepolia (testnet). */
export declare const ADDRESSES: {
    readonly DataRegistry: "0x05D89769A066549115b1B4408bFf899D2737F30b";
    readonly DataStream: "0x7E12bF2B0d43B9Ea0Bc37A06EcAC36b810351F35";
    readonly SchemaRegistry: "0x2e490F33180F3d387d46c213ADf776135c052acf";
    readonly PPBToken: "0x37a86eD3ee87109ff8cF96B3fe45c70a2ebB69f3";
    readonly MockUSDC: "0x93BfEbF99AF028ee57B138Fd17a26cAe76a01Fd2";
    readonly TestnetFaucet: "0x19d25F286b8Dca21886bCBe9c21334C6F0C532FB";
    readonly ReputationEngine: "0xa6D4BA149cB9CF32fAC6351158E1dDf3d9287283";
    readonly PQSVerifier: "0x67F97fc5E45889d3BFf7dcBA114Ca210f1896b0d";
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
