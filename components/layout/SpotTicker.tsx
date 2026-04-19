import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '@/lib/theme';
import { fetchSpotTicker, SpotData, TickerQuote, TickerSymbol } from '@/lib/queries';
import { formatUsd, formatSignedPct, daysAgo } from '@/lib/format';
import { FRESHNESS } from '@/lib/constants';

type Meta = { label: string; color: string; digits: number; prefix?: string };

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
      <Text style={[styles.label, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
      <Text style={styles.price}>{formatUsd(today, meta.digits)}</Text>
      {daily != null ? <DeltaChip pct={daily} /> : null}
      {yoy != null ? <DeltaChip pct={yoy} prefix="YoY" /> : null}
    </View>
  );
}

function DeltaChip({ pct, prefix }: { pct: number; prefix?: string }) {
  const up = pct >= 0;
  const color = up ? theme.green : theme.red;
  const bg = up ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)';
  return (
    <View style={[styles.change, { backgroundColor: bg }]}>
      {prefix ? <Text style={[styles.yoy, { color }]}>{prefix}</Text> : null}
      <Feather name={up ? 'arrow-up-right' : 'arrow-down-right'} size={11} color={color} />
      <Text style={[styles.changeText, { color }]}>{formatSignedPct(pct, 1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
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
  cell: { flexDirection: 'row', alignItems: 'center', gap: 8 } as any,
  label: { ...theme.type.label },
  price: { ...theme.type.h3, color: theme.textPrimary },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  } as any,
  changeText: { ...theme.type.h3 },
  yoy: { ...theme.type.label, marginRight: 2 },
});
