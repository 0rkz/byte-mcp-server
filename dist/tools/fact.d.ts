/**
 * byte_query_fact — query a Byte Protocol fact-oracle publisher for a
 * verified factual answer with citations.
 *
 * Flow:
 *   1. Search indexer for publishers with topic="fact-oracle" + minPQS filter
 *   2. Parse each publisher's DataRegistry.metadata to find request_endpoint
 *   3. POST {question, subscriber_address, max_byte_cost} → publisher HTTP
 *   4. Receive 202 ACK with {request_id, est_eta_ms}
 *   5. Watch DataStream.BroadcastStreamed events filtered by publisher
 *   6. For each matching event, fetch payload from off-chain archive
 *   7. Match payload.request_id to our request_id → return answer + citations
 *
 * Architecture per FACT_ORACLE_PROTOTYPE_DESIGN.md §6, decisions per
 * FACT_ORACLE_RESEARCH_2026-05-14.md §7. Tool name locked: byte_query_fact.
 */
interface QueryFactParams {
    question: string;
    subscriber_address: string;
    max_byte_cost?: number;
    topic_filter?: string;
    min_publisher_pqs?: number;
    max_response_latency_ms?: number;
}
interface FactResult {
    answer: string;
    citations: Array<{
        url: string;
        title?: string;
        fetched_at?: number;
        extracted?: string;
        confidence?: number;
    }>;
    publisher_address: string;
    publisher_pqs: number;
    confidence: number;
    request_id: string;
    payload_hash: string;
    response_size_bytes: number;
    publisher_tx_or_status: string;
    elapsed_ms: number;
}
interface FactError {
    error: string;
    publishers_tried?: string[];
    attempted?: number;
}
export declare function queryFact(params: QueryFactParams): Promise<FactResult | FactError>;
export {};
