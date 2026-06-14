#!/usr/bin/env node
/**
 * probe/duck.mjs — stage 4-5: JSONL → DuckDB → Parquet + summary queries
 *
 * The "dry" stage. Re-runnable for free on any existing probe JSONL —
 * no buying, no network calls, no USDC spent.
 *
 * Requires:
 *   npm install @duckdb/node-api   (Parquet + DuckDB)
 *
 * Usage (standalone):
 *   node probe/duck.mjs probe/out/probe-2026-06-12.jsonl
 *   node probe/duck.mjs /tmp/probe/probe-2026-06-12.jsonl
 *
 * Imported by probe/pipeline.mjs — export run() for orchestration.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run(jsonlPath) {
  if (!jsonlPath) throw new Error('jsonlPath is required');

  const parquetPath = jsonlPath.replace(/\.jsonl$/, '.parquet');

  // ── Stage 4: DuckDB ingest → Parquet ──────────────────────────────────────
  process.stderr.write(`\n[probe:duck] stage 4: DuckDB ingest + Parquet export…\n`);
  process.stderr.write(`[probe:duck]   from ${jsonlPath}\n`);
  process.stderr.write(`[probe:duck]   to   ${parquetPath}\n`);

  try {
    const { DuckDBInstance } = await import('@duckdb/node-api');
    const db   = await DuckDBInstance.create(':memory:');
    const conn = await db.connect();

    await conn.run(`CREATE TABLE probe AS SELECT * FROM read_ndjson_auto('${jsonlPath}')`);
    await conn.run(`COPY probe TO '${parquetPath}' (FORMAT PARQUET, COMPRESSION SNAPPY)`);
    process.stderr.write(`[probe:duck] wrote ${parquetPath}\n`);

    // ── Stage 5: summary queries ─────────────────────────────────────────────
    process.stderr.write('\n[probe:duck] stage 5: summary\n');

    const r1 = await conn.query(`
      SELECT
        slug,
        paid,
        price,
        status,
        length(TRY_CAST(data AS VARCHAR)) AS payload_bytes
      FROM probe
      ORDER BY price DESC NULLS LAST
    `);
    const rows = await r1.fetchAllRows();
    process.stdout.write('\n' + ['slug', 'paid', 'price', 'status', 'payload_bytes'].join('\t') + '\n');
    rows.forEach(r => process.stdout.write(Object.values(r).join('\t') + '\n'));

    const r2 = await conn.query(`
      SELECT
        COUNT(*)                                                           AS total,
        COUNT(*) FILTER (WHERE paid = true)                               AS paid_count,
        COUNT(*) FILTER (WHERE error IS NOT NULL)                         AS errors,
        SUM(TRY_CAST(REPLACE(TRY_CAST(price AS VARCHAR), '$', '') AS DOUBLE)) AS total_usdc
      FROM probe
    `);
    const [stats] = await r2.fetchAllRows();
    process.stderr.write(`\n[probe:duck] totals: ${JSON.stringify(stats)}\n`);

    await conn.close();
    await db.close();

    return { parquetPath };
  } catch (e) {
    const notFound = e?.code === 'ERR_MODULE_NOT_FOUND'
      || e?.message?.includes('Cannot find package');
    if (notFound) {
      process.stderr.write('[probe:duck] DuckDB not installed — skipping Parquet/query steps.\n');
      process.stderr.write('[probe:duck] To enable: npm install @duckdb/node-api\n');
      return { parquetPath: null };
    }
    throw e;
  }
}

// ── Standalone mode ────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const jsonlPath = process.argv[2];
  if (!jsonlPath) {
    process.stderr.write('usage: node probe/duck.mjs <path/to/probe-YYYY-MM-DD.jsonl>\n');
    process.exit(1);
  }
  run(jsonlPath).catch(e => { console.error('[probe:duck] fatal:', e); process.exit(1); });
}
