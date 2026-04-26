import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Link, usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { theme } from '@/lib/theme';

const LINKS = [
  { label: 'Metals', href: '/metals' as const },
  { label: 'Stocks', href: '/stocks' as const },
  { label: 'ETFs', href: '/etfs' as const },
  { label: 'Credit', href: '/credit' as const },
];

export function NavBar() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isMobile = width < theme.breakpoints.sm;

  return (
    <View style={styles.wrap}>
      <View style={styles.inner}>
        <Link href="/" style={styles.brand} accessibilityRole="link">
          <Text style={styles.brandText}>finance-dashboard</Text>
        </Link>
        {isMobile ? (
          <Pressable onPress={() => setOpen((o) => !o)} style={styles.hamburger} accessibilityRole="button" accessibilityLabel="Menu">
            <Feather name={open ? 'x' : 'menu'} size={22} color={theme.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.linkRow}>
            {LINKS.map((l) => {
              const active = pathname === l.href;
              return (
                <Link key={l.href} href={l.href} style={styles.linkWrap} accessibilityRole="link">
                  <Text style={[styles.link, active && styles.linkActive]}>{l.label}</Text>
                </Link>
              );
            })}
          </View>
        )}
      </View>
      {isMobile && open ? (
        <View style={styles.mobileMenu}>
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                style={styles.mobileLinkWrap}
                onPress={() => setOpen(false)}
                accessibilityRole="link"
              >
                <Text style={[styles.mobileLink, active && styles.linkActive]}>{l.label}</Text>
              </Link>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.bg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 0, zIndex: 100 } as any) : {}),
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { textDecorationLine: 'none' } as any,
  brandText: { ...theme.type.brand, color: theme.yellow },
  linkRow: { flexDirection: 'row', gap: theme.spacing.lg } as any,
  linkWrap: { paddingVertical: 4, textDecorationLine: 'none' } as any,
  link: { ...theme.type.label, color: theme.textSecondary },
  linkActive: {
    color: theme.yellow,
    borderBottomWidth: 2,
    borderBottomColor: theme.yellow,
    paddingBottom: 2,
  },
  hamburger: { padding: 6 },
  mobileMenu: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingVertical: theme.spacing.sm,
  },
  mobileLinkWrap: { paddingVertical: 14, paddingHorizontal: theme.spacing.lg, textDecorationLine: 'none' } as any,
  mobileLink: { ...theme.type.h3, color: theme.textSecondary },
});
