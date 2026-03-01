import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { MarketItem } from '@/types/market';
import { colors, spacing, borderRadius, typography } from '@/constants/Theme';

type MarketListRowProps = {
  market: MarketItem;
  onPress: () => void;
};

export function MarketListRow({ market, onPress }: MarketListRowProps) {
  const isPositive = market.change24h >= 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.left}>
        <View style={styles.nameRow}>
          <Text style={styles.symbol}>{market.symbol.replace('-PERP', '')}</Text>
          <View style={styles.leverageBadge}>
            <Text style={styles.leverageText}>{market.leverage}</Text>
          </View>
        </View>
        <Text style={styles.vol}>Vol 24h: {market.volume24h}</Text>
      </View>
      <View style={styles.mid}>
        <Text style={styles.price}>{market.price}</Text>
        <Text style={styles.priceUsd}>{market.priceUsd}</Text>
      </View>
      <View style={[styles.changeBox, isPositive ? styles.changeLong : styles.changeShort]}>
        <Text style={[styles.changeText, isPositive ? styles.changeTextLong : styles.changeTextShort]}>
          {isPositive ? '+' : ''}{market.change24h.toFixed(2)}%
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfaceElevated,
  },
  left: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  symbol: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.text,
  },
  leverageBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  leverageText: {
    ...typography.caption2,
    color: colors.textSecondary,
  },
  vol: {
    ...typography.caption2,
    color: colors.textMuted,
    marginTop: 2,
  },
  mid: {
    alignItems: 'flex-end',
    marginRight: spacing.md,
  },
  price: {
    ...typography.callout,
    fontWeight: '600',
    color: colors.text,
  },
  priceUsd: {
    ...typography.caption2,
    color: colors.textMuted,
    marginTop: 2,
  },
  changeBox: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    minWidth: 64,
    alignItems: 'center',
  },
  changeLong: {
    backgroundColor: colors.longMuted,
  },
  changeShort: {
    backgroundColor: colors.shortMuted,
  },
  changeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  changeTextLong: {
    color: colors.long,
  },
  changeTextShort: {
    color: colors.short,
  },
});
