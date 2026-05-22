import { createPublicClient, http, getContract, } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { CONFIG, ADDRESSES } from "./config.js";
// ─── ABIs (minimal, only the functions we call) ─────────────────────────────
// Verified against the compiled BYTE Library contracts:
//   contracts/out/DataRegistryLib.sol, contracts/out/DataStreamLib.sol.
export const DataRegistryAbi = [
    {
        name: "getPublisher",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "publisher", type: "address" }],
        outputs: [
            {
                name: "",
                type: "tuple",
                // IMPORTANT: field order must match Solidity struct exactly. Viem decodes
                // tuples by position, not by name — wrong order silently returns wrong
                // values for every field past the first mismatch.
                components: [
                    { name: "status", type: "uint8" },
                    { name: "tier", type: "uint8" },
                    { name: "stakedAmount", type: "uint256" },
                    { name: "sandboxStartTime", type: "uint256" },
                    { name: "registeredAt", type: "uint256" },
                    { name: "subscriberCount", type: "uint256" },
                    { name: "messageCount", type: "uint256" },
                    { name: "totalRevenue", type: "uint256" },
                    { name: "lastActiveTimestamp", type: "uint256" },
                    { name: "publicKey", type: "bytes32" },
                    { name: "slashCount", type: "uint256" },
                ],
            },
        ],
    },
    {
        name: "getPublisherListLength",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "isSubscribed",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "subscriber", type: "address" },
            { name: "publisher", type: "address" },
        ],
        outputs: [{ name: "", type: "bool" }],
    },
    {
        name: "getSubscriberCount",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "publisher", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "subscribe",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "publisher", type: "address" }],
        outputs: [],
    },
    {
        name: "unsubscribe",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "publisher", type: "address" }],
        outputs: [],
    },
    {
        name: "registerPublisher",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "stake", type: "uint256" },
            { name: "publicKey", type: "bytes32" },
        ],
        outputs: [],
    },
    {
        name: "publisherCount",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
];
export const DataStreamAbi = [
    {
        name: "totalMessages",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "totalSubscriberFees",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "streamData",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "subscriber", type: "address" },
            { name: "payloadHash", type: "bytes32" },
            { name: "payloadSize", type: "uint256" },
            { name: "maxFee", type: "uint256" },
        ],
        outputs: [],
    },
    {
        // DataStreamLib.estimateFee returns a single USDC fee (µUSDC). The old
        // v0.6 two-value (subscriberFee, publisherFee) signature is gone.
        name: "estimateFee",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "publisher", type: "address" },
            { name: "payloadLength", type: "uint256" },
        ],
        outputs: [{ name: "fee", type: "uint256" }],
    },
];
export const SchemaRegistryAbi = [
    {
        name: "getSchema",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "publisher", type: "address" }],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "expectedSize", type: "uint32" },
                    { name: "maxSize", type: "uint32" },
                    { name: "frequency", type: "uint32" },
                    { name: "publisherClass", type: "uint8" },
                    { name: "verificationType", type: "uint8" },
                    { name: "methodologyHash", type: "bytes32" },
                    { name: "topic", type: "bytes32" },
                    { name: "pricePerKB", type: "uint256" },
                    { name: "active", type: "bool" },
                    { name: "registeredAt", type: "uint256" },
                ],
            },
        ],
    },
    {
        name: "registerSchema",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "expectedSize", type: "uint32" },
            { name: "maxSize", type: "uint32" },
            { name: "frequency", type: "uint32" },
            { name: "publisherClass", type: "uint8" },
            { name: "verificationType", type: "uint8" },
            { name: "methodologyHash", type: "bytes32" },
            { name: "topic", type: "bytes32" },
            { name: "pricePerKB", type: "uint256" },
        ],
        outputs: [],
    },
    {
        name: "schemaCount",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "isActive",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "publisher", type: "address" }],
        outputs: [{ name: "", type: "bool" }],
    },
];
/** Minimal ERC-20 ABI — used for USDC (balances and the registration stake approve). */
export const Erc20Abi = [
    {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
    },
    {
        name: "allowance",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
    },
];
// ─── Clients ────────────────────────────────────────────────────────────────
/** Public (read-only) viem client for Arbitrum Sepolia. */
export const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(CONFIG.rpcUrl),
});
/**
 * Creates a wallet client for write operations.
 * @throws If PRIVATE_KEY is not set in environment.
 */
export function getWalletClient() {
    if (!CONFIG.privateKey) {
        throw new Error("PRIVATE_KEY environment variable is required for write operations. " +
            "Set it in your MCP server config or .env file.");
    }
    const account = privateKeyToAccount(CONFIG.privateKey);
    return createWalletClient({
        account,
        chain: arbitrumSepolia,
        transport: http(CONFIG.rpcUrl),
    });
}
/**
 * Derives the wallet address from the configured private key.
 * @throws If PRIVATE_KEY is not set in environment.
 */
export function getWalletAddress() {
    if (!CONFIG.privateKey) {
        throw new Error("PRIVATE_KEY environment variable is required.");
    }
    const account = privateKeyToAccount(CONFIG.privateKey);
    return account.address;
}
// ─── Contract helpers ───────────────────────────────────────────────────────
/** Returns a read-only DataRegistry contract instance. */
export function getDataRegistry() {
    return getContract({
        address: ADDRESSES.DataRegistry,
        abi: DataRegistryAbi,
        client: publicClient,
    });
}
/** Returns a read-only DataStream contract instance. */
export function getDataStream() {
    return getContract({
        address: ADDRESSES.DataStream,
        abi: DataStreamAbi,
        client: publicClient,
    });
}
/** Returns a read-only SchemaRegistry contract instance. */
export function getSchemaRegistry() {
    return getContract({
        address: ADDRESSES.SchemaRegistry,
        abi: SchemaRegistryAbi,
        client: publicClient,
    });
}
