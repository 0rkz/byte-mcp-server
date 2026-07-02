/** Runtime configuration loaded from environment variables.
 *  `indexerUrl` accepts either INDEXER_URL or BYTE_INDEXER_URL (both names
 *  appeared in earlier docs/manifests; honor both to avoid silent default
 *  fall-through). Default is the hosted indexer — local dev can still
 *  override with INDEXER_URL=http://localhost:8080. */
export declare const CONFIG: {
    readonly rpcUrl: string;
    readonly indexerUrl: string;
    /** x402 gateway base URL — serves the feed catalog (`/feeds`) and the
     *  pay-per-call endpoints. Distinct from the indexer (which serves
     *  publisher/subscription/event aggregates). */
    readonly gatewayUrl: string;
    readonly privateKey: `0x${string}` | undefined;
    /** Optional server-side spend cap for x402 pay-per-call purchases, as a
     *  decimal USDC string (e.g. "0.25"). When set, byte_buy_data refuses
     *  fail-closed any 402 quote above the cap BEFORE signing a payment.
     *  Unset = uncapped (unchanged behavior). */
    readonly maxPaymentUsdc: string | undefined;
    /** Chain of the ON-CHAIN layer (BYTE Library contracts, indexer, EIP-712
     *  attestation domain): Arbitrum Sepolia, audit-gated. The x402 PAYMENT rail
     *  is independent — byte_buy_data signs whatever network the gateway's 402
     *  challenge quotes (Base mainnet, eip155:8453, real USDC as of 2026-06-10);
     *  nothing here pins it. */
    readonly chainId: 421614;
};
/** BYTE Library r2 contract addresses on Arbitrum Sepolia (testnet).
 *  Source: byte-protocol-contracts/deployments/arbitrum-sepolia.json "byte-library".
 *  BYTE Library is a no-token, first-party data catalog — settlement is in
 *  USDC. There is no PPB token, reputation engine, validator registry or
 *  on-chain PQS, so none of those addresses appear here.
 *  DataStream points at r2 (EIP-712 PayloadAttestation surface, devFund
 *  consolidated to PC wallet); v1 historical DataStream was 0x4b24...4c053. */
export declare const ADDRESSES: {
    readonly DataRegistry: "0x086990937Cf931e36E01487CD63407f281f1Fc6A";
    readonly DataStream: "0x44729bB148F46d8Db509E47b0453edc271e06e95";
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
