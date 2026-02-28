import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/constants/Theme';

export type PositionItem = {
  symbol: string;
  side: 'long' | 'short';
  size: string;
  entryPrice: string;
  markPrice: string;
  pnl: number;
  pnlPercent: number;
};

type PositionCardProps = {
  position: PositionItem;
};

export function PositionCard({ position }: PositionCardProps) {
  const isLong = position.side === 'long';
  const pnlPositive = position.pnl >= 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.sideBadge, isLong ? styles.sideLong : styles.sideShort]}>
          <Text style={styles.sideText}>{position.side.toUpperCase()}</Text>
        </View>
        <Text style={styles.symbol}>{position.symbol}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Size</Text>
        <Text style={styles.value}>{position.size}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Entry / Mark</Text>
        <Text style={styles.value}>
          ${position.entryPrice} / ${position.markPrice}
        </Text>
      </View>
      <View style={[styles.row, styles.pnlRow]}>
        <Text style={styles.label}>PnL</Text>
        <Text
          style={[
            styles.pnl,
            pnlPositive ? styles.pnlLong : styles.pnlShort,
          ]}
        >
          {pnlPositive ? '+' : ''}{position.pnl.toFixed(2)} USDC
          {' '}({pnlPositive ? '+' : ''}{position.pnlPercent.toFixed(2)}%)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sideBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  sideLong: {
    backgroundColor: colors.longMuted,
  },
  sideShort: {
    backgroundColor: colors.shortMuted,
  },
  sideText: {
    ...typography.caption2,
    fontWeight: '700',
    color: colors.text,
  },
  symbol: {
    ...typography.headline,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  value: {
    ...typography.callout,
    color: colors.text,
  },
  pnlRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pnl: {
    ...typography.headline,
    fontWeight: '700',
  },
  pnlLong: {
    color: colors.long,
  },
  pnlShort: {
    color: colors.short,
  },
});
