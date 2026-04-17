import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { theme } from '@/lib/theme';

type Props = {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  color?: string;
};

export function RangeSlider({ label, min, max, step = 1, value, onChange, format, color = theme.cyan }: Props) {
  const shown = format ? format(value) : String(value);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color }]}>{shown}</Text>
      </View>
      {Platform.OS === 'web' ? (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number((e.target as HTMLInputElement).value))}
          style={{
            width: '100%',
            accentColor: color,
            height: 28,
          } as any}
        />
      ) : (
        <Slider
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={value}
          onValueChange={onChange}
          minimumTrackTintColor={color}
          maximumTrackTintColor={theme.border}
          thumbTintColor={color}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: theme.spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  label: { ...theme.type.label, color: theme.textSecondary },
  value: { ...theme.type.h3 },
});
