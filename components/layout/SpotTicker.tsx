import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '@/lib/theme';
import { fetchSpotTicker, SpotData } from '@/lib/queries';
import { formatUsd, formatSignedPct, daysAgo } from '@/lib/format';
import { FRESHNESS } from '@/lib/constants';

export function SpotTicker() {
  const { width } = useWindowDimensions();
  const [data, setData] = useState<SpotData | null>(null);

  useEffect(() => {
    fetchSpotTicker().then(setData).catch(() => setData(null));
  }, []);

  if (!data) return null;
  const { goldToday, goldPrev, silverToday, silverPrev } = data;
  // Hide entirely if data is very stale
  const latest = goldToday?.date ?? silverToday?.date;
  if (!latest || daysAgo(latest) > FRESHNESS.warnDays) return null;

  const stack = width < theme.breakpoints.sm;
  return (
    <View style={[styles.wrap, stack && styles.stack]}>
      {goldToday ? <SpotCell label="Gold" today={goldToday.value} prev={goldPrev?.value} color={theme.yellow} /> : null}
      {silverToday ? <SpotCell label="Silver" today={silverToday.value} prev={silverPrev?.value} color={theme.textSecondary} /> : null}
    </View>
  );
}

function SpotCell({ label, today, prev, color }: { label: string; today: number; prev?: number; color: string }) {
  const pct = prev && prev > 0 ? ((today - prev) / prev) * 100 : 0;
  const up = pct >= 0;
  const chColor = up ? theme.green : theme.red;
  return (
    <View style={styles.cell}>
      <Text style={[styles.label, { color }]}>{label.toUpperCase()}</Text>
      <Text style={styles.price}>{formatUsd(today, 2)}</Text>
      {prev ? (
        <View style={styles.change}>
          <Feather name={up ? 'arrow-up' : 'arrow-down'} size={12} color={chColor} />
          <Text style={[styles.changeText, { color: chColor }]}>{formatSignedPct(pct, 2)}</Text>
        </View>
      ) : null}
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
  stack: { gap: theme.spacing.md } as any,
  cell: { flexDirection: 'row', alignItems: 'center', gap: 8 } as any,
  label: { ...theme.type.label },
  price: { ...theme.type.h3, color: theme.textPrimary },
  change: { flexDirection: 'row', alignItems: 'center', gap: 2 } as any,
  changeText: { ...theme.type.h3 },
});
