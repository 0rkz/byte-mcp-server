import { CONFIG } from "./config.js";
let _cache = null;
export async function fetchCatalog() {
    const res = await fetch(`${CONFIG.gatewayUrl}/feeds`, {
        signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok)
        throw new Error(`catalog fetch failed: ${res.status} ${res.statusText}`);
    const body = (await res.json());
    return body.feeds ?? [];
}
/** Warm the module-level catalog cache at startup. Non-fatal: on network
 *  error the cache stays empty and callers fall back to the canonical URL. */
export async function primeCatalogCache() {
    try {
        _cache = await fetchCatalog();
    }
    catch {
        // non-fatal — server starts without a warm cache
    }
}
export function getCachedCatalog() {
    return _cache ?? [];
}
