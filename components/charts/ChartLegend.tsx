import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';

type Props = {
  items: { label: string; color: string }[];
  align?: 'left' | 'center';
};

export function ChartLegend({ items, align = 'center' }: Props) {
  return (
    <View style={[styles.wrap, align === 'center' && styles.center]}>
      {items.map((it) => (
        <View key={it.label} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: it.color }]} />
          <Text style={styles.text}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md } as any,
  center: { justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 } as any,
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { ...theme.type.body, color: theme.textSecondary },
});
