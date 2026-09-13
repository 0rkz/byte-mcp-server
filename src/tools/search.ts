import { CONFIG } from "../lib/config.js";

interface PublisherSearchResult {
  address: string;
  topic: string;
  subscribers: number;
  messages: number;
  pricePerKB: string;
}

interface FeedInfo {
  publisher: string;
  topic: string;
  /**
   * DEPRECATED (misnamed): identical to pricePerCall — the same
   * gateway-reported per-call price, not a per-KB rate. Use pricePerCall.
   * Removed next release.
   */
  pricePerKB: string;
  /** Per-call price exactly as the gateway catalog reports it — a
   * dollar-formatted string (examples: "$0.0050", "$0.100"), or "" when the
   * catalog omits a price. Not normalized or converted here. Identical to
   * pricePerKB above — same source value, just named correctly. */
  pricePerCall: string;
  frequency: number;
}

/**
 * Searches publishers via the indexer API, with optional filtering by topic,
 * sort order, and result limit.
 */
export async function searchPublishers(params: {
  query?: string;
  sortBy?: string;
  limit?: number;
}): Promise<PublisherSearchResult[]> {
  const { query, sortBy, limit } = params;

  const url = new URL("/publishers", CONFIG.indexerUrl);
  if (query) url.searchParams.set("topic", query);
  if (sortBy) url.searchParams.set("sort", sortBy);
  if (limit !== undefined) url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      `Indexer API error: ${response.status} ${response.statusText}. ` +
        `Ensure the indexer is running at ${CONFIG.indexerUrl}`
    );
  }

  const data = await response.json();
  return data as PublisherSearchResult[];
}

/**
 * Lists all active data feeds from the x402 gateway catalog with
 * topics, pricing, and update cadence. The gateway is the source of
 * truth for the feed catalog (it owns the per-feed price + expected
 * payload size); the indexer aggregates on-chain events but does not
 * expose `/feeds`.
 */
export async function listFeeds(): Promise<FeedInfo[]> {
  const url = new URL("/feeds", CONFIG.gatewayUrl);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(
      `x402 gateway error: ${response.status} ${response.statusText}. ` +
        `Tried ${CONFIG.gatewayUrl}/feeds`
    );
  }

  const payload = (await response.json()) as {
    feeds?: Array<{
      id?: string;
      publisher?: string;
      endpoint?: string;
      price?: string;
      priceAtomic?: string;
      updateFrequency?: string;
    }>;
  };

  const feeds = payload.feeds ?? [];
  return feeds.map((f) => {
    // Per-call price passed through verbatim from the gateway catalog:
    // `price` is a dollar-formatted string (e.g. "$0.0050"), `priceAtomic`
    // is µUSDC. We do NOT normalize — whichever the catalog supplies is what
    // both fields carry, so the description must not assert a unit. Resolve
    // once so pricePerKB and pricePerCall are always identical.
    const priceValue = f.price ?? f.priceAtomic ?? "";
    return {
      publisher: f.publisher ?? "",
      topic: f.id ?? f.endpoint ?? "",
      pricePerKB: priceValue,
      pricePerCall: priceValue,
      frequency: Number.isFinite(Number(f.updateFrequency))
        ? Number(f.updateFrequency)
        : 0,
    };
  });
}
