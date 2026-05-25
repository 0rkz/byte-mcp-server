import { formatEther, formatUnits, type Address } from "viem";
import { publicClient, DataRegistryAbi, Erc20Abi } from "../lib/contracts.js";
import { ADDRESSES, CONFIG, USDC_DECIMALS } from "../lib/config.js";

/**
 * Fetches USDC and ETH balances for an address on Arbitrum Sepolia.
 * USDC is the BYTE Library settlement asset; ETH covers gas.
 * @param address - Ethereum address to check.
 */
export async function getTokenBalances(address: string) {
  const addr = address as Address;

  const [usdc, eth] = await Promise.all([
    publicClient.readContract({
      address: ADDRESSES.USDC,
      abi: Erc20Abi,
      functionName: "balanceOf",
      args: [addr],
    }),
    publicClient.getBalance({ address: addr }),
  ]);

  return {
    usdc: formatUnits(usdc, USDC_DECIMALS),
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
 * metadata, recent activity, spend over 7d/30d windows, and the timestamp the
 * subscription was created.
 *
 * Data source: the BYTE Library indexer's `/subscriptions/{subscriber}`
 * endpoint, which aggregates SubscriberRegistered/SubscriberRemoved events and
 * joins with the publisher table.
 *
 * @param subscriber - Subscriber Ethereum address.
 * @param indexerUrl - Optional override for indexer URL. Defaults to
 *   http://localhost:8080 which is the local indexer; for agents running
 *   remotely, point this at a public indexer.
 */
export async function listMySubscriptions(
  subscriber: string,
  indexerUrl: string = CONFIG.indexerUrl
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
      status: r.status ?? null,
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
  indexerUrl: string = CONFIG.indexerUrl
) {
  const url = `${indexerUrl.replace(/\/$/, "")}/publisher/${publisher.toLowerCase()}/drift`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Indexer returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}
