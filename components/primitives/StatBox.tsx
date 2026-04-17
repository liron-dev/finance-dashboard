import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';

type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  value: string;
  color?: string;
  secondary?: string;
  size?: Size;
  align?: 'left' | 'center';
};

export function StatBox({ label, value, color = theme.textPrimary, secondary, size = 'md', align = 'left' }: Props) {
  const valueStyle =
    size === 'lg' ? theme.type.statBig : size === 'sm' ? theme.type.statMedium : theme.type.statMedium;
  return (
    <View style={[styles.wrap, align === 'center' ? styles.center : null]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[valueStyle, { color }, styles.value]}>{value}</Text>
      {secondary ? <Text style={styles.secondary}>{secondary}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'column' },
  center: { alignItems: 'center' },
  label: { ...theme.type.label, color: theme.textMuted },
  value: { marginTop: 4 },
  secondary: { ...theme.type.body, color: theme.textSecondary, marginTop: 2 },
});
