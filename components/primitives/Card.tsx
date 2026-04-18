import React, { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { theme } from '@/lib/theme';

type Props = {
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  accentColor?: string;
  style?: ViewStyle;
  children: ReactNode;
};

export function Card({ title, subtitle, footer, accentColor, style, children }: Props) {
  return (
    <View style={[styles.card, accentColor ? { borderColor: accentColor } : null, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={title || subtitle ? styles.body : undefined}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.bgCard,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
  title: {
    ...theme.type.h2,
    color: theme.yellow,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  subtitle: {
    ...theme.type.body,
    color: theme.textMuted,
    marginTop: theme.spacing.xs,
  },
  body: { marginTop: theme.spacing.md },
  footer: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
});
