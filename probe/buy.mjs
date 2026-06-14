#!/usr/bin/env node
/**
 * probe/buy.mjs — stage 1-3: catalog pull → batch buy → JSONL
 *
 * The "wet" stage. Spends real USDC — run once per probe session and
 * re-use the JSONL for all subsequent analysis (see probe/duck.mjs).
 *
 * Requires:
 *   npm run build       compile src/ → dist/ first
 *   PRIVATE_KEY=0x...   EOA key for x402 payment signing
 *
 * Usage (standalone):
 *   node probe/buy.mjs                     buy all feeds
 *   node probe/buy.mjs --slugs a,b,c       buy named feeds only
 *   node probe/buy.mjs --dry-run           print catalog, no buying
 *   node probe/buy.mjs --out /tmp/probe    custom output directory
 *
 * Imported by probe/pipeline.mjs — export run() for orchestration.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export async function run({ slugs = null, outDir = join(__dirname, 'out'), dryRun = false } = {}) {
  // ── Stage 1: catalog pull ──────────────────────────────────────────────────
  process.stderr.write('[probe:buy] stage 1: pulling catalog…\n');
  const { fetchCatalog } = await import('../dist/lib/catalog.js');
  const catalog = await fetchCatalog();
  process.stderr.write(`[probe:buy] ${catalog.length} feeds\n`);
  catalog.forEach(f =>
    process.stderr.write(`  ${f.id.padEnd(26)} ${f.price.padStart(8)}  ${f.disclaimerCategory}\n`)
  );

  if (dryRun) {
    process.stderr.write('[probe:buy] --dry-run: stopping after catalog pull.\n');
    return null;
  }

  // ── Stage 2: batch buy ─────────────────────────────────────────────────────
  const targetSlugs = slugs ?? catalog.map(f => f.id);
  process.stderr.write(`\n[probe:buy] stage 2: buying ${targetSlugs.length} feed(s)…\n`);

  const { buyData } = await import('../dist/tools/buy.js');
  const CONCURRENCY = 3;
  const records = [];

  for (let i = 0; i < targetSlugs.length; i += CONCURRENCY) {
    const batch   = targetSlugs.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (slug) => {
        const result = await buyData({ feed: slug });
        const tag = 'error' in result
          ? `ERROR ${result.error}`
          : `paid=${result.paid} price=${result.price ?? 'free'} tx=${result.txHash?.slice(0, 10) ?? '—'}`;
        process.stderr.write(`  ${slug.padEnd(26)} ${tag}\n`);
        // Payer is the signing wallet address — redact from probe output.
        const { payer: _payer, ...safe } = result;
        return { slug, ts: new Date().toISOString(), ...safe };
      })
    );
    for (let j = 0; j < settled.length; j++) {
      records.push(
        settled[j].status === 'fulfilled'
          ? settled[j].value
          : { slug: batch[j], ts: new Date().toISOString(), error: String(settled[j].reason) }
      );
    }
  }

  // ── Stage 3: write JSONL ───────────────────────────────────────────────────
  mkdirSync(outDir, { recursive: true });
  const date      = new Date().toISOString().slice(0, 10);
  const jsonlPath = join(outDir, `probe-${date}.jsonl`);
  writeFileSync(jsonlPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  process.stderr.write(`\n[probe:buy] stage 3: ${records.length} records → ${jsonlPath}\n`);

  return { jsonlPath };
}

// ── Standalone mode ────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run(parseArgs()).catch(e => { console.error('[probe:buy] fatal:', e); process.exit(1); });
}
