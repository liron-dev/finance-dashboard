import type { Etf } from './types';

const TRADING_DAYS = 252;
const MIN_RETURNS = 60;

/** Annualized Sharpe ratio from a daily-returns array.
 *  Sharpe = (mean(R) - rf_daily) / std(R) × √252
 *  rf_daily = annual_rf / 252; we use 4% as a conservative T-bill proxy.
 *  Returns null when the array is too short or std is 0.
 */
export function sharpeFromReturns(rets: number[] | null, annualRf = 0.04): number | null {
  if (!rets || rets.length < MIN_RETURNS) return null;
  const n = rets.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += rets[i];
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = rets[i] - mean;
    varSum += d * d;
  }
  const variance = varSum / (n - 1);
  if (variance <= 0) return null;
  const std = Math.sqrt(variance);
  const rfDaily = annualRf / TRADING_DAYS;
  const sharpeAnnual = ((mean - rfDaily) / std) * Math.sqrt(TRADING_DAYS);
  return sharpeAnnual;
}

/** Convenience wrapper that takes an Etf and returns its Sharpe (or null). */
export function etfSharpe(etf: Etf): number | null {
  return sharpeFromReturns(etf.returns_1y);
}
