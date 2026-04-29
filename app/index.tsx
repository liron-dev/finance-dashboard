import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Link } from 'expo-router';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/primitives/Card';
import { Skeleton, SkeletonCard } from '@/components/primitives/Skeleton';
import { ErrorCard } from '@/components/primitives/ErrorCard';
import { Badge } from '@/components/primitives/Badge';
import { FreshnessBadge } from '@/components/primitives/FreshnessBadge';
import { fetchHomeSnapshot, HomeData } from '@/lib/queries';
import { creditZone, theme, zoneColor, cotLabel } from '@/lib/theme';
import { applyFilter, PRESETS } from '@/lib/filters';
import { formatBps, timeAgoDays } from '@/lib/format';

export default function Home() {
  const { width } = useWindowDimensions();
  const [data, setData] = useState<HomeData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    fetchHomeSnapshot()
      .then(setData)
      .catch((e) => setErr(String(e?.message ?? e)));
  };
  useEffect(load, []);

  // 4 snapshot cards: 1 col on mobile, 2 on tablet, 4 on desktop.
  const cols = width < theme.breakpoints.sm ? 1 : width < theme.breakpoints.lg ? 2 : 4;
  const cardWidth = `${100 / cols - 2}%` as any;

  const goldCotVal = data?.goldCot?.cot_index ?? null;
  const hyBps = data?.hySpread ? data.hySpread.value * 100 : null;
  const hqCount = data ? applyFilter(data.stocks, PRESETS.HQ, 'HQ').length : null;
  const etfHqCount = data?.etfHqCount ?? null;
  const etfTotal = data?.etfTotal ?? null;

  return (
    <PageShell>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.wordmark}>finance-dashboard</Text>
        <Text style={styles.tagline}>Smart-money signals from public data.</Text>
        <Text style={styles.sub}>
          COT positioning, COMEX inventory, FRED macro, and S&P 500 fundamentals — updated daily.
        </Text>
        {data?.latestDate ? (
          <View style={{ marginTop: theme.spacing.md, alignItems: 'center' }}>
            <FreshnessBadge date={data.latestDate} prefix="Updated" />
          </View>
        ) : null}
      </View>

      {/* Snapshot tiles */}
      {err ? (
        <ErrorCard label="snapshot" message={err} onRetry={load} />
      ) : !data ? (
        <View style={[styles.grid, { gap: theme.spacing.md }]}>
          <View style={{ width: cardWidth }}><SkeletonCard /></View>
          <View style={{ width: cardWidth }}><SkeletonCard /></View>
          <View style={{ width: cardWidth }}><SkeletonCard /></View>
          <View style={{ width: cardWidth }}><SkeletonCard /></View>
        </View>
      ) : (
        <View style={[styles.grid, { gap: theme.spacing.md }]}>
          <Link href="/metals" style={{ width: cardWidth, textDecorationLine: 'none' } as any}>
            <Card title="Metals" subtitle="COT smart-money meter">
              {goldCotVal != null ? (
                <View>
                  <Text style={[styles.bigNum, { color: zoneColor(creditZone.cotIndex(goldCotVal)) }]}>
                    {goldCotVal.toFixed(1)}
                  </Text>
                  <Text style={styles.bigLabel}>Gold COT Index</Text>
                  <View style={{ marginTop: 8 }}>
                    <Badge text={cotLabel(goldCotVal)} variant={creditZone.cotIndex(goldCotVal)} />
                  </View>
                </View>
              ) : (
                <Text style={styles.empty}>No data</Text>
              )}
            </Card>
          </Link>

          <Link href="/stocks" style={{ width: cardWidth, textDecorationLine: 'none' } as any}>
            <Card title="Stocks" subtitle="Quality filter (S&P 500)">
              {hqCount != null ? (
                <View>
                  <Text style={[styles.bigNum, { color: theme.yellow }]}>{hqCount}</Text>
                  <Text style={styles.bigLabel}>Stocks pass HQ preset</Text>
                  <Text style={styles.small}>
                    Gross ≥ 40% · ROIC ≥ 15% · FCF ≥ 10% · P/E ≤ 30
                  </Text>
                </View>
              ) : (
                <Text style={styles.empty}>No data</Text>
              )}
            </Card>
          </Link>

          <Link href="/etfs" style={{ width: cardWidth, textDecorationLine: 'none' } as any}>
            <Card title="ETFs" subtitle="Quality filter (top 2000)">
              {etfHqCount != null ? (
                <View>
                  <Text style={[styles.bigNum, { color: theme.yellow }]}>{etfHqCount}</Text>
                  <Text style={styles.bigLabel}>
                    {etfTotal ? `ETFs of ${etfTotal} look HQ` : 'ETFs look HQ'}
                  </Text>
                  <Text style={styles.small}>
                    AUM ≥ $1B · TER ≤ 0.20% · YoY ≥ 0%
                  </Text>
                </View>
              ) : (
                <Text style={styles.empty}>No data</Text>
              )}
            </Card>
          </Link>

          <Link href="/credit" style={{ width: cardWidth, textDecorationLine: 'none' } as any}>
            <Card title="Credit" subtitle="High-yield spread">
              {hyBps != null ? (
                <View>
                  <Text
                    style={[
                      styles.bigNum,
                      { color: zoneColor(creditZone.hySpreadPct(data.hySpread!.value)) },
                    ]}
                  >
                    {formatBps(data.hySpread!.value)}
                  </Text>
                  <Text style={styles.bigLabel}>HY over Treasuries</Text>
                  <View style={{ marginTop: 8 }}>
                    <Badge
                      text={
                        data.hySpread!.value < 3.5
                          ? 'COMFORTABLE'
                          : data.hySpread!.value < 5
                          ? 'ELEVATED'
                          : 'STRESS'
                      }
                      variant={creditZone.hySpreadPct(data.hySpread!.value)}
                    />
                  </View>
                </View>
              ) : (
                <Text style={styles.empty}>No data</Text>
              )}
            </Card>
          </Link>
        </View>
      )}

      {/* About */}
      <Card title="What's inside" style={{ marginTop: theme.spacing.xl }}>
        <Text style={styles.body}>
          This dashboard tracks a handful of signals that institutional investors watch but retail usually doesn't.
          Each page pulls fresh data from public sources (CFTC COT reports, FRED economic data, CME COMEX warehouse
          stocks, and Yahoo Finance fundamentals) and renders it the way a professional trader would read it.
        </Text>
        <Text style={[styles.body, { marginTop: theme.spacing.sm }]}>
          Metals shows where the smart money is positioned in gold and silver. Stocks lets you filter the S&P 500
          by institutional quality metrics. ETFs lets you filter the top 2000 US funds by AUM, fees,
          momentum, Sharpe and volatility — and on the Stocks page you can find ETFs that match a custom
          stock filter. Credit tracks money-printing and credit-stress gauges that lead recessions by
          months. Tap any card to dive in.
        </Text>
      </Card>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  wordmark: { ...theme.type.gaugeCenter, color: theme.yellow, textAlign: 'center' },
  tagline: { ...theme.type.h1, color: theme.textPrimary, marginTop: theme.spacing.sm, textAlign: 'center' },
  sub: { ...theme.type.body, color: theme.textSecondary, marginTop: theme.spacing.sm, maxWidth: 560, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' } as any,
  bigNum: { ...theme.type.statBig, fontSize: 40 },
  bigLabel: { ...theme.type.label, color: theme.textMuted, marginTop: 2 },
  small: { ...theme.type.micro, color: theme.textMuted, marginTop: 8 },
  empty: { ...theme.type.body, color: theme.textMuted },
  body: { ...theme.type.body, color: theme.textSecondary, lineHeight: 20 },
});
