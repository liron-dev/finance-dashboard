import type { Etf, EtfMatch, Stock } from './types';

const MAX_LEN = 252;
const MIN_OVERLAP = 60;

/** Build market-cap-weighted synthetic portfolio returns from filtered stocks.
 *  Length is the shortest non-empty stock returns_1y up to MAX_LEN. */
export function buildSyntheticReturns(filtered: Stock[]): number[] | null {
  const usable = filtered.filter(
    (s) =>
      s.market_cap != null &&
      s.market_cap > 0 &&
      Array.isArray(s.returns_1y) &&
      s.returns_1y.length >= MIN_OVERLAP,
  );
  if (usable.length === 0) return null;
  const totalCap = usable.reduce((sum, s) => sum + (s.market_cap ?? 0), 0);
  if (totalCap <= 0) return null;
  const len = Math.min(...usable.map((s) => (s.returns_1y as number[]).length), MAX_LEN);
  const out = new Array<number>(len).fill(0);
  for (const s of usable) {
    const w = (s.market_cap as number) / totalCap;
    const arr = (s.returns_1y as number[]).slice(-len);
    for (let t = 0; t < len; t++) out[t] += w * arr[t];
  }
  return out;
}

/** Pearson r and r² over the tail-aligned overlap of `a` and `b`. */
export function correlation(a: number[], b: number[]): { r: number; r2: number; n: number } {
  const n = Math.min(a.length, b.length);
  if (n < MIN_OVERLAP) return { r: 0, r2: 0, n };
  const ai = a.slice(-n);
  const bi = b.slice(-n);
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += ai[i];
    sb += bi[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = ai[i] - ma;
    const xb = bi[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return { r: 0, r2: 0, n };
  const r = num / Math.sqrt(da * db);
  return { r, r2: r * r, n };
}

/** Score every ETF against the synthetic portfolio, return top N matches.
 *  Inverse-correlated ETFs (r < 0) collapse to fitPct = 0 — they don't
 *  "behave like" the portfolio even if R² is high. */
export function matchEtfs(
  filtered: Stock[],
  etfs: Etf[],
  topN: number = 10,
): EtfMatch[] {
  const synth = buildSyntheticReturns(filtered);
  if (!synth) return [];
  const scored: EtfMatch[] = [];
  for (const etf of etfs) {
    if (!Array.isArray(etf.returns_1y) || etf.returns_1y.length < MIN_OVERLAP) continue;
    const { r, r2 } = correlation(synth, etf.returns_1y);
    const fitPct = r > 0 ? Math.min(100, r2 * 100) : 0;
    scored.push({ etf, fitPct: Math.round(fitPct * 10) / 10 });
  }
  scored.sort((x, y) => y.fitPct - x.fitPct);
  return scored.slice(0, topN);
}

export const MATCHING = { MIN_OVERLAP, MAX_LEN };
