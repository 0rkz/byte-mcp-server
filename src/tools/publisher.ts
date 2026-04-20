import { formatEther, type Address } from "viem";
import {
  publicClient,
  DataRegistryAbi,
  DataStreamAbi,
  SchemaRegistryAbi,
  PQSVerifierAbi,
} from "../lib/contracts.js";
import { ADDRESSES } from "../lib/config.js";

/** Human-readable tier names indexed by on-chain enum value. */
const TIER_NAMES = ["Sandbox", "New", "Established", "Trusted", "Premium", "Elite"];

/** Human-readable status names indexed by on-chain enum value. */
const STATUS_NAMES = ["Inactive", "Active", "Suspended", "Banned"];

/**
 * Fetches detailed on-chain info for a publisher including status, tier,
 * stake, schema config, and PQS (Publisher Quality Score) breakdown.
 * @param address - Publisher Ethereum address.
 */
export async function getPublisher(address: string) {
  const addr = address as Address;

  const [publisher, schema, pqs] = await Promise.all([
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
    publicClient.readContract({
      address: ADDRESSES.PQSVerifier,
      abi: PQSVerifierAbi,
      functionName: "getVerifiedPQS",
      args: [addr],
    }),
  ]);

  return {
    address: addr,
    status: STATUS_NAMES[Number(publisher.status)] || "Unknown",
    tier: TIER_NAMES[Number(publisher.tier)] || "Unknown",
    stake: formatEther(publisher.stake),
    subscribers: Number(publisher.subscriberCount),
    messages: Number(publisher.messageCount),
    revenue: formatEther(publisher.revenue),
    registeredAt: Number(publisher.registeredAt),
    lastActive: Number(publisher.lastActive),
    schema: {
      expectedSize: Number(schema.expectedSize),
      maxSize: Number(schema.maxSize),
      frequency: Number(schema.frequency),
      pricePerKB: formatEther(schema.pricePerKB),
      active: schema.active,
      topicHash: schema.topicHash,
    },
    pqs: {
      overall: Number(pqs.overall),
      freshness: Number(pqs.freshness),
      accuracy: Number(pqs.accuracy),
      availability: Number(pqs.availability),
      completeness: Number(pqs.completeness),
      lastUpdated: Number(pqs.timestamp),
    },
  };
}

/**
 * Fetches network-wide statistics: total publishers, messages,
 * subscriber fees, publishing fees, and total revenue.
 */
export async function getNetworkStats() {
  const [totalMessages, publisherCount, totalSubFees, totalPubFees] =
    await Promise.all([
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
      publicClient.readContract({
        address: ADDRESSES.DataStream,
        abi: DataStreamAbi,
        functionName: "totalPublishingFees",
      }),
    ]);

  return {
    publishers: Number(publisherCount),
    messages: Number(totalMessages),
    totalSubscriberFees: formatEther(totalSubFees),
    totalPublishingFees: formatEther(totalPubFees),
    totalRevenue: formatEther(totalSubFees + totalPubFees),
  };
}
