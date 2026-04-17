import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/primitives/Card';
import { StatBox } from '@/components/primitives/StatBox';
import { SkeletonCard } from '@/components/primitives/Skeleton';
import { ErrorCard } from '@/components/primitives/ErrorCard';
import { FreshnessBadge } from '@/components/primitives/FreshnessBadge';
import { InfoTooltip } from '@/components/primitives/InfoTooltip';
import { AreaChart } from '@/components/charts/AreaChart';
import { LineChart, Series } from '@/components/charts/LineChart';
import { RingGauge } from '@/components/charts/RingGauge';
import { Sparkline } from '@/components/charts/Sparkline';
import { ChartLegend } from '@/components/charts/ChartLegend';
import { fetchCredit, CreditData } from '@/lib/queries';
import { creditZone, theme, zoneColor } from '@/lib/theme';
import { formatBigNum, formatBps, formatCurrency, formatPct, formatSignedPct, formatUsd } from '@/lib/format';
import { CRISIS_META } from '@/lib/constants';

const MANAGER_COLORS = [theme.yellow, theme.cyan, theme.green, theme.amber, theme.blue, theme.purple];

export default function Credit() {
  const { width } = useWindowDimensions();
  const [d, setD] = useState<CreditData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    fetchCredit().then(setD).catch((e) => setErr(String(e?.message ?? e)));
  };
  useEffect(load, []);

  const chartW = Math.min(width - 48, 1100);

  const computed = useMemo(() => {
    if (!d) return null;
    const m2Latest = d.m2[d.m2.length - 1];
    const m2Oldest12 = d.m2[d.m2.length - 13] ?? d.m2[0];
    const m2Yoy = m2Latest && m2Oldest12 ? (m2Latest.value / m2Oldest12.value - 1) * 100 : 0;

    const pceLatest = d.pce[d.pce.length - 1];
    const pceOldest = d.pce[0];
    const pceYoy = pceLatest && pceOldest ? (pceLatest.value / pceOldest.value - 1) * 100 : 0;

    const payLatest = d.payems[d.payems.length - 1];
    const payPrev = d.payems[d.payems.length - 2];
    const payMom = payLatest && payPrev ? payLatest.value - payPrev.value : 0;

    // M2 is in billions. Gold spot $/oz. Silver spot $/oz.
    // goldM2 = gold_spot / M2 (ratio). Silver similar.
    const goldM2 = d.gold && m2Latest ? d.gold.value / m2Latest.value : 0;
    const silverM2 = d.silver && m2Latest ? (d.silver.value / m2Latest.value) * 1000 : 0;

    return { m2Latest, m2Yoy, pceYoy, payMom, goldM2, silverM2 };
  }, [d]);

  const managerSeries: Series[] = useMemo(() => {
    if (!d) return [];
    return d.managers.map((m, i) => {
      const hist = d.managerHist.filter((h) => h.ticker === m.ticker);
      return {
        label: m.ticker,
        color: MANAGER_COLORS[i % MANAGER_COLORS.length],
        data: hist.map((h) => ({ date: h.date, value: (h.close / m.jan1_price) * 100 })),
      };
    });
  }, [d]);

  if (err) return <PageShell><ErrorCard label="credit" message={err} onRetry={load} /></PageShell>;
  if (!d || !computed) {
    return (
      <PageShell>
        <View style={{ gap: theme.spacing.md } as any}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </PageShell>
    );
  }

  const isMobile = width < theme.breakpoints.sm;
  const isDesktop = width >= theme.breakpoints.lg;
  const gaugeCols = isMobile ? 2 : isDesktop ? 3 : 3;
  const mgrCols = isMobile ? 2 : isDesktop ? 3 : 2;

  return (
    <PageShell>
      <View style={styles.header}>
        <Text style={styles.h1}>Credit</Text>
        <Text style={styles.sub}>Money printing, credit stress, and private-credit managers.</Text>
      </View>

      {/* Money Printing Tracker */}
      <Card
        title="Money Printing Tracker"
        subtitle="M2 money supply — the denominator for everything."
        footer={<FreshnessBadge date={computed.m2Latest?.date ?? null} />}
      >
        <View style={[styles.row2, isMobile && styles.stack]}>
          <StatBox
            label="M2 Money Supply"
            value={formatCurrency(computed.m2Latest.value * 1e9)}
            color={theme.yellow}
            size="lg"
          />
          <StatBox
            label="YoY Change"
            value={formatSignedPct(computed.m2Yoy)}
            color={computed.m2Yoy > 6 ? theme.red : computed.m2Yoy > 3 ? theme.amber : theme.green}
            size="lg"
          />
        </View>
        <View style={{ marginTop: theme.spacing.md, overflow: 'hidden' }}>
          <AreaChart
            data={d.m2.map((r) => ({ date: r.date, value: r.value }))}
            color={theme.green}
            width={chartW}
            yFormat={(v) => formatCurrency(v * 1e9)}
            xFormat={(iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
          />
        </View>
        <View style={[styles.row2, { marginTop: theme.spacing.md }, isMobile && styles.stack]}>
          <StatBox label="Gold / M2" value={computed.goldM2.toFixed(3)} color={theme.yellow} secondary="Gold priced in M2 units" />
          <StatBox label="Silver / M2 (×1000)" value={computed.silverM2.toFixed(3)} color={theme.textPrimary} secondary="Silver priced in M2 units" />
        </View>
      </Card>

      {/* Credit Crisis Monitor */}
      <View style={{ height: theme.spacing.lg }} />
      <Card
        title="Credit Crisis Monitor"
        subtitle="Six gauges that lead recessions by months."
      >
        <View style={[styles.grid, { gap: theme.spacing.lg }]}>
          <GaugeTile
            value={d.hy ? d.hy.value * 100 : 0}
            raw={d.hy?.value ?? 0}
            displayValue={d.hy ? `${Math.round(d.hy.value * 100)}` : '—'}
            max={1000}
            unit="bps"
            label={CRISIS_META.HY.label}
            info={CRISIS_META.HY.info}
            zone={d.hy ? creditZone.hySpreadPct(d.hy.value) : 'neutral'}
            cols={gaugeCols}
          />
          <GaugeTile
            value={d.dff?.value ?? 0}
            displayValue={d.dff ? d.dff.value.toFixed(2) : '—'}
            max={10}
            unit="%"
            label={CRISIS_META.FED.label}
            info={CRISIS_META.FED.info}
            zone={d.dff ? creditZone.fedRatePct(d.dff.value) : 'neutral'}
            cols={gaugeCols}
          />
          <GaugeTile
            value={d.curve?.value ?? 0}
            displayValue={d.curve ? d.curve.value.toFixed(2) : '—'}
            max={3}
            unit="%"
            label={CRISIS_META.CURVE.label}
            info={CRISIS_META.CURVE.info}
            zone={d.curve ? creditZone.yieldCurvePct(d.curve.value) : 'neutral'}
            cols={gaugeCols}
          />
          <GaugeTile
            value={computed.payMom}
            displayValue={computed.payMom.toFixed(0)}
            max={500}
            unit="K/mo"
            label={CRISIS_META.PAYROLLS.label}
            info={CRISIS_META.PAYROLLS.info}
            zone={creditZone.payrollsMoMK(computed.payMom)}
            cols={gaugeCols}
          />
          <GaugeTile
            value={computed.pceYoy}
            displayValue={formatPct(computed.pceYoy)}
            max={8}
            unit="YoY"
            label={CRISIS_META.PCE.label}
            info={CRISIS_META.PCE.info}
            zone={creditZone.pceYoYPct(computed.pceYoy)}
            cols={gaugeCols}
          />
          <GaugeTile
            value={d.bbb ? d.bbb.value * 100 : 0}
            displayValue={d.bbb ? Math.round(d.bbb.value * 100).toString() : '—'}
            max={400}
            unit="bps"
            label={CRISIS_META.BBB.label}
            info={CRISIS_META.BBB.info}
            zone={d.bbb ? creditZone.bbbSpreadPct(d.bbb.value) : 'neutral'}
            cols={gaugeCols}
          />
        </View>
      </Card>

      {/* Private Credit Managers */}
      <View style={{ height: theme.spacing.lg }} />
      <Card
        title="Private Credit Managers"
        subtitle="Alt-asset managers — proxy for private credit flow."
      >
        <View style={[styles.grid, { gap: theme.spacing.md }]}>
          {d.managers.map((m, i) => {
            const hist = d.managerHist.filter((h) => h.ticker === m.ticker);
            const ytdColor = m.ytd_pct > 0 ? theme.green : m.ytd_pct < 0 ? theme.red : theme.textMuted;
            return (
              <View key={m.ticker} style={[styles.mgrCard, { width: `${100 / mgrCols - 2}%` } as any]}>
                <View style={styles.mgrTop}>
                  <Text style={styles.mgrTicker}>{m.ticker}</Text>
                  <Text style={[styles.mgrYtd, { color: ytdColor }]}>{formatSignedPct(m.ytd_pct)}</Text>
                </View>
                <Text style={styles.mgrName} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.mgrPrice}>{formatUsd(m.price, 2)}</Text>
                <View style={{ marginTop: 4 }}>
                  <Sparkline
                    data={hist.map((h) => h.close)}
                    color={MANAGER_COLORS[i % MANAGER_COLORS.length]}
                    width={180}
                    height={36}
                  />
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ marginTop: theme.spacing.lg }}>
          <Text style={styles.sectionLabel}>YTD Performance (indexed to 100)</Text>
          <View style={{ marginTop: 8 }}>
            <ChartLegend items={managerSeries.map((s) => ({ label: s.label, color: s.color }))} />
          </View>
          <View style={{ marginTop: 8, overflow: 'hidden' }}>
            <LineChart series={managerSeries} width={chartW} height={280} baseline={100} yFormat={(v) => v.toFixed(0)} />
          </View>
        </View>
      </Card>
    </PageShell>
  );
}

function GaugeTile({
  value,
  raw,
  displayValue,
  max,
  unit,
  label,
  info,
  zone,
  cols,
}: {
  value: number;
  raw?: number;
  displayValue: string;
  max: number;
  unit: string;
  label: string;
  info: string;
  zone: any;
  cols: number;
}) {
  return (
    <View style={[styles.gaugeWrap, { width: `${100 / cols - 2}%` } as any]}>
      <RingGauge value={value} max={max} zone={zone} label={label} size={140} displayValue={displayValue} unit={unit} />
      <View style={styles.tooltip}>
        <InfoTooltip text={info} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: theme.spacing.lg },
  h1: { ...theme.type.h1, color: theme.textPrimary },
  sub: { ...theme.type.body, color: theme.textSecondary, marginTop: 4 },
  row2: { flexDirection: 'row', gap: theme.spacing.lg, justifyContent: 'space-between' } as any,
  stack: { flexDirection: 'column', gap: theme.spacing.md } as any,
  grid: { flexDirection: 'row', flexWrap: 'wrap' } as any,
  gaugeWrap: { alignItems: 'center', paddingVertical: theme.spacing.sm, position: 'relative' },
  tooltip: { position: 'absolute', top: 0, right: 4 },
  mgrCard: {
    backgroundColor: theme.bgCardAlt,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  mgrTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  mgrTicker: { ...theme.type.h2, color: theme.yellow },
  mgrYtd: { ...theme.type.h3 },
  mgrName: { ...theme.type.micro, color: theme.textMuted, marginTop: 2 },
  mgrPrice: { ...theme.type.h3, color: theme.textPrimary, marginTop: 4 },
  sectionLabel: { ...theme.type.label, color: theme.textSecondary },
});
