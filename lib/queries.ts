import { supabase } from './supabase';
import { isoAgo } from './format';
import type {
  ComexRow,
  CotPerfRow,
  CotRow,
  CreditManager,
  MacroRow,
  ManagerHistRow,
  Stock,
} from './types';

export type HomeData = {
  goldCot: CotRow | null;
  hySpread: MacroRow | null;
  stocks: Stock[];
  latestDate: string | null;
};

export async function fetchHomeSnapshot(): Promise<HomeData> {
  const [cotRes, hyRes, stocksRes] = await Promise.all([
    supabase
      .from('cot_positioning')
      .select('*')
      .eq('metal', 'gold')
      .not('cot_index', 'is', null)
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('macro_indicators')
      .select('*')
      .eq('series_id', 'BAMLH0A0HYM2')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('stocks')
      .select('ticker, name, sector, price, gross_margin, roic, fcf_margin, int_coverage, pe_ratio, updated_at')
      .gt('price', 0),
  ]);

  const dates = [
    cotRes.data?.report_date,
    hyRes.data?.date,
    stocksRes.data?.[0]?.updated_at,
  ].filter(Boolean) as string[];
  const latestDate = dates.sort().reverse()[0] ?? null;

  return {
    goldCot: (cotRes.data as CotRow) ?? null,
    hySpread: (hyRes.data as MacroRow) ?? null,
    stocks: (stocksRes.data as Stock[]) ?? [],
    latestDate,
  };
}

export type MetalsData = {
  cotLatest: CotRow[];
  cotPerf: CotPerfRow[];
  comex: ComexRow[];
  spots: MacroRow[];
};

export async function fetchMetals(): Promise<MetalsData> {
  const since = isoAgo(400);
  const [cotRes, perfRes, comexRes, spotRes] = await Promise.all([
    supabase
      .from('cot_positioning')
      .select('*')
      .not('cot_index', 'is', null)
      .order('report_date', { ascending: false })
      .limit(200),
    supabase.from('cot_performance').select('*'),
    supabase
      .from('comex_inventory')
      .select('*')
      .gte('date', since)
      .order('date', { ascending: true }),
    supabase
      .from('macro_indicators')
      .select('*')
      .in('series_id', ['GOLD_SPOT', 'SILVER_SPOT'])
      .gte('date', since)
      .order('date', { ascending: true }),
  ]);

  // Pick latest row per metal
  const latestByMetal = new Map<string, CotRow>();
  for (const r of (cotRes.data as CotRow[]) ?? []) {
    if (!latestByMetal.has(r.metal)) latestByMetal.set(r.metal, r);
  }

  return {
    cotLatest: Array.from(latestByMetal.values()),
    cotPerf: (perfRes.data as CotPerfRow[]) ?? [],
    comex: (comexRes.data as ComexRow[]) ?? [],
    spots: (spotRes.data as MacroRow[]) ?? [],
  };
}

export async function fetchStocks(): Promise<Stock[]> {
  const { data } = await supabase
    .from('stocks')
    .select('ticker, name, sector, price, gross_margin, roic, fcf_margin, int_coverage, pe_ratio, updated_at')
    .gt('price', 0)
    .order('ticker', { ascending: true });
  return (data as Stock[]) ?? [];
}

export type CreditData = {
  m2: MacroRow[];
  dff: MacroRow | null;
  curve: MacroRow | null;
  hy: MacroRow | null;
  bbb: MacroRow | null;
  pce: MacroRow[];
  payems: MacroRow[];
  gold: MacroRow | null;
  silver: MacroRow | null;
  managers: CreditManager[];
  managerHist: ManagerHistRow[];
};

