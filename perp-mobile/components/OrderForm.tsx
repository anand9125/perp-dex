import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/constants/Theme';

export type Side = 'long' | 'short';

type OrderFormProps = {
  marketSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  markPrice: string;
  initialSide?: Side;
  onPlaceOrder?: (side: Side, size: string, limitPrice: string) => void;
};

export function OrderForm({
  marketSymbol,
  baseAsset,
  quoteAsset,
  markPrice,
  initialSide = 'long',
  onPlaceOrder,
}: OrderFormProps) {
  const [side, setSide] = useState<Side>(initialSide);
  const [size, setSize] = useState('');
  const [limitPrice, setLimitPrice] = useState(markPrice);
  const [orderType] = useState<'Limit' | 'Market'>('Limit');
  const [tpSl, setTpSl] = useState(false);
  const [iceberg, setIceberg] = useState(false);

  useEffect(() => {
    setSide(initialSide);
  }, [initialSide]);

  const total = (parseFloat(size) * parseFloat(limitPrice || '0')).toFixed(2);
  const handleBbo = () => setLimitPrice(markPrice);
  const step = parseFloat(markPrice) < 1 ? 0.0001 : parseFloat(markPrice) < 100 ? 0.01 : 1;
  const handlePriceDown = () => setLimitPrice((Math.max(0, parseFloat(limitPrice || '0') - step)).toFixed(4));
  const handlePriceUp = () => setLimitPrice((parseFloat(limitPrice || '0') + step).toFixed(4));

  const handlePlace = () => {
    if (size && limitPrice) onPlaceOrder?.(side, size, limitPrice);
  };

  return (
    <View style={styles.container}>
      <View style={styles.sideTabs}>
        <Pressable
          onPress={() => setSide('long')}
          style={[styles.sideTab, side === 'long' && styles.sideTabLong]}
        >
          <Text style={[styles.sideTabText, side === 'long' && styles.sideTabTextActiveLong]}>Buy</Text>
        </Pressable>
        <Pressable
          onPress={() => setSide('short')}
          style={[styles.sideTab, side === 'short' && styles.sideTabShort]}
        >
          <Text style={[styles.sideTabText, side === 'short' && styles.sideTabTextActiveShort]}>Sell</Text>
        </Pressable>
      </View>

      <View style={styles.orderTypeRow}>
        <Text style={styles.orderTypeLabel}>{orderType}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Price ({quoteAsset})</Text>
        <View style={styles.priceRow}>
          <Pressable style={styles.stepper} onPress={handlePriceDown}>
            <Text style={styles.stepperText}>−</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            value={limitPrice}
            onChangeText={setLimitPrice}
            placeholder={markPrice}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
          <Pressable style={styles.stepper} onPress={handlePriceUp}>
            <Text style={styles.stepperText}>+</Text>
          </Pressable>
          <Pressable style={styles.bboBtn} onPress={handleBbo}>
            <Text style={styles.bboText}>BBO</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Amount ({baseAsset})</Text>
        <View style={styles.priceRow}>
          <Pressable style={styles.stepper} onPress={() => setSize((Math.max(0, parseFloat(size || '0') - 0.1)).toFixed(2))}>
            <Text style={styles.stepperText}>−</Text>
          </Pressable>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={size}
            onChangeText={setSize}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
          <Pressable style={styles.stepper} onPress={() => setSize((parseFloat(size || '0') + 0.1).toFixed(2))}>
            <Text style={styles.stepperText}>+</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.label}>Total ({quoteAsset})</Text>
        <Text style={styles.totalValue}>{total}</Text>
      </View>

      <View style={styles.checkRow}>
        <Pressable onPress={() => setTpSl(!tpSl)} style={styles.checkbox}>
          <View style={[styles.checkboxBox, tpSl && styles.checkboxChecked]} />
          <Text style={styles.checkboxLabel}>TP/SL</Text>
        </Pressable>
        <Pressable onPress={() => setIceberg(!iceberg)} style={styles.checkbox}>
          <View style={[styles.checkboxBox, iceberg && styles.checkboxChecked]} />
          <Text style={styles.checkboxLabel}>Iceberg</Text>
        </Pressable>
      </View>

      <View style={styles.accountRow}>
        <Text style={styles.accountLabel}>Avbl</Text>
        <Text style={styles.accountValue}>0 {quoteAsset}</Text>
      </View>
      <View style={styles.accountRow}>
        <Text style={styles.accountLabel}>Max {side === 'long' ? 'Buy' : 'Sell'}</Text>
        <Text style={styles.accountValue}>0 {baseAsset}</Text>
      </View>
      <View style={styles.accountRow}>
        <Text style={styles.accountLabel}>Est. Fee</Text>
        <Text style={styles.accountValue}>— {baseAsset}</Text>
      </View>

      <Pressable
        onPress={handlePlace}
        style={[styles.button, side === 'long' ? styles.buttonLong : styles.buttonShort]}
      >
        <Text style={styles.buttonText}>
          {side === 'long' ? 'Buy' : 'Sell'} {baseAsset}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sideTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
  orderTypeRow: {
    marginBottom: spacing.sm,
  },
  orderTypeLabel: {
    ...typography.caption,
    color: colors.textSecondary,
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
    minWidth: 80,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepper: {
    width: 36,
    height: 40,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperText: {
    ...typography.headline,
    color: colors.text,
  },
  bboBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accentMuted,
    borderRadius: borderRadius.sm,
  },
  bboText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  totalValue: {
    ...typography.callout,
    color: colors.text,
  },
  checkRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.md,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
  },
  checkboxLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  accountLabel: {
    ...typography.caption2,
    color: colors.textMuted,
  },
  accountValue: {
    ...typography.caption2,
    color: colors.textSecondary,
  },
  button: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
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
