/**
 * Perp DEX Mobile – trading theme
 * Dark, high-contrast UI for perpetual futures
 */
export const colors = {
  // Surfaces
  background: '#0a0a0f',
  surface: '#12121a',
  surfaceElevated: '#1a1a24',
  card: '#16161f',
  cardBorder: 'rgba(255,255,255,0.06)',
  // Text
  text: '#f0f0f5',
  textSecondary: '#8b8b9e',
  textMuted: '#5c5c6e',
  // Trading
  long: '#00d395',
  longMuted: 'rgba(0, 211, 149, 0.2)',
  short: '#ff5c5c',
  shortMuted: 'rgba(255, 92, 92, 0.2)',
  // Accent & UI
  accent: '#00d4ff',
  accentMuted: 'rgba(0, 212, 255, 0.15)',
  border: 'rgba(255,255,255,0.08)',
  tabIconDefault: '#5c5c6e',
  tabIconSelected: '#00d4ff',
  // Status
  warning: '#f59e0b',
  success: '#00d395',
  error: '#ff5c5c',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const typography = {
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  title2: {
    fontSize: 22,
    fontWeight: '600' as const,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
  },
  callout: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
  },
  caption2: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
} as const;

export default { colors, spacing, borderRadius, typography };
