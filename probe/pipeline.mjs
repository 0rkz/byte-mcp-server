#!/usr/bin/env node
/**
 * probe/pipeline.mjs — full probe pipeline: buy → duck
 *
 * Chains buy.mjs (wet: catalog + purchase + JSONL) and duck.mjs
 * (dry: DuckDB + Parquet + queries). To re-run analysis on existing
 * data without spending USDC, run duck.mjs directly:
 *
 *   node probe/duck.mjs probe/out/probe-YYYY-MM-DD.jsonl
 *
 * Requires: npm run build, PRIVATE_KEY, optionally @duckdb/node-api.
 *
 * Usage:
 *   node probe/pipeline.mjs                   full run (all feeds)
 *   node probe/pipeline.mjs --slugs a,b,c     full run (named feeds)
 *   node probe/pipeline.mjs --dry-run         catalog pull only
 *   node probe/pipeline.mjs --out /tmp/probe  custom output directory
 */

import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv = process.argv.slice(2)) {
  const dryRun  = argv.includes('--dry-run');
  const slugArg = argv.find(a => a.startsWith('--slugs='))?.slice('--slugs='.length)
    ?? (argv.indexOf('--slugs') >= 0 ? argv[argv.indexOf('--slugs') + 1] : null);
  const outArg  = argv.find(a => a.startsWith('--out='))?.slice('--out='.length)
    ?? (argv.indexOf('--out')   >= 0 ? argv[argv.indexOf('--out')   + 1] : null);
  return {
    dryRun,
    slugs: slugArg ? slugArg.split(',').map(s => s.trim()) : null,
    outDir: outArg ?? join(__dirname, 'out'),
  };
}

const opts = parseArgs();

const { run: buy } = await import('./buy.mjs');
const { run: duck } = await import('./duck.mjs');

const buyResult = await buy(opts);
if (buyResult?.jsonlPath) {
  await duck(buyResult.jsonlPath);
}

process.stderr.write('\n[probe] done.\n');
