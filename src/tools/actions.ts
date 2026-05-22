import { parseUnits, keccak256, toBytes, type Address } from "viem";
import {
  publicClient,
  getWalletClient,
  getWalletAddress,
  DataRegistryAbi,
  DataStreamAbi,
  SchemaRegistryAbi,
  Erc20Abi,
} from "../lib/contracts.js";
import { ADDRESSES, GAS_LIMITS, USDC_DECIMALS } from "../lib/config.js";

/**
 * Unsubscribes from a publisher's data feed. Takes effect in the next block —
 * no more billing, no more data flow. Reversible via `subscribe(publisher)`
 * later. Use when a publisher pivots content, goes dormant, or you just don't
 * want the feed anymore.
 * @param publisher - Publisher address to unsubscribe from.
 */
export async function unsubscribe(publisher: string) {
  const wallet = getWalletClient();
  const account = getWalletAddress();
  const pub = publisher as Address;

  const hash = await wallet.writeContract({
    address: ADDRESSES.DataRegistry,
    abi: DataRegistryAbi,
    functionName: "unsubscribe",
    args: [pub],
    gas: (GAS_LIMITS as Record<string, bigint>).subscribe ?? BigInt(200_000),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return {
    subscriber: account,
    publisher: pub,
    txHash: receipt.transactionHash,
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
  };
}

/**
 * Subscribes the connected wallet to a publisher's data feed.
 * @param publisher - Publisher Ethereum address to subscribe to.
 */
export async function subscribe(publisher: string) {
  const wallet = getWalletClient();

  const hash = await wallet.writeContract({
    address: ADDRESSES.DataRegistry,
    abi: DataRegistryAbi,
    functionName: "subscribe",
    args: [publisher as Address],
    gas: GAS_LIMITS.subscribe,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    success: receipt.status === "success",
    txHash: hash,
    publisher,
  };
}

/**
 * Registers a new data publisher on BYTE Library.
 * Registers a schema, then registers the publisher on-chain. An optional USDC
 * reputation stake (0 by default — BYTE Library v1 publishers are first-party
 * and unstaked) is approved to DataRegistry first when non-zero.
 */
export async function registerPublisher(params: {
  stake: string;
  topic: string;
  expectedSize: number;
  maxSize: number;
  frequency: number;
  pricePerKB: number;
}) {
  const wallet = getWalletClient();
  const account = getWalletAddress();
  const stakeAmount = parseUnits(params.stake || "0", USDC_DECIMALS);
  const topicHash = keccak256(toBytes(params.topic));
  const methodologyHash = keccak256(toBytes(`${params.topic}-methodology`));
  const pricePerKBUsdc = parseUnits(String(params.pricePerKB), USDC_DECIMALS);

  // Step 1: Register schema.
  const schemaHash = await wallet.writeContract({
    address: ADDRESSES.SchemaRegistry,
    abi: SchemaRegistryAbi,
    functionName: "registerSchema",
    args: [
      params.expectedSize,
      params.maxSize,
      params.frequency,
      0, // PublisherClass: DataFeed
      0, // VerificationType: None
      methodologyHash,
      topicHash,
      pricePerKBUsdc,
    ],
    gas: GAS_LIMITS.registerSchema,
  });
  await publicClient.waitForTransactionReceipt({ hash: schemaHash });

  // Step 2: Approve the USDC stake (only when a non-zero stake is requested).
  let approveTxHash: `0x${string}` | undefined;
  if (stakeAmount > 0n) {
    const hash = await wallet.writeContract({
      address: ADDRESSES.USDC,
      abi: Erc20Abi,
      functionName: "approve",
      args: [ADDRESSES.DataRegistry, stakeAmount],
      gas: GAS_LIMITS.approve,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    approveTxHash = hash;
  }

  // Step 3: Register publisher.
  const publicKey = keccak256(toBytes(account));
  const registerHash = await wallet.writeContract({
    address: ADDRESSES.DataRegistry,
    abi: DataRegistryAbi,
    functionName: "registerPublisher",
    args: [stakeAmount, publicKey],
    gas: GAS_LIMITS.registerPublisher,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: registerHash,
  });

  return {
    success: receipt.status === "success",
    txHash: registerHash,
    schemaTxHash: schemaHash,
    approveTxHash,
    publisher: account,
    stakeUsdc: params.stake || "0",
    topic: params.topic,
  };
}

/**
 * Publishes data to a subscriber via the DataStream contract.
 * Hashes the payload, records size on-chain, and settles the fee in USDC.
 */
export async function publishData(params: {
  subscriber: string;
  data: string;
  maxFee: number;
}) {
  const wallet = getWalletClient();

  const payloadBytes = toBytes(params.data);
  const payloadSize = BigInt(payloadBytes.length);
  const payloadHash = keccak256(payloadBytes);
  const maxFeeUsdc = parseUnits(String(params.maxFee), USDC_DECIMALS);

  const hash = await wallet.writeContract({
    address: ADDRESSES.DataStream,
    abi: DataStreamAbi,
    functionName: "streamData",
    args: [params.subscriber as Address, payloadHash, payloadSize, maxFeeUsdc],
    gas: GAS_LIMITS.publish,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    success: receipt.status === "success",
    txHash: hash,
    payloadSize: Number(payloadSize),
    payloadHash,
  };
}
