import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/constants/Theme';

type ChartPlaceholderProps = {
  symbol?: string;
  height?: number;
};

export function ChartPlaceholder({ symbol = 'SOL-PERP', height = 220 }: ChartPlaceholderProps) {
  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.placeholder}>
        <Text style={styles.label}>{symbol} Chart</Text>
        <Text style={styles.hint}>Price chart will load here</Text>
        <View style={styles.fakeChart}>
          {[40, 55, 45, 70, 60, 80, 75].map((p, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: `${p}%`,
                  backgroundColor: colors.accentMuted,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.caption2,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  fakeChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 120,
    gap: 4,
  },
  bar: {
    flex: 1,
    borderRadius: 4,
    minHeight: 4,
  },
});
