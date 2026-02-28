import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PositionCard, type PositionItem } from '@/components/PositionCard';
import { colors, spacing, typography } from '@/constants/Theme';

const MOCK_POSITIONS: PositionItem[] = [
  {
    symbol: 'SOL-PERP',
    side: 'long',
    size: '4.0',
    entryPrice: '240.00',
    markPrice: '245.32',
    pnl: 21.28,
    pnlPercent: 2.22,
  },
  {
    symbol: 'SOL-PERP',
    side: 'short',
    size: '2.0',
    entryPrice: '248.00',
    markPrice: '245.32',
    pnl: 5.36,
    pnlPercent: 1.08,
  },
];

export default function PositionsScreen() {
  const hasPositions = MOCK_POSITIONS.length > 0;
  const totalPnl = MOCK_POSITIONS.reduce((s, p) => s + p.pnl, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Positions</Text>
        {hasPositions && (
          <View style={styles.totalPnl}>
            <Text style={styles.totalPnlLabel}>Total PnL</Text>
            <Text
              style={[
                styles.totalPnlValue,
                totalPnl >= 0 ? styles.pnlLong : styles.pnlShort,
              ]}
            >
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} USDC
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {hasPositions ? (
          MOCK_POSITIONS.map((pos, i) => (
            <PositionCard key={`${pos.symbol}-${pos.side}-${i}`} position={pos} />
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No open positions</Text>
            <Text style={styles.emptyText}>
              Open a position from the Trade tab. Your positions will appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  totalPnl: {
    marginTop: spacing.sm,
  },
  totalPnlLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  totalPnlValue: {
    ...typography.title2,
    fontWeight: '700',
  },
  pnlLong: {
    color: colors.long,
  },
  pnlShort: {
    color: colors.short,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  empty: {
    padding: spacing.xxl,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    ...typography.headline,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
