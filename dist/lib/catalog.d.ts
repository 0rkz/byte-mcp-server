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
}
export declare function fetchCatalog(): Promise<FeedEntry[]>;
/** Warm the module-level catalog cache at startup. Non-fatal: on network
 *  error the cache stays empty and callers fall back to the canonical URL. */
export declare function primeCatalogCache(): Promise<void>;
export declare function getCachedCatalog(): FeedEntry[];
