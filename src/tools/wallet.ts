import { formatEther, type Address } from "viem";
import { publicClient, DataRegistryAbi, PPBTokenAbi } from "../lib/contracts.js";
import { ADDRESSES } from "../lib/config.js";

/**
 * Fetches PPB token, USDC, and ETH balances for an address on Arbitrum Sepolia.
 * @param address - Ethereum address to check.
 */
export async function getTokenBalances(address: string) {
  const addr = address as Address;

  const [ppb, usdc, eth] = await Promise.all([
    publicClient.readContract({
      address: ADDRESSES.PPBToken,
      abi: PPBTokenAbi,
      functionName: "balanceOf",
      args: [addr],
    }),
    publicClient.readContract({
      address: ADDRESSES.MockUSDC as Address,
      abi: PPBTokenAbi, // same ERC20 interface
      functionName: "balanceOf",
      args: [addr],
    }),
    publicClient.getBalance({ address: addr }),
  ]);

  return {
    ppb: formatEther(ppb),
    usdc: formatEther(usdc),
    eth: formatEther(eth),
  };
}

/**
 * Checks if an address is subscribed to a specific publisher.
 * @param subscriber - Subscriber Ethereum address.
 * @param publisher - Publisher Ethereum address.
 */
export async function checkSubscription(subscriber: string, publisher: string) {
  const isSubscribed = await publicClient.readContract({
    address: ADDRESSES.DataRegistry,
    abi: DataRegistryAbi,
    functionName: "isSubscribed",
    args: [subscriber as Address, publisher as Address],
  });

  return { subscribed: isSubscribed };
}

/**
 * Lists all currently-active subscriptions for a given wallet, with publisher
 * metadata, recent activity, spend over 7d/30d windows, PQS scores, and the
 * timestamp the subscription was created.
 *
 * Data source: the Byte indexer's `/subscriptions/{subscriber}` endpoint,
 * which aggregates SubscriberRegistered/SubscriberRemoved events and joins
 * with publisher + pqs_scores tables.
 *
 * @param subscriber - Subscriber Ethereum address.
 * @param indexerUrl - Optional override for indexer URL. Defaults to
 *   http://localhost:8080 which is the local indexer; for agents running
 *   remotely, point this at a public indexer.
 */
export async function listMySubscriptions(
  subscriber: string,
  indexerUrl: string = "http://localhost:8080"
) {
  const url = `${indexerUrl.replace(/\/$/, "")}/subscriptions/${subscriber.toLowerCase()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Indexer returned ${res.status} ${res.statusText}`);
  }
  const rows = (await res.json()) as Array<Record<string, unknown>>;

  // Pretty-format amounts for agent consumption.
  return rows.map((r) => {
    const spend7 = Number(r.spend_7d_micro_usdc ?? 0) / 1_000_000;
    const spend30 = Number(r.spend_30d_micro_usdc ?? 0) / 1_000_000;
    return {
      publisher: r.publisher,
      topic: r.topic || "(unknown)",
      tier: r.tier ?? null,
      status: r.status ?? null,
      pqsComposite: r.composite ?? null, // 0-10000 BPS
      subscribedAt: r.subscribed_at,
      messages7d: r.messages_7d ?? 0,
      messages30d: r.messages_30d ?? 0,
      spend7dUsdc: spend7.toFixed(6),
      spend30dUsdc: spend30.toFixed(6),
      lastMessageAt: r.last_message_at,
    };
  });
}

/**
 * Returns the content-drift signal for a specific publisher — a heuristic
 * assessment of whether their publishing behavior in the last 7 days matches
 * their 23-day baseline (days 8-30). Useful for subscribers to notice when
 * a publisher's content or cadence has shifted.
 *
 * Signal values:
 *   "stable"      — publishing consistently with the baseline
 *   "moderate"    — mild drift (cadence ±20-50% or 24-48h silence)
 *   "significant" — large drift (cadence ±50%+ or >48h silence)
 *   "unknown"     — insufficient baseline (new publisher, <30 msgs in days 8-30)
 *
 * @param publisher - Publisher Ethereum address.
 * @param indexerUrl - Optional indexer URL override.
 */
export async function getSubscriptionHealth(
  publisher: string,
  indexerUrl: string = "http://localhost:8080"
) {
  const url = `${indexerUrl.replace(/\/$/, "")}/publisher/${publisher.toLowerCase()}/drift`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Indexer returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}
