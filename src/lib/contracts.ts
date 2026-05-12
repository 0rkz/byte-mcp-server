import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  getContract,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { CONFIG, ADDRESSES } from "./config.js";

// ─── ABIs (minimal, only the functions we call) ─────────────────────────────

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
] as const;

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
    name: "totalPublishingFees",
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
    name: "estimateFee",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "publisher", type: "address" },
      { name: "payloadSize", type: "uint256" },
    ],
    outputs: [
      { name: "subscriberFee", type: "uint256" },
      { name: "publisherFee", type: "uint256" },
    ],
  },
] as const;

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
] as const;

export const PPBTokenAbi = [
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
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const PQSVerifierAbi = [
  {
    name: "getVerifiedPQS",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "publisher", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        // Canonical on-chain PQS composite: four sub-scores + aggregate + timestamp.
        // Weights per PQSVerifier.sol _computeComposite: dispute 40%, retention 25%,
        // freshness 15%, revenue 20%.
        components: [
          { name: "disputeScore", type: "uint256" },
          { name: "retentionScore", type: "uint256" },
          { name: "freshnessScore", type: "uint256" },
          { name: "revenueQuality", type: "uint256" },
          { name: "composite", type: "uint256" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export const TestnetFaucetAbi = [
  {
    name: "drip",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "timeUntilNextDrip",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "remainingAllowance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "dripAmount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

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
    throw new Error(
      "PRIVATE_KEY environment variable is required for write operations. " +
        "Set it in your MCP server config or .env file."
    );
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
export function getWalletAddress(): Address {
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

/** Returns a read-only PPBToken (ERC-20) contract instance. */
export function getPPBToken() {
  return getContract({
    address: ADDRESSES.PPBToken,
    abi: PPBTokenAbi,
    client: publicClient,
  });
}

/** Returns a read-only PQSVerifier contract instance. */
export function getPQSVerifier() {
  return getContract({
    address: ADDRESSES.PQSVerifier,
    abi: PQSVerifierAbi,
    client: publicClient,
  });
}

/** Returns a read-only TestnetFaucet contract instance. */
export function getTestnetFaucet() {
  return getContract({
    address: ADDRESSES.TestnetFaucet,
    abi: TestnetFaucetAbi,
    client: publicClient,
  });
}
