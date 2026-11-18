// token-radar-3 — "Expected-Value Radar" (round 3 entry for token-radar-01).
//
// The question: which pre-token protocol is worth farming next, and what do I
// do about it? The answer is an EXPECTED VALUE, not a TVL ranking:
//
//   implied_value_usd = TVL x peerMultiple x momentum x breadth x launchProb
//
// Every factor is derived from the sealed snapshot's own figures — nothing is
// a hardcoded list of names:
//
//   peerMultiple  Median mcap/TVL of the token-bearing protocols in the same
//                 category (at least 3 peers, else the global median 0.205).
//                 Capped to [0.02, 2.00]. A protocol is worth what its
//                 already-launched cousins are worth per dollar of TVL.
//   momentum      1 + clamp(change_7d, -30, +30) / 100. Growing TVL means a
//                 live protocol; shrinking TVL discounts the launch.
//   breadth       1 + 0.02 x min(chains - 1, 10). More chains = more surface
//                 for a launch to matter. Capped at 1.20.
//   launchProb    maturity x staleness x categoryPrior, clamped to [0.005, 0.90]
//     maturity    ageDays / (ageDays + 180): a launch needs time to mature,
//                 but the curve saturates — 6 months in, it is mostly priced.
//     staleness   exp(-max(0, ageDays - 900) / 2000): tracked for 2.5+ years
//                 with no token recorded, the launch odds quietly fade.
//     categoryPrior  0.01 for CEX / Bridge / Canonical Bridge / Liquid
//                 Staking / Liquid Restaking / Restaked BTC — those are
//                 already a product of a token that trades, not a launch
//                 waiting to happen (the watchlist rule's own exclusion,
//                 applied as a prior instead of a filter); 0.35 more when
//                 the name carries a version marker or a wrapped/staked
//                 word; 1.00 otherwise.
//
// The board covers ALL 342 protocols in the snapshot that record no token
// (gecko_id and symbol both null) — the 40-protocol watchlist is the floor,
// never the ceiling. Rows are ranked by implied value, rank 1 first.
//
// Each row carries a concrete farm plan: five steps naming the protocol, its
// main chain, amounts in dollars and a cadence in weeks, built from the
// protocol's own category — never a slogan.
//
// Deterministic: no clock, no randomness, no network. Same snapshot bytes in,
// same board.json / dossier.json bytes out.
//
// Usage: MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
//   --input   snapshot path (default /input/snapshot.json)
//   --output  output directory (default $MAKEFUN_OUTPUT_DIR, else ./output)

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

interface Scored {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  listed_at: string | null;
  peer_multiple: number;
  peer_count: number;
  momentum: number;
  breadth: number;
  launch_prob: number;
  maturity: number;
  staleness: number;
  category_prior: number;
  implied_value_usd: number;
  verdict: string;
  weekly_minutes: number;
  farm_steps: string[];
}

// Categories whose record is already a product of a token that trades: the
// watchlist rule excludes them, and this model prices them down instead of
// deleting them, so the board still shows them — honestly, at the bottom.
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

// Rough weekly effort per category, minutes. Shown on the dashboard so a
// reader can compare value against time, not just against TVL.
const WEEKLY_MINUTES: Record<string, number> = {
  Dexs: 45,
  Lending: 60,
  Yield: 30,
  'Yield Aggregator': 30,
  RWA: 45,
  CDP: 60,
  Derivatives: 75,
  'Risk Curators': 30,
  'Onchain Capital Allocator': 30,
  'Liquid Staking': 20,
  Bridge: 30,
  'Canonical Bridge': 30,
  'Cross Chain Bridge': 30,
  CEX: 60,
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)]!;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function ageDays(listedAt: string | null, asOf: Date): number {
  if (!listedAt) return 365; // unreported: assume a year of runway, neither new nor stale
  const days = (asOf.getTime() - new Date(listedAt + 'T00:00:00Z').getTime()) / 86400000;
  return Math.max(0, Math.round(days));
}

function mainChain(p: Protocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'Ethereum';
}

