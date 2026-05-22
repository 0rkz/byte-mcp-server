import { formatUnits, type Address } from "viem";
import {
  publicClient,
  DataRegistryAbi,
  DataStreamAbi,
  SchemaRegistryAbi,
} from "../lib/contracts.js";
import { ADDRESSES, USDC_DECIMALS } from "../lib/config.js";

/** Human-readable status names indexed by the on-chain PublisherStatus enum. */
const STATUS_NAMES = ["Unregistered", "Sandbox", "Active", "Suspended", "Banned"];

/**
 * Fetches on-chain info for a publisher: status, usage counts, USDC revenue,
 * and the registered schema (size bounds, cadence, price-per-KB).
 * @param address - Publisher Ethereum address.
 */
export async function getPublisher(address: string) {
  const addr = address as Address;

  const [publisher, schema] = await Promise.all([
    publicClient.readContract({
      address: ADDRESSES.DataRegistry,
      abi: DataRegistryAbi,
      functionName: "getPublisher",
      args: [addr],
    }),
    publicClient.readContract({
      address: ADDRESSES.SchemaRegistry,
      abi: SchemaRegistryAbi,
      functionName: "getSchema",
      args: [addr],
    }),
  ]);

  return {
    address: addr,
    status: STATUS_NAMES[Number(publisher.status)] || "Unknown",
    subscribers: Number(publisher.subscriberCount),
    messages: Number(publisher.messageCount),
    revenueUsdc: formatUnits(publisher.totalRevenue, USDC_DECIMALS),
    registeredAt: Number(publisher.registeredAt),
    lastActive: Number(publisher.lastActiveTimestamp),
    schema: {
      expectedSize: Number(schema.expectedSize),
      maxSize: Number(schema.maxSize),
      frequency: Number(schema.frequency),
      pricePerKBUsdc: formatUnits(schema.pricePerKB, USDC_DECIMALS),
      active: schema.active,
      topic: schema.topic,
    },
  };
}

/**
 * Fetches BYTE Library network-wide statistics: total publishers, messages
 * streamed, and total subscriber fees settled (USDC).
 */
export async function getNetworkStats() {
  const [totalMessages, publisherCount, totalSubFees] = await Promise.all([
    publicClient.readContract({
      address: ADDRESSES.DataStream,
      abi: DataStreamAbi,
      functionName: "totalMessages",
    }),
    publicClient.readContract({
      address: ADDRESSES.DataRegistry,
      abi: DataRegistryAbi,
      functionName: "publisherCount",
    }),
    publicClient.readContract({
      address: ADDRESSES.DataStream,
      abi: DataStreamAbi,
      functionName: "totalSubscriberFees",
    }),
  ]);

  return {
    publishers: Number(publisherCount),
    messages: Number(totalMessages),
    totalSubscriberFeesUsdc: formatUnits(totalSubFees, USDC_DECIMALS),
  };
}
