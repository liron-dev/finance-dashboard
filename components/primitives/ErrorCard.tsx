import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/lib/theme';

type Props = {
  label?: string;
  message?: string;
  onRetry?: () => void;
};

export function ErrorCard({ label = 'Data', message, onRetry }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Couldn't load {label}</Text>
      {message ? <Text style={styles.msg}>{message}</Text> : null}
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.btn}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.bgCard,
    borderWidth: 1,
    borderColor: theme.red,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
  title: { ...theme.type.h3, color: theme.red, textTransform: 'uppercase' },
  msg: { ...theme.type.body, color: theme.textSecondary, marginTop: theme.spacing.xs },
  btn: {
    marginTop: theme.spacing.md,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.red,
  },
  btnText: { ...theme.type.label, color: theme.red },
});
