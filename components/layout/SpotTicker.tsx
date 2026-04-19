import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { theme } from '@/lib/theme';
import { fetchSpotTicker, SpotData, TickerQuote, TickerSymbol } from '@/lib/queries';
import { formatUsd, formatSignedPct, daysAgo } from '@/lib/format';
import { FRESHNESS } from '@/lib/constants';

type Meta = { label: string; color: string; digits: number };

const META: Record<TickerSymbol, Meta> = {
  GOLD_SPOT: { label: 'Gold', color: theme.yellow, digits: 2 },
  SILVER_SPOT: { label: 'Silver', color: theme.textSecondary, digits: 2 },
  SPX_SPOT: { label: 'S&P 500', color: theme.cyan, digits: 2 },
  NDX_SPOT: { label: 'Nasdaq 100', color: theme.purple, digits: 2 },
  BRENT_SPOT: { label: 'Brent Oil', color: '#FB923C', digits: 2 },
};

export function SpotTicker() {
  const { width } = useWindowDimensions();
  const [data, setData] = useState<SpotData | null>(null);

  useEffect(() => {
    fetchSpotTicker().then(setData).catch(() => setData(null));
  }, []);

  if (!data || !data.quotes.length) return null;
  const latest = data.quotes.map((q) => q.today.date).sort().reverse()[0];
  if (!latest || daysAgo(latest) > FRESHNESS.warnDays) return null;

  const stack = width < theme.breakpoints.md;
  return (
    <View style={[styles.wrap, stack && styles.stack]}>
      <Text style={styles.spotTag}>SPOT</Text>
      {data.quotes.map((q) => (
        <SpotCell key={q.series} quote={q} />
      ))}
    </View>
  );
}

function SpotCell({ quote }: { quote: TickerQuote }) {
  const meta = META[quote.series];
  const today = quote.today.value;
  const prevDay = quote.yesterday?.value;
  const prevYr = quote.yearAgo?.value;
  const daily = prevDay && prevDay > 0 ? ((today - prevDay) / prevDay) * 100 : null;
  const yoy = prevYr && prevYr > 0 ? ((today - prevYr) / prevYr) * 100 : null;
  return (
    <View style={styles.cell}>
      <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
      <Text style={styles.price}>{formatUsd(today, meta.digits)}</Text>
      {daily != null ? <DailyChip pct={daily} /> : null}
      {yoy != null ? <YoYChip pct={yoy} /> : null}
    </View>
  );
}

function DailyChip({ pct }: { pct: number }) {
  const up = pct >= 0;
  const color = up ? theme.green : theme.red;
  return (
    <Text style={[styles.dailyText, { color }]}>
      {up ? '↗' : '↘'}{formatSignedPct(pct, 1)}
    </Text>
  );
}

function YoYChip({ pct }: { pct: number }) {
  const up = pct >= 0;
  const color = up ? theme.green : theme.red;
  const bg = up ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)';
  return (
    <View style={[styles.yoyChip, { backgroundColor: bg }]}>
      <Text style={[styles.yoyLabel, { color }]}>YoY</Text>
      <Text style={[styles.yoyText, { color }]}>{formatSignedPct(pct, 1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    justifyContent: 'center',
    flexWrap: 'wrap',
  } as any,
  stack: { gap: theme.spacing.md, rowGap: 6 } as any,
  spotTag: {
    ...theme.type.label,
    color: theme.textMuted,
    marginRight: 4,
  },
  cell: { flexDirection: 'row', alignItems: 'center', gap: 7 } as any,
  label: { ...theme.type.h3, letterSpacing: 0.2 },
  price: { ...theme.type.h3, color: theme.textPrimary },
  dailyText: { ...theme.type.h3 },
  yoyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  } as any,
  yoyLabel: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.3, opacity: 0.9 },
  yoyText: { ...theme.type.h3 },
});
