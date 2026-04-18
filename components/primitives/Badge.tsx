import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme, zoneColor } from '@/lib/theme';
import type { Zone } from '@/lib/types';

type Variant = Zone | 'yellow';

type Props = {
  text: string;
  variant?: Variant;
};

export function Badge({ text, variant = 'neutral' }: Props) {
  const color = variant === 'yellow' ? theme.yellow : zoneColor(variant);
  return (
    <View style={[styles.wrap, { borderColor: color, backgroundColor: color + '22' }]}>
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: { ...theme.type.label },
});
