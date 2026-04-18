export const OZ_PER_CONTRACT = { gold: 100, silver: 5000 } as const;

export const FRESHNESS = { freshDays: 2, warnDays: 7 } as const;

export const GOAT_URL = 'https://goatacademy.org';

export const CREDIT_MANAGER_TICKERS = ['APO', 'KKR', 'BX', 'ARES', 'CG', 'OWL'];

export const CRISIS_META = {
  HY: { label: 'HY Spread', series: 'BAMLH0A0HYM2', unit: 'bps', info: 'Junk-bond yield premium over Treasuries. Rises in credit stress.' },
  FED: { label: 'Fed Funds', series: 'DFF', unit: '%', info: 'Overnight policy rate. Higher = tighter money.' },
  CURVE: { label: 'Yield Curve', series: 'T10Y2Y', unit: '%', info: '10yr minus 2yr Treasury yield. Negative = recession signal.' },
  PAYROLLS: { label: 'Payrolls MoM', series: 'PAYEMS', unit: 'K', info: 'Monthly US nonfarm jobs change. Negative = contraction.' },
  PCE: { label: 'PCE YoY', series: 'PCEPI', unit: '%', info: "Fed's preferred inflation gauge. 2% is the target." },
  BBB: { label: 'BBB Spread', series: 'BAMLC0A4CBBB', unit: 'bps', info: 'Investment-grade credit premium. Rises before recessions.' },
} as const;

export const COT_PERF_BUCKETS = ['0-20', '21-40', '41-60', '61-80', '81-100'] as const;
