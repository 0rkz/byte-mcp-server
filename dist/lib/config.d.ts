/** Runtime configuration loaded from environment variables. */
export declare const CONFIG: {
    readonly rpcUrl: string;
    readonly indexerUrl: string;
    readonly privateKey: `0x${string}` | undefined;
    readonly chainId: 421614;
};
/** BYTE Library v1 contract addresses on Arbitrum Sepolia (testnet).
 *  Source: byte-protocol-contracts/deployments/arbitrum-sepolia.json "byte-library".
 *  BYTE Library is a no-token, first-party data catalog — settlement is in
 *  USDC. There is no PPB token, reputation engine, validator registry or
 *  on-chain PQS, so none of those addresses appear here. */
export declare const ADDRESSES: {
    readonly DataRegistry: "0x086990937Cf931e36E01487CD63407f281f1Fc6A";
    readonly DataStream: "0x4b24006bc32A08176D5e2E779f8328Ce4384c053";
    readonly SchemaRegistry: "0x4102BA342A3e9f495bD553D99D1590470C32EE88";
    readonly USDC: "0x1c16659aeb3aE28467E90348fAAB8874a0D3A4d3";
};
/** USDC has 6 decimals — used for every fee/price/balance amount. */
export declare const USDC_DECIMALS = 6;
/** Gas limits for write operations. */
export declare const GAS_LIMITS: {
    readonly approve: 100000n;
    readonly subscribe: 200000n;
    readonly publish: 300000n;
    readonly registerPublisher: 500000n;
    readonly registerSchema: 300000n;
};
