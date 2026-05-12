import { parseEther, keccak256, toBytes, type Address } from "viem";
import {
  publicClient,
  getWalletClient,
  getWalletAddress,
  DataRegistryAbi,
  DataStreamAbi,
  SchemaRegistryAbi,
  PPBTokenAbi,
  TestnetFaucetAbi,
} from "../lib/contracts.js";
import { ADDRESSES, GAS_LIMITS } from "../lib/config.js";

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
 * Requests testnet PPB tokens from the faucet.
 * Subject to 24h cooldown and 1000 PPB lifetime cap.
 */
export async function dripFaucet() {
  const wallet = getWalletClient();
  const account = getWalletAddress();

  const hash = await wallet.writeContract({
    address: ADDRESSES.TestnetFaucet,
    abi: TestnetFaucetAbi,
    functionName: "drip",
    gas: GAS_LIMITS.drip,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  return {
    success: receipt.status === "success",
    txHash: hash,
    amount: "500 PPB",
    recipient: account,
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
 * Registers a new data publisher on Byte Protocol.
 * Performs three on-chain transactions: register schema, approve stake, register publisher.
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
  const stakeWei = parseEther(params.stake);
  const topicHash = keccak256(toBytes(params.topic));
  const methodologyHash = keccak256(toBytes(`${params.topic}-methodology`));
  const pricePerKBWei = parseEther(String(params.pricePerKB));

  // Step 1: Register schema
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
      pricePerKBWei,
    ],
    gas: GAS_LIMITS.registerSchema,
  });
  await publicClient.waitForTransactionReceipt({ hash: schemaHash });

  // Step 2: Approve PPB stake
  const approveHash = await wallet.writeContract({
    address: ADDRESSES.PPBToken,
    abi: PPBTokenAbi,
    functionName: "approve",
    args: [ADDRESSES.DataRegistry, stakeWei],
    gas: GAS_LIMITS.approve,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  // Step 3: Register publisher
  const publicKey = keccak256(toBytes(account));
  const registerHash = await wallet.writeContract({
    address: ADDRESSES.DataRegistry,
    abi: DataRegistryAbi,
    functionName: "registerPublisher",
    args: [stakeWei, publicKey],
    gas: GAS_LIMITS.registerPublisher,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: registerHash,
  });

  return {
    success: receipt.status === "success",
    txHash: registerHash,
    schemaTxHash: schemaHash,
    approveTxHash: approveHash,
    publisher: account,
    stake: params.stake,
    topic: params.topic,
  };
}

/**
 * Publishes data to a subscriber via the DataStream contract.
 * Hashes the payload and records size on-chain.
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
  const maxFeeWei = parseEther(String(params.maxFee));

  const hash = await wallet.writeContract({
    address: ADDRESSES.DataStream,
    abi: DataStreamAbi,
    functionName: "streamData",
    args: [params.subscriber as Address, payloadHash, payloadSize, maxFeeWei],
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
