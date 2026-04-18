import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import type { Metal } from '@/lib/types';

type Props = {
  metal: Metal;
  ratio: number; // paper oz / physical oz
};

// Felix's visual: a horizontal bar split into "Physical" (metal color) on the
// left and "Paper" (metal color, dim) filling the rest — width of each block
// proportional to the ratio.  One unit physical = `ratio` units paper.
export function PaperPhysicalStripe({ metal, ratio }: Props) {
  const metalColor = metal === 'gold' ? theme.yellow : '#D4D4D8';
  const paperColor = metal === 'gold' ? theme.yellowDim : '#71717A';

  const total = 1 + Math.max(0, ratio);
  const physPct = (1 / total) * 100;
  const paperPct = 100 - physPct;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.metal, { color: metalColor }]}>{metal.toUpperCase()}</Text>
        <Text style={styles.ratio}>
          <Text style={{ color: metalColor, fontWeight: '800' }}>{ratio.toFixed(1)}×</Text>
          <Text style={{ color: theme.textMuted }}> paper vs physical</Text>
        </Text>
      </View>

      <View style={styles.bar}>
        <View
          style={{
            width: `${physPct}%` as any,
            backgroundColor: metalColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={styles.segLabel}>1×</Text>
        </View>
        <View
          style={{
            width: `${paperPct}%` as any,
            backgroundColor: paperColor,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.55,
          }}
        >
          <Text style={[styles.segLabel, { color: theme.textPrimary }]}>{ratio.toFixed(1)}×</Text>
        </View>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: metalColor }]} />
          <Text style={styles.legendText}>Physical (vaulted)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: paperColor, opacity: 0.55 }]} />
          <Text style={styles.legendText}>Paper (futures OI)</Text>
        </View>
      </View>

      <Text style={styles.caption}>
        For every 1 oz in COMEX vaults, {ratio.toFixed(1)} oz is traded on paper.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 } as any,
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' } as any,
  metal: { ...theme.type.label },
  ratio: { ...theme.type.body },
  bar: {
    flexDirection: 'row',
    height: 28,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  } as any,
  segLabel: { ...theme.type.label, color: theme.bg },
  legend: { flexDirection: 'row', gap: theme.spacing.md, flexWrap: 'wrap' } as any,
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 } as any,
  dot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { ...theme.type.micro, color: theme.textSecondary },
  caption: { ...theme.type.micro, color: theme.textMuted },
});
