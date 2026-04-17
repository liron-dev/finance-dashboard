import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';

type Props = {
  title: string;
  body?: string;
  bullets?: string[];
  borderColor?: string;
};

export function Callout({ title, body, bullets, borderColor = theme.yellow }: Props) {
  return (
    <View style={[styles.wrap, { borderLeftColor: borderColor }]}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {bullets?.length
        ? bullets.map((b, i) => (
            <Text key={i} style={styles.bullet}>
              • {b}
            </Text>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.bgCardAlt,
    borderLeftWidth: 3,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
  },
  title: { ...theme.type.h3, color: theme.textPrimary, textTransform: 'uppercase', letterSpacing: 0.5 },
  body: { ...theme.type.body, color: theme.textSecondary, marginTop: theme.spacing.xs },
  bullet: { ...theme.type.body, color: theme.textSecondary, marginTop: 2 },
});
