import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WalletButton } from '@/components/WalletButton';
import { colors, spacing, typography } from '@/constants/Theme';

export default function HomeScreen() {
  const [connected, setConnected] = React.useState(false);
  const mockAddress = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const mockBalance = '1,250.00';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>Perpetual Futures</Text>
          <Text style={styles.subtitle}>
            Trade SOL-PERP with up to 10x leverage
          </Text>
        </View>

        <WalletButton
          onPress={() => setConnected((c) => !c)}
          connected={connected}
          address={connected ? mockAddress : undefined}
          balance={connected ? mockBalance : undefined}
        />

        {connected && (
          <View style={styles.stats}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Portfolio value</Text>
              <Text style={styles.statValue}>$1,250.00</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Available margin</Text>
              <Text style={styles.statValue}>$1,100.00</Text>
            </View>
          </View>
        )}

        {!connected && (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderTitle}>Connect your wallet</Text>
            <Text style={styles.placeholderText}>
              Use Phantom, Solflare, or any Solana wallet to trade perpetual
              futures. Connect above to get started.
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
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.xxl,
  },
  greeting: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  stats: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  statCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.sm,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    ...typography.title2,
    color: colors.text,
  },
  placeholder: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  placeholderTitle: {
    ...typography.headline,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  placeholderText: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
