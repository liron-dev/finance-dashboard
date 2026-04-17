import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';
import type { Preset } from '@/lib/types';
import { PRESET_LABEL, PRESET_NAMES } from '@/lib/filters';

type Props = {
  value: Preset;
  onChange: (p: Preset) => void;
};

export function FilterPresetTabs({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      {PRESET_NAMES.map((p) => {
        const active = value === p;
        return (
          <Pressable
            key={p}
            onPress={() => onChange(p)}
            style={[styles.tab, active && styles.tabActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{PRESET_LABEL[p]}</Text>
          </Pressable>
        );
      })}
      {value === 'Custom' ? (
        <View style={[styles.tab, styles.tabActive]}>
          <Text style={[styles.tabText, styles.tabTextActive]}>Custom</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' } as any,
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgCard,
  },
  tabActive: { backgroundColor: theme.yellow + '22', borderColor: theme.yellow },
  tabText: { ...theme.type.label, color: theme.textSecondary },
  tabTextActive: { color: theme.yellow },
});
