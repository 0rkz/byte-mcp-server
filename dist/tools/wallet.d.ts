/**
 * Fetches PPB token, USDC, and ETH balances for an address on Arbitrum Sepolia.
 * @param address - Ethereum address to check.
 */
export declare function getTokenBalances(address: string): Promise<{
    ppb: string;
    usdc: string;
    eth: string;
}>;
/**
 * Checks if an address is subscribed to a specific publisher.
 * @param subscriber - Subscriber Ethereum address.
 * @param publisher - Publisher Ethereum address.
 */
export declare function checkSubscription(subscriber: string, publisher: string): Promise<{
    subscribed: boolean;
}>;
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
export declare function listMySubscriptions(subscriber: string, indexerUrl?: string): Promise<{
    publisher: unknown;
    topic: {};
    tier: {} | null;
    status: {} | null;
    pqsComposite: {} | null;
    subscribedAt: unknown;
    messages7d: {};
    messages30d: {};
    spend7dUsdc: string;
    spend30dUsdc: string;
    lastMessageAt: unknown;
}[]>;
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
export declare function getSubscriptionHealth(publisher: string, indexerUrl?: string): Promise<any>;