// The core farming action for a category, with amounts and cadence. Every
// step names the protocol and its main chain so the plan is concrete.
function coreAction(p: Protocol): string {
  const name = p.name;
  const chain = mainChain(p);
  switch (p.category) {
    case 'Dexs':
      return `Swap $20-$50 through ${name} on ${chain} and add $25-$50 of liquidity to its largest pool; leave the position open for at least two weeks.`;
    case 'Lending':
      return `Supply $50-$100 of collateral on ${name} on ${chain} and borrow a small amount against it; repay part of the loan after one week.`;
    case 'Yield':
    case 'Yield Aggregator':
      return `Deposit $50-$100 into ${name}'s highest-TVL vault on ${chain} and leave it compounding for at least one month.`;
    case 'RWA':
      return `Buy or mint $50-$100 of ${name}'s tokenised asset on ${chain} and hold it; finish any identity or onboarding step the protocol asks for.`;
    case 'CDP':
      return `Lock $50-$100 of collateral in ${name} on ${chain} and mint its stablecoin; keep your collateral ratio comfortably above liquidation.`;
    case 'Derivatives':
      return `Open a small $20-$50 position on ${name} on ${chain}, close it after a few days, then open a second one the following week.`;
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
      return `Deposit $50-$100 into a ${name} vault on ${chain} and pick a curator allocation; leave the deposit in place for at least one month.`;
    case 'Liquid Staking':
    case 'Restaking':
    case 'Liquid Restaking':
      return `Stake $50-$100 of the native asset through ${name} on ${chain} and hold the receipt token; use it in one extra DeFi position.`;
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge':
      return `Bridge $50-$100 between chains through ${name} on ${chain} once a week for a month; vary the route and the amount slightly each time.`;
    case 'CEX':
      return `Create an account on ${name}, finish verification, and trade $50-$100 of spot volume over two weeks.`;
    default:
      return `Use ${name}'s main feature on ${chain} with $50-$100 at least once a week for a month; vary the amount and the action each time.`;
  }
}

function farmSteps(p: Protocol): string[] {
  const name = p.name;
  const chain = mainChain(p);
  return [
    `Set up a fresh farming wallet and fund it with about $50-$100 on ${chain} for gas and positions; keep this wallet separate from your main holdings.`,
    coreAction(p),
    `Repeat the core action at least once a week for 4-8 weeks; protocols reward sustained activity over time, not a single visit, so spread it out.`,
    `Try a second, different feature of ${name} — another pool, market or vault — so the wallet does not look like a one-trick bot.`,
    `Check your position and ${name}'s announcements once a week; save your transaction hashes and a screenshot of your balance as proof of activity.`,
  ];
}

