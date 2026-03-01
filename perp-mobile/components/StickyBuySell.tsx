import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/constants/Theme';

type StickyBuySellProps = {
  symbol: string;
  onBuy?: () => void;
  onSell?: () => void;
};

export function StickyBuySell({ symbol, onBuy, onSell }: StickyBuySellProps) {
  const router = useRouter();
  const base = symbol.replace('-PERP', '');

  const handleBuy = () => {
    if (onBuy) onBuy();
    else router.push(`/trade?symbol=${encodeURIComponent(symbol)}&side=long`);
  };
  const handleSell = () => {
    if (onSell) onSell();
    else router.push(`/trade?symbol=${encodeURIComponent(symbol)}&side=short`);
  };

  return (
    <View style={styles.container}>
      <Pressable style={[styles.button, styles.buy]} onPress={handleBuy}>
        <Text style={styles.buttonText}>Buy {base}</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.sell]} onPress={handleSell}>
        <Text style={styles.buttonText}>Sell {base}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buy: {
    backgroundColor: colors.long,
  },
  sell: {
    backgroundColor: colors.short,
  },
  buttonText: {
    ...typography.headline,
    color: '#000',
  },
});