export async function fetchCredit(): Promise<CreditData> {
  const [m2Res, dailyRes, pceRes, payRes, spotRes, mgrRes, histRes] = await Promise.all([
    supabase
      .from('macro_indicators')
      .select('*')
      .eq('series_id', 'M2SL')
      .order('date', { ascending: false })
      .limit(24),
    supabase
      .from('macro_indicators')
      .select('*')
      .in('series_id', ['DFF', 'T10Y2Y', 'BAMLH0A0HYM2', 'BAMLC0A4CBBB'])
      .order('date', { ascending: false })
      .limit(40),
    supabase
      .from('macro_indicators')
      .select('*')
      .eq('series_id', 'PCEPI')
      .order('date', { ascending: false })
      .limit(13),
    supabase
      .from('macro_indicators')
      .select('*')
      .eq('series_id', 'PAYEMS')
      .order('date', { ascending: false })
      .limit(2),
    supabase
      .from('macro_indicators')
      .select('*')
      .in('series_id', ['GOLD_SPOT', 'SILVER_SPOT'])
      .order('date', { ascending: false })
      .limit(4),
    supabase.from('credit_managers').select('*'),
    supabase.from('credit_manager_history').select('*').order('date', { ascending: true }),
  ]);

  const daily = (dailyRes.data as MacroRow[]) ?? [];
  const firstOf = (id: string) => daily.find((r) => r.series_id === id) ?? null;
  const spots = (spotRes.data as MacroRow[]) ?? [];
  const firstSpot = (id: string) => spots.find((r) => r.series_id === id) ?? null;

  return {
    m2: ((m2Res.data as MacroRow[]) ?? []).slice().reverse(),
    dff: firstOf('DFF'),
    curve: firstOf('T10Y2Y'),
    hy: firstOf('BAMLH0A0HYM2'),
    bbb: firstOf('BAMLC0A4CBBB'),
    pce: ((pceRes.data as MacroRow[]) ?? []).slice().reverse(),
    payems: ((payRes.data as MacroRow[]) ?? []).slice().reverse(),
    gold: firstSpot('GOLD_SPOT'),
    silver: firstSpot('SILVER_SPOT'),
    managers: (mgrRes.data as CreditManager[]) ?? [],
    managerHist: (histRes.data as ManagerHistRow[]) ?? [],
  };
}

export type TickerSymbol = 'GOLD_SPOT' | 'SILVER_SPOT' | 'SPX_SPOT' | 'NDX_SPOT' | 'BRENT_SPOT';

export type TickerQuote = {
  series: TickerSymbol;
  today: MacroRow;
  yearAgo: MacroRow | null;
};

export type SpotData = {
  quotes: TickerQuote[];
};

const TICKER_ORDER: TickerSymbol[] = [
  'GOLD_SPOT',
  'SILVER_SPOT',
  'SPX_SPOT',
  'NDX_SPOT',
  'BRENT_SPOT',
];

export async function fetchSpotTicker(): Promise<SpotData> {
  // Pull ~400 days of history for each symbol so we can reliably find
  // a trading day roughly 365 days prior for the YoY change.
  const since = isoAgo(400);
  const { data } = await supabase
    .from('macro_indicators')
    .select('*')
    .in('series_id', TICKER_ORDER)
    .gte('date', since)
    .order('date', { ascending: false });
  const rows = (data as MacroRow[]) ?? [];

  const quotes: TickerQuote[] = [];
  for (const sym of TICKER_ORDER) {
    const series = rows.filter((r) => r.series_id === sym);
    if (!series.length) continue;
    const today = series[0];
    // Find the row closest to 365 days before `today`
    const target = new Date(today.date);
    target.setDate(target.getDate() - 365);
    const targetMs = target.getTime();
    let yearAgo: MacroRow | null = null;
    let bestDiff = Infinity;
    for (const r of series) {
      const diff = Math.abs(new Date(r.date).getTime() - targetMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        yearAgo = r;
      }
    }
    // Accept only if within 14 days of the exact 1-year mark
    if (yearAgo && bestDiff > 14 * 86400000) yearAgo = null;
    quotes.push({ series: sym, today, yearAgo });
  }
  return { quotes };
}