function verdictFor(prior: number, prob: number): string {
  if (prior < 1) return 'PASS';
  if (prob >= 0.75) return 'FARM NOW';
  if (prob >= 0.6) return 'FARM';
  if (prob >= 0.35) return 'WATCH';
  return 'PASS';
}

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '/input/snapshot.json';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? 'output';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) input = argv[++i]!;
    else if (argv[i] === '--output' && argv[i + 1]) output = argv[++i]!;
  }
  return { input, output };
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snap: Snapshot = JSON.parse(readFileSync(input, 'utf8'));
  const asOf = new Date(snap.as_of + 'T00:00:00Z');
  const watch = new Set(snap.watchlist);

  // Peer multiples: for every category, the median mcap/TVL of the
  // token-bearing protocols in it. Computed from the snapshot, never typed in.
  const peersByCategory = new Map<string, number[]>();
  for (const p of snap.protocols) {
    if ((p.gecko_id || p.symbol) && p.mcap_usd && p.tvl_usd > 0) {
      const key = p.category ?? '(no category)';
      if (!peersByCategory.has(key)) peersByCategory.set(key, []);
      peersByCategory.get(key)!.push(p.mcap_usd / p.tvl_usd);
    }
  }
  const globalMultiple = median(
    snap.protocols
      .filter((p) => (p.gecko_id || p.symbol) && p.mcap_usd && p.tvl_usd > 0)
      .map((p) => p.mcap_usd! / p.tvl_usd),
  );
  const categoryMedians: Record<string, number> = {};
  for (const [cat, ratios] of [...peersByCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (ratios.length >= 3) categoryMedians[cat] = Math.round(median(ratios) * 10000) / 10000;
  }

  // Every protocol that records no token is a candidate — the watchlist is
  // the floor, never the ceiling.
  const candidates = snap.protocols.filter((p) => !p.gecko_id && !p.symbol);

  const scored: Scored[] = candidates.map((p) => {
    const ratios = peersByCategory.get(p.category ?? '(no category)') ?? [];
    const peerMultiple =
      ratios.length >= 3
        ? clamp(median(ratios), 0.02, 2)
        : clamp(globalMultiple, 0.02, 2);
    const momentum = 1 + clamp(p.change_7d ?? 0, -30, 30) / 100;
    const age = ageDays(p.listed_at, asOf);
    const maturity = age / (age + 180);
    const staleness = Math.exp(-Math.max(0, age - 900) / 2000);
    const breadth = 1 + 0.02 * Math.min(p.chains.length - 1, 10);
    let prior = EXCLUDED_CATEGORIES.has(p.category ?? '') ? 0.01 : 1;
    if (VERSION_MARKER.test(p.name) || WRAPPED_WORD.test(p.name)) prior *= 0.35;
    const launchProb = clamp(maturity * staleness * prior, 0.005, 0.9);
    const implied = Math.max(
      1,
      Math.round(p.tvl_usd * peerMultiple * momentum * breadth * launchProb),
    );
    return {
      slug: p.slug,
      name: p.name,
      category: p.category ?? '(no category)',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      listed_at: p.listed_at,
      peer_multiple: Math.round(peerMultiple * 10000) / 10000,
      peer_count: ratios.length,
      momentum: Math.round(momentum * 10000) / 10000,
      breadth: Math.round(breadth * 10000) / 10000,
      launch_prob: Math.round(launchProb * 10000) / 10000,
      maturity: Math.round(maturity * 10000) / 10000,
      staleness: Math.round(staleness * 10000) / 10000,
      category_prior: prior,
      implied_value_usd: implied,
      verdict: verdictFor(prior, launchProb),
      weekly_minutes: WEEKLY_MINUTES[p.category ?? ''] ?? 45,
      farm_steps: farmSteps(p),
    };
  });

  // Rank by implied value, highest first. Ties (none expected on whole
  // dollars, but be safe) break on TVL, then slug, so the order is total.
  scored.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.tvl_usd - a.tvl_usd ||
      (a.slug < b.slug ? -1 : 1),
  );

  const rows = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.slug,
    name: s.name,
    category: s.category,
    chains: s.chains,
    tvl_usd: s.tvl_usd,
    change_7d: s.change_7d,
    age_days: s.age_days,
    listed_at: s.listed_at,
    peer_multiple: s.peer_multiple,
    peer_count: s.peer_count,
    momentum: s.momentum,
    breadth: s.breadth,
    launch_prob: s.launch_prob,
    maturity: s.maturity,
    staleness: s.staleness,
    category_prior: s.category_prior,
    implied_value_usd: s.implied_value_usd,
    verdict: s.verdict,
    weekly_minutes: s.weekly_minutes,
    farm_steps: s.farm_steps,
  }));

  const totalImplied = rows.reduce((n, r) => n + r.implied_value_usd, 0);
  const board = {
    title: 'Expected-Value Radar — which pre-token protocol is worth farming next',
    as_of: snap.as_of,
    source: snap.source,
    floor_usd: snap.floor_usd,
    watchlist: snap.watchlist,
    watchlist_count: snap.watchlist.length,
    watchlist_covered: rows.filter((r) => watch.has(r.slug)).length,
    total_implied_value_usd: totalImplied,
    model: {
      formula: 'implied_value_usd = tvl_usd x peer_multiple x momentum x breadth x launch_prob',
      peer_multiple:
        'Median mcap/TVL of token-bearing protocols in the same category (min 3 peers, else the global median); capped to [0.02, 2.00].',
      momentum: '1 + clamp(change_7d, -30, +30) / 100; null change counts as 0.',
      breadth: '1 + 0.02 x min(chains - 1, 10), capped at 1.20.',
      launch_prob:
        'clamp(maturity x staleness x category_prior, 0.005, 0.90); maturity = age_days / (age_days + 180); staleness = exp(-max(0, age_days - 900) / 2000); category_prior = 0.01 for CEX / Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking / Restaked BTC, x0.35 for a version marker or wrapped/staked word in the name, else 1.',
      global_median_mcap_tvl: Math.round(globalMultiple * 10000) / 10000,
      category_medians: categoryMedians,
      excluded_categories: [...EXCLUDED_CATEGORIES].sort(),
      verdicts:
        'FARM NOW: launch_prob >= 0.75. FARM: >= 0.60. WATCH: >= 0.35. PASS: below that, or a protocol that is already a product of a token that trades.',
      note: 'A protocol records no token when both gecko_id and symbol are null in the snapshot; that is the record, never proof it has none.',
    },
    rows,
  };

  const outDir = resolve(output);
  const botRoot = dirname(fileURLToPath(import.meta.url));
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });

  writeFileSync(join(outDir, 'board.json'), JSON.stringify(board, null, 2) + '\n', 'utf8');
  cpSync(join(botRoot, 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
  const shotsDir = join(botRoot, 'screenshots');
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
  }
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const farmNow = rows.filter((r) => r.verdict === 'FARM NOW').length;
  console.log(`rows=${rows.length} watchlist_covered=${board.watchlist_covered}/${snap.watchlist.length}`);
  console.log(`rank1=${rows[0]!.slug} implied=${rows[0]!.implied_value_usd} total_implied=${totalImplied} farm_now=${farmNow}`);
  console.log(`wrote ${outDir}/board.json + dashboard/ + screenshots/ + dossier.json`);
}

main();
