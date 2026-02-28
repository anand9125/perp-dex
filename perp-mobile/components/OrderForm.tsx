import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/constants/Theme';

type Side = 'long' | 'short';

type OrderFormProps = {
  marketSymbol: string;
  markPrice: string;
  onPlaceOrder?: (side: Side, size: string, limitPrice: string) => void;
};

export function OrderForm({
  marketSymbol,
  markPrice,
  onPlaceOrder,
}: OrderFormProps) {
  const [side, setSide] = useState<Side>('long');
  const [size, setSize] = useState('');
  const [limitPrice, setLimitPrice] = useState(markPrice);

  const handlePlace = () => {
    if (size && limitPrice) onPlaceOrder?.(side, size, limitPrice);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.market}>{marketSymbol}</Text>
      <View style={styles.sideTabs}>
        <Pressable
          onPress={() => setSide('long')}
          style={[
            styles.sideTab,
            side === 'long' && styles.sideTabLong,
          ]}
        >
          <Text
            style={[
              styles.sideTabText,
              side === 'long' && styles.sideTabTextActiveLong,
            ]}
          >
            Long
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setSide('short')}
          style={[
            styles.sideTab,
            side === 'short' && styles.sideTabShort,
          ]}
        >
          <Text
            style={[
              styles.sideTabText,
              side === 'short' && styles.sideTabTextActiveShort,
            ]}
          >
            Short
          </Text>
        </Pressable>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Size</Text>
        <TextInput
          style={styles.input}
          value={size}
          onChangeText={setSize}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Limit price (USDC)</Text>
        <TextInput
          style={styles.input}
          value={limitPrice}
          onChangeText={setLimitPrice}
          placeholder={markPrice}
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
        />
      </View>
      <Text style={styles.hint}>Mark: ${markPrice}</Text>
      <Pressable
        onPress={handlePlace}
        style={[
          styles.button,
          side === 'long' ? styles.buttonLong : styles.buttonShort,
        ]}
      >
        <Text style={styles.buttonText}>
          {side === 'long' ? 'Buy' : 'Sell'} {marketSymbol}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  market: {
    ...typography.headline,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sideTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sideTab: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  sideTabLong: {
    backgroundColor: colors.longMuted,
    borderWidth: 1,
    borderColor: colors.long,
  },
  sideTabShort: {
    backgroundColor: colors.shortMuted,
    borderWidth: 1,
    borderColor: colors.short,
  },
  sideTabText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  sideTabTextActiveLong: {
    color: colors.long,
    fontWeight: '700',
  },
  sideTabTextActiveShort: {
    color: colors.short,
    fontWeight: '700',
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    ...typography.caption2,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  button: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  buttonLong: {
    backgroundColor: colors.long,
  },
  buttonShort: {
    backgroundColor: colors.short,
  },
  buttonText: {
    ...typography.headline,
    color: '#000',
  },
});
