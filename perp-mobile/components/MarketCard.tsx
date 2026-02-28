import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/constants/Theme';

export type MarketItem = {
  symbol: string;
  name: string;
  price: string;
  change24h: number;
  volume24h: string;
};

type MarketCardProps = {
  market: MarketItem;
  onPress: () => void;
};

export function MarketCard({ market, onPress }: MarketCardProps) {
  const isPositive = market.change24h >= 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <View>
          <Text style={styles.symbol}>{market.symbol}</Text>
          <Text style={styles.name}>{market.name}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.price}>${market.price}</Text>
          <Text
            style={[
              styles.change,
              isPositive ? styles.changeLong : styles.changeShort,
            ]}
          >
            {isPositive ? '+' : ''}{market.change24h.toFixed(2)}%
          </Text>
        </View>
      </View>
      <Text style={styles.volume}>Vol 24h: ${market.volume24h}</Text>
    </Pressable>
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
  pressed: {
    opacity: 0.9,
    backgroundColor: colors.surfaceElevated,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  symbol: {
    ...typography.headline,
    color: colors.text,
  },
  name: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
  },
  price: {
    ...typography.headline,
    color: colors.text,
  },
  change: {
    ...typography.caption,
    marginTop: 2,
    fontWeight: '600',
  },
  changeLong: {
    color: colors.long,
  },
  changeShort: {
    color: colors.short,
  },
  volume: {
    ...typography.caption2,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
