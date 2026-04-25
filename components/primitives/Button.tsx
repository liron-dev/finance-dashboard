import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { theme } from '@/lib/theme';
import { Spinner } from './Spinner';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  fullWidth?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  fullWidth = false,
  style,
}: Props) {
  const [hover, setHover] = useState(false);
  const isPrimary = variant === 'primary';
  const inactive = disabled || loading;

  const baseBg = isPrimary ? theme.yellow : theme.bgCardAlt;
  const hoverBg = isPrimary ? theme.yellowDim : theme.border;
  const bg = inactive ? theme.bgCardAlt : hover ? hoverBg : baseBg;
  const fg = isPrimary
    ? inactive
      ? theme.textMuted
      : '#0D0D13'
    : inactive
    ? theme.textMuted
    : theme.textPrimary;
  const borderColor = isPrimary
    ? inactive
      ? theme.border
      : 'transparent'
    : theme.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor, alignSelf: fullWidth ? 'stretch' : 'flex-start' },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <Spinner size={14} color={fg} /> : null}
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  } as any,
  label: {
    ...theme.type.h3,
    letterSpacing: 0.5,
  },
});
