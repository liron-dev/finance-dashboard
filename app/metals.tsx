import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { PaperPhysicalStripe } from '@/components/charts/PaperPhysicalStripe';
import { fetchMetals, MetalsData } from '@/lib/queries';
import { creditZone, theme, zoneColor, cotLabel, cotInstitutionStance } from '@/lib/theme';
import { formatBigNum, formatPct, formatSignedPct } from '@/lib/format';
import { OZ_PER_CONTRACT, COT_PERF_BUCKETS } from '@/lib/constants';
import type { ComexRow, Metal, CotRow, CotPerfRow } from '@/lib/types';

export default function Metals() {
  const { width } = useWindowDimensions();
  const [d, setD] = useState<MetalsData | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
        </View>
      </PageShell>
    );
  }

  const isMobile = width < theme.breakpoints.md;
  const chartW = Math.min((isMobile ? width : width / 2) - 72, 520);

  const cotDate = [
    d.cotLatest.find((r) => r.metal === 'gold')?.report_date,
    d.cotLatest.find((r) => r.metal === 'silver')?.report_date,
  ].filter(Boolean).sort().reverse()[0];
  const comexDate = d.comex.length ? d.comex[d.comex.length - 1].date : null;

  return (
    <PageShell>
      <View style={styles.header}>
        <Text style={styles.h1}>Metals</Text>
        <Text style={styles.sub}>Institutional positioning — gauge, paper/physical split, and "what happened next?" history.</Text>
      </View>

      {/* Combined per-metal panel: Gauge + Paper/Physical stripe + HistTable */}
      <Card
        title="Institutional Positioning"
        subtitle="CFTC COT Index, COMEX paper-to-physical ratio, and 3-year forward returns by bucket."
        footer={<FreshnessBadge date={cotDate ?? null} />}
      >
        <View style={[styles.twoCol, isMobile && styles.stack]}>
          <MetalPanel metal="gold" data={d} />
          <MetalPanel metal="silver" data={d} />
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
          const denom = 1e6;
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
    </PageShell>
  );
}

function MetalPanel({ metal, data }: { metal: Metal; data: MetalsData }) {
  const cot = data.cotLatest.find((r) => r.metal === metal);
  const latestInv = latestByMetal(data.comex, metal);
  const ratio = cot && latestInv && latestInv.registered > 0
    ? (cot.open_interest * OZ_PER_CONTRACT[metal]) / latestInv.registered
    : 0;
  const perfRows = data.cotPerf.filter((p) => p.metal === metal);
  const metalColor = metal === 'gold' ? theme.yellow : '#D4D4D8';

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={[styles.metalDot, { backgroundColor: metalColor }]} />
        <Text style={styles.panelTitle}>{metal.toUpperCase()}</Text>
      </View>

      {/* Smart Money Meter */}
      {cot && cot.cot_index != null ? (
        <View style={{ alignItems: 'center' }}>
          <SemiGauge value={cot.cot_index} size={220} />
          <View style={{ alignItems: 'center', marginTop: 4 }}>
            <Badge text={cotLabel(cot.cot_index)} variant={creditZone.cotIndex(cot.cot_index)} />
          </View>
          <Callout
            title={cotInstitutionStance(cot.cot_index)}
            body={`Managed money is net ${cot.mm_net >= 0 ? 'long' : 'short'} ${formatBigNum(Math.abs(cot.mm_net))} contracts.`}
            borderColor={zoneColor(creditZone.cotIndex(cot.cot_index))}
          />
        </View>
      ) : (
        <Text style={styles.empty}>Not enough history yet</Text>
      )}

      {/* Paper vs Physical stripe */}
      <View style={styles.sectionGap} />
      <Text style={styles.sectionLabel}>PAPER VS PHYSICAL</Text>
      {ratio > 0 ? (
        <PaperPhysicalStripe metal={metal} ratio={ratio} />
      ) : (
        <Text style={styles.empty}>No COMEX inventory data</Text>
      )}

      {/* What happened next */}
      <View style={styles.sectionGap} />
      <Text style={styles.sectionLabel}>WHAT HAPPENED NEXT?</Text>
      <Text style={styles.sectionHint}>Median spot move over the following 30/90 days, by COT bucket (3yr).</Text>
      <HistTable rows={perfRows} />
    </View>
  );
}

function HistTable({ rows }: { rows: CotPerfRow[] }) {
  const byBucket = new Map(rows.map((r) => [r.score_bucket, r]));
  return (
    <View style={styles.table}>
      <View style={[styles.trow, styles.thead]}>
        <Text style={[styles.th, styles.col1]}>Bucket</Text>
        <Text style={[styles.th, styles.col2]}>Weeks</Text>
        <Text style={[styles.th, styles.col3]}>30d</Text>
        <Text style={[styles.th, styles.col3]}>90d</Text>
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

  panel: {
    flex: 1,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.bgCardAlt,
    gap: theme.spacing.sm,
  } as any,
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 } as any,
  panelTitle: { ...theme.type.h2, color: theme.textPrimary, letterSpacing: 1 },
  metalDot: { width: 10, height: 10, borderRadius: 5 },

  sectionGap: { height: theme.spacing.md },
  sectionLabel: { ...theme.type.label, color: theme.textMuted, marginBottom: 6 },
  sectionHint: { ...theme.type.micro, color: theme.textMuted, marginBottom: 6 },

  empty: { ...theme.type.body, color: theme.textMuted, textAlign: 'center' },

  table: { borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md, overflow: 'hidden' },
  trow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  thead: { backgroundColor: theme.bgCard },
  th: { ...theme.type.label, color: theme.textSecondary },
  td: { ...theme.type.body, color: theme.textPrimary },
  col1: { flex: 1.2 },
  col2: { flex: 0.8, textAlign: 'center' },
  col3: { flex: 1, textAlign: 'right' },
});
