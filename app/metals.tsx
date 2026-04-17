import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/primitives/Card';
import { StatBox } from '@/components/primitives/StatBox';
import { Callout } from '@/components/primitives/Callout';
import { Badge } from '@/components/primitives/Badge';
import { SkeletonCard } from '@/components/primitives/Skeleton';
import { ErrorCard } from '@/components/primitives/ErrorCard';
import { FreshnessBadge } from '@/components/primitives/FreshnessBadge';
import { SemiGauge } from '@/components/charts/SemiGauge';
import { RingGauge } from '@/components/charts/RingGauge';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { ChartLegend } from '@/components/charts/ChartLegend';
import { fetchMetals, MetalsData } from '@/lib/queries';
import { creditZone, theme, zoneColor, cotLabel, cotInstitutionStance } from '@/lib/theme';
import { formatBigNum, formatPct, formatSignedPct } from '@/lib/format';
import { OZ_PER_CONTRACT, COT_PERF_BUCKETS } from '@/lib/constants';
import type { ComexRow, Metal, CotRow, CotPerfRow } from '@/lib/types';

export default function Metals() {
  const { width } = useWindowDimensions();
  const [d, setD] = useState<MetalsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [perfTab, setPerfTab] = useState<Metal>('gold');

  const load = () => {
    setErr(null);
    fetchMetals().then(setD).catch((e) => setErr(String(e?.message ?? e)));
  };
  useEffect(load, []);

  const monthly = useMemo(() => {
    if (!d) return { gold: [], silver: [] } as Record<Metal, { month: string; registered: number; eligible: number; date: string }[]>;
    return aggregateMonthly(d.comex);
  }, [d]);

  if (err) return <PageShell><ErrorCard label="metals" message={err} onRetry={load} /></PageShell>;
  if (!d) {
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

  const chartW = Math.min(width - 48, 520);
  const isMobile = width < theme.breakpoints.sm;
  const isDesktop = width >= theme.breakpoints.lg;

  const gold = d.cotLatest.find((r) => r.metal === 'gold');
  const silver = d.cotLatest.find((r) => r.metal === 'silver');

  const cotDate = [gold?.report_date, silver?.report_date].filter(Boolean).sort().reverse()[0];
  const comexDate = d.comex.length ? d.comex[d.comex.length - 1].date : null;

  return (
    <PageShell>
      <View style={styles.header}>
        <Text style={styles.h1}>Metals</Text>
        <Text style={styles.sub}>COT positioning, COMEX inventory, and "what happened next?" history.</Text>
      </View>

      {/* Smart Money Meter */}
      <Card title="Smart Money Meter" subtitle="CFTC COT Index — where commercial traders are positioned." footer={<FreshnessBadge date={cotDate ?? null} />}>
        <View style={[styles.twoCol, isMobile && styles.stack]}>
          <CotPanel cot={gold} metal="gold" />
          <CotPanel cot={silver} metal="silver" />
        </View>
      </Card>

      {/* Paper vs Physical */}
      <View style={{ height: theme.spacing.lg }} />
      <Card title="Paper vs Physical" subtitle="Open-interest ounces divided by COMEX registered ounces.">
        <View style={[styles.twoCol, isMobile && styles.stack]}>
          {(['gold', 'silver'] as Metal[]).map((metal) => {
            const cot = d.cotLatest.find((r) => r.metal === metal);
            const latestInv = latestByMetal(d.comex, metal);
            const ratio = cot && latestInv && latestInv.registered > 0
              ? (cot.open_interest * OZ_PER_CONTRACT[metal]) / latestInv.registered
              : 0;
            return (
              <View key={metal} style={styles.flex1}>
                <StatBox
                  label={`${metal.toUpperCase()} PAPER/PHYSICAL`}
                  value={`${ratio.toFixed(1)}×`}
                  color={ratio > 5 ? theme.red : ratio > 2 ? theme.amber : theme.green}
                  secondary={`For every 1 oz in vaults, ${ratio.toFixed(1)} oz is traded on paper.`}
                  size="lg"
                />
              </View>
            );
          })}
        </View>
      </Card>

      {/* COMEX Inventory */}
      <View style={{ height: theme.spacing.lg }} />
      <View style={[styles.twoCol, isMobile && styles.stack]}>
        {(['gold', 'silver'] as Metal[]).map((metal) => {
          const rows = monthly[metal];
          const latest = rows[rows.length - 1];
          const first = rows[0];
          const total = latest ? latest.registered + latest.eligible : 0;
          const coveragePct = latest && latest.registered > 0 ? (latest.registered / total) * 100 : 0;
          const yoyChange = first && latest && first.registered + first.eligible > 0
            ? ((total - (first.registered + first.eligible)) / (first.registered + first.eligible)) * 100
            : 0;
          const stress = 100 - coveragePct;
          const denom = metal === 'gold' ? 1e6 : 1e6;
          return (
            <Card
              key={metal}
              title={`${metal} COMEX inventory`}
              subtitle={`Registered = deliverable. Eligible = stored but not warranted.`}
              footer={<FreshnessBadge date={comexDate} />}
              style={styles.flex1}
            >
              <View style={{ overflow: 'hidden' }}>
                <StackedBarChart
                  data={rows.map((r) => ({ month: r.month, registered: r.registered, eligible: r.eligible }))}
                  colorRegistered={theme.yellow}
                  colorEligible={theme.blue}
                  width={chartW}
                  yFormat={(v) => `${(v / denom).toFixed(1)}M`}
                />
                <View style={{ marginTop: 8 }}>
                  <ChartLegend
                    align="left"
                    items={[
                      { label: 'Registered', color: theme.yellow },
                      { label: 'Eligible', color: theme.blue },
                    ]}
                  />
                </View>
              </View>
              <View style={[styles.row2, { marginTop: theme.spacing.md }]}>
                <StatBox
                  label="Registered Share"
                  value={formatPct(coveragePct)}
                  color={coveragePct > 40 ? theme.green : coveragePct > 20 ? theme.amber : theme.red}
                />
                <StatBox
                  label="12mo Change (Total)"
                  value={formatSignedPct(yoyChange)}
                  color={yoyChange > 0 ? theme.green : theme.red}
                />
              </View>
              <View style={{ marginTop: theme.spacing.lg, alignItems: 'center' }}>
                <RingGauge
                  value={stress}
                  max={100}
                  zone={creditZone.comexStress(stress)}
                  label="Stress Index (experimental)"
                  caption={`${stress.toFixed(0)} / 100 · higher = more stress`}
                  size={120}
                  displayValue={stress.toFixed(0)}
                />
              </View>
            </Card>
          );
        })}
      </View>

      {/* Historical performance */}
      <View style={{ height: theme.spacing.lg }} />
      <Card title="What happened next?" subtitle="Historical 30d/90d forward returns grouped by COT Index bucket.">
        <View style={styles.tabs}>
          {(['gold', 'silver'] as Metal[]).map((m) => {
            const active = perfTab === m;
            return (
              <Pressable key={m} onPress={() => setPerfTab(m)} style={[styles.tab, active && styles.tabActive]}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{m.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>
        <HistTable rows={d.cotPerf.filter((p) => p.metal === perfTab)} />
      </Card>
    </PageShell>
  );
}

function CotPanel({ cot, metal }: { cot: CotRow | undefined; metal: Metal }) {
  if (!cot || cot.cot_index == null) {
    return (
      <View style={styles.flex1}>
        <Text style={styles.mutedTitle}>{metal.toUpperCase()}</Text>
        <Text style={styles.empty}>Not enough history yet</Text>
      </View>
    );
  }
  const v = cot.cot_index;
  const zone = creditZone.cotIndex(v);
  return (
    <View style={styles.flex1}>
      <Text style={styles.mutedTitle}>{metal.toUpperCase()}</Text>
      <SemiGauge value={v} size={220} />
      <View style={{ alignItems: 'center', marginTop: 4 }}>
        <Badge text={cotLabel(v)} variant={zone} />
      </View>
      <Callout
        title={cotInstitutionStance(v)}
        body={`Managed money is net ${cot.mm_net >= 0 ? 'long' : 'short'} ${formatBigNum(Math.abs(cot.mm_net))} contracts.`}
        borderColor={zoneColor(zone)}
      />
    </View>
  );
}

function HistTable({ rows }: { rows: CotPerfRow[] }) {
  const byBucket = new Map(rows.map((r) => [r.score_bucket, r]));
  return (
    <View style={styles.table}>
      <View style={[styles.trow, styles.thead]}>
        <Text style={[styles.th, styles.col1]}>COT Bucket</Text>
        <Text style={[styles.th, styles.col2]}>Weeks</Text>
        <Text style={[styles.th, styles.col3]}>30d Median</Text>
        <Text style={[styles.th, styles.col3]}>90d Median</Text>
      </View>
      {COT_PERF_BUCKETS.map((b) => {
        const r = byBucket.get(b);
        const d30 = r?.median_30d;
        const d90 = r?.median_90d;
        return (
          <View key={b} style={styles.trow}>
            <Text style={[styles.td, styles.col1]}>{b}</Text>
            <Text style={[styles.td, styles.col2]}>{r?.weeks ?? '—'}</Text>
            <Text style={[styles.td, styles.col3, d30 != null && { color: d30 > 0 ? theme.green : theme.red }]}>
              {d30 != null ? formatSignedPct(d30) : '—'}
            </Text>
            <Text style={[styles.td, styles.col3, d90 != null && { color: d90 > 0 ? theme.green : theme.red }]}>
              {d90 != null ? formatSignedPct(d90) : '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function latestByMetal(rows: ComexRow[], metal: Metal): ComexRow | null {
  const filt = rows.filter((r) => r.metal === metal);
  return filt[filt.length - 1] ?? null;
}

function aggregateMonthly(
  comex: ComexRow[]
): Record<Metal, { month: string; registered: number; eligible: number; date: string }[]> {
  const out: Record<Metal, { month: string; registered: number; eligible: number; date: string }[]> = {
    gold: [],
    silver: [],
  };
  for (const metal of ['gold', 'silver'] as Metal[]) {
    const rows = comex.filter((r) => r.metal === metal);
    const byMonth = new Map<string, ComexRow>();
    for (const r of rows) {
      const key = r.date.slice(0, 7);
      const prev = byMonth.get(key);
      if (!prev || r.date > prev.date) byMonth.set(key, r);
    }
    const sorted = Array.from(byMonth.values()).sort((a, b) => a.date.localeCompare(b.date));
    const last12 = sorted.slice(-12);
    out[metal] = last12.map((r) => ({
      month: new Date(r.date).toLocaleDateString('en-US', { month: 'short' }),
      registered: r.registered,
      eligible: r.eligible,
      date: r.date,
    }));
  }
  return out;
}

const styles = StyleSheet.create({
  header: { marginBottom: theme.spacing.lg },
  h1: { ...theme.type.h1, color: theme.textPrimary },
  sub: { ...theme.type.body, color: theme.textSecondary, marginTop: 4 },
  twoCol: { flexDirection: 'row', gap: theme.spacing.lg } as any,
  stack: { flexDirection: 'column', gap: theme.spacing.lg } as any,
  row2: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md } as any,
  flex1: { flex: 1 },
  mutedTitle: { ...theme.type.label, color: theme.textMuted, textAlign: 'center', marginBottom: 4 },
  empty: { ...theme.type.body, color: theme.textMuted, textAlign: 'center' },

  tabs: { flexDirection: 'row', gap: 8, marginBottom: theme.spacing.md } as any,
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
  },
  tabActive: { borderColor: theme.yellow, backgroundColor: theme.yellow + '22' },
  tabText: { ...theme.type.label, color: theme.textSecondary },
  tabTextActive: { color: theme.yellow },

  table: { borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md, overflow: 'hidden' },
  trow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  thead: { backgroundColor: theme.bgCardAlt },
  th: { ...theme.type.label, color: theme.textSecondary },
  td: { ...theme.type.body, color: theme.textPrimary },
  col1: { flex: 1.2 },
  col2: { flex: 0.8, textAlign: 'center' },
  col3: { flex: 1, textAlign: 'right' },
});
