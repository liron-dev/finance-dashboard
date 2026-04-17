export const formatBigNum = (n: number, digits = 1): string => {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(digits)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  return n.toFixed(digits);
};

export const formatCurrency = (n: number, currency = '$'): string => `${currency}${formatBigNum(n)}`;

export const formatUsd = (n: number, digits = 2): string =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const formatPct = (n: number, digits = 1): string => `${n >= 0 ? '' : ''}${n.toFixed(digits)}%`;

export const formatSignedPct = (n: number, digits = 1): string =>
  `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;

export const formatBps = (pct: number): string => `${Math.round(pct * 100)} bps`;

export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatMonth = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short' });
};

export const timeAgoDays = (iso: string): string => {
  const diff = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (diff < 1) return 'today';
  if (diff < 2) return 'yesterday';
  return `${Math.round(diff)}d ago`;
};

export const daysAgo = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export const isoAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
