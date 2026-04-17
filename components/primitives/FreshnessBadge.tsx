import React from 'react';
import { Badge } from './Badge';
import { daysAgo, formatDate } from '@/lib/format';
import { FRESHNESS } from '@/lib/constants';
import type { Zone } from '@/lib/types';

type Props = { date: string | null | undefined; prefix?: string };

export function FreshnessBadge({ date, prefix = 'As of' }: Props) {
  if (!date) return <Badge text="No data" variant="neutral" />;
  const age = daysAgo(date);
  const variant: Zone = age <= FRESHNESS.freshDays ? 'green' : age <= FRESHNESS.warnDays ? 'amber' : 'red';
  return <Badge text={`${prefix} ${formatDate(date)}`} variant={variant} />;
}
