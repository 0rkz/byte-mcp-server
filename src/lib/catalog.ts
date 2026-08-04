import { CONFIG } from "./config.js";

export interface FeedEntry {
  id: string;
  name: string;
  description: string;
  price: string;
  priceAtomic: string;
  disclaimerCategory: string;
  endpoint: string;
  expectedSizeBytes?: number;
  updateFrequency?: string;
  provenance?: string;
  /** HTTP verb(s) this feed accepts — an ARRAY (["GET"], ["POST"], or
   *  ["GET","POST"] for dual-pattern feeds), never a comma-joined string.
   *  Verified directly against the gateway's own feedMethods()
   *  (x402-gateway/src/index.ts) and the live /feeds response before adding
   *  this field, 2026-08-04. Optional because older cached catalog shapes
   *  (or a future gateway response) might omit it; callers must not assume
   *  it is present. */
  method?: ("GET" | "POST")[];
}

interface CatalogResponse {
  feeds?: FeedEntry[];
  [key: string]: unknown;
}

let _cache: FeedEntry[] | null = null;

export async function fetchCatalog(): Promise<FeedEntry[]> {
  const res = await fetch(`${CONFIG.gatewayUrl}/feeds`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as CatalogResponse;
  return body.feeds ?? [];
}

/** Warm the module-level catalog cache at startup. Non-fatal: on network
 *  error the cache stays empty and callers fall back to the canonical URL. */
export async function primeCatalogCache(): Promise<void> {
  try {
    _cache = await fetchCatalog();
  } catch {
    // non-fatal — server starts without a warm cache
  }
}

export function getCachedCatalog(): FeedEntry[] {
  return _cache ?? [];
}
