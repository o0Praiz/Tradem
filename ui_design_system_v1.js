/**
 * Module: ui_design_system_v1
 * Version: 1.0.0
 * Dependencies: config_env_v1
 * Provides: React Native component library, design tokens, theme system
 * Integration Points: Customer mobile app, contractor mobile app, admin dashboard
 * Last Updated: 2025-05-31
 */

import React from 'react';
import { StyleSheet, Dimensions } from 'react-native';

// =================================================================
// DESIGN TOKENS
// =================================================================

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Color Palette
export const colors = {
  // Primary Brand Colors
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',  // Main brand color
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },
  
  // Secondary Colors (Orange for contractors)
  secondary: {
    50: '#fff7ed',
    100: '#ffedd5',
    200: '#fed7aa',
    300: '#fdba74',
    400: '#fb923c',
    500: '#f97316',  // Contractor accent
    600: '#ea580c',
    700: '#c2410c',
    800: '#9a3412',
    900: '#7c2d12',
  },
  
  // Success (Green)
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  
  // Warning (Yellow)
  warning: {
    50: '#fefce8',
    100: '#fef9c3',
    200: '#fef08a',
    300: '#fde047',
    400: '#facc15',
    500: '#eab308',
    600: '#ca8a04',
    700: '#a16207',
    800: '#854d0e',
    900: '#713f12',
  },
  
  // Error (Red)
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  
  // Neutral Grays
  neutral: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
  
  // Special Colors
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
};

// Typography Scale
export const typography = {
  fontFamily: {
    regular: 'Inter-Regular',
    medium: 'Inter-Medium',
    semibold: 'Inter-SemiBold',
    bold: 'Inter-Bold',
  },
  
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },
  
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
  
  letterSpacing: {
    tight: -0.025,
    normal: 0,
    wide: 0.025,
  },
};

// Spacing Scale
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
};

// Border Radius
export const borderRadius = {
  none: 0,
  sm: 4,
  base: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

// Shadows
export const shadows = {
  sm: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  base: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
};

// =================================================================
// THEME SYSTEM
// =================================================================

export const lightTheme = {
  colors: {
    ...colors,
    background: colors.white,
    surface: colors.neutral[50],
    text: {
      primary: colors.neutral[900],
      secondary: colors.neutral[600],
      disabled: colors.neutral[400],
      inverse: colors.white,
    },
    border: colors.neutral[200],
    divider: colors.neutral[100],
  },
  ...typography,
  spacing,
  borderRadius,
  shadows,
};

export const darkTheme = {
  colors: {
    ...colors,
    background: colors.neutral[900],
    surface: colors.neutral[800],
    text: {
      primary: colors.white,
      secondary: colors.neutral[300],
      disabled: colors.neutral[500],
      inverse: colors.neutral[900],
    },
    border: colors.neutral[700],
    divider: colors.neutral[800],
  },
  ...typography,
  spacing,
  borderRadius,
  shadows,
};

// =================================================================
// COMPONENT STYLES
// =================================================================

export const componentStyles = {
  // Button Variants
  button: {
    base: {
      paddingHorizontal: spacing[6],
      paddingVertical: spacing[3],
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    
    sizes: {
      sm: {
        paddingHorizontal: spacing[4],
        paddingVertical: spacing[2],
        minHeight: 36,
      },
      md: {
        paddingHorizontal: spacing[6],
        paddingVertical: spacing[3],
        minHeight: 44,
      },
      lg: {
        paddingHorizontal: spacing[8],
        paddingVertical: spacing[4],
        minHeight: 52,
      },
    },
    
    variants: {
      primary: {
        backgroundColor: colors.primary[500],
      },
      secondary: {
        backgroundColor: colors.secondary[500],
      },
      outline: {
        backgroundColor: colors.transparent,
        borderWidth: 1,
        borderColor: colors.primary[500],
      },
      ghost: {
        backgroundColor: colors.transparent,
      },
      danger: {
        backgroundColor: colors.error[500],
      },
    },
  },
  
  // Input Field Styles
  input: {
    base: {
      borderWidth: 1,
      borderColor: colors.neutral[300],
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      fontSize: typography.fontSize.base,
      fontFamily: typography.fontFamily.regular,
      minHeight: 44,
    },
    
    states: {
      focused: {
        borderColor: colors.primary[500],
        borderWidth: 2,
      },
      error: {
        borderColor: colors.error[500],
        borderWidth: 2,
      },
      disabled: {
        backgroundColor: colors.neutral[100],
        borderColor: colors.neutral[200],
        color: colors.neutral[400],
      },
    },
  },
  
  // Card Styles
  card: {
    base: {
      backgroundColor: colors.white,
      borderRadius: borderRadius.lg,
      padding: spacing[4],
      ...shadows.base,
    },
    
    variants: {
      elevated: {
        ...shadows.md,
      },
      outlined: {
        borderWidth: 1,
        borderColor: colors.neutral[200],
        shadowOpacity: 0,
        elevation: 0,
      },
    },
  },
  
  // Badge Styles
  badge: {
    base: {
      paddingHorizontal: spacing[2],
      paddingVertical: spacing[1],
      borderRadius: borderRadius.full,
      alignSelf: 'flex-start',
    },
    
    variants: {
      success: {
        backgroundColor: colors.success[100],
      },
      warning: {
        backgroundColor: colors.warning[100],
      },
      error: {
        backgroundColor: colors.error[100],
      },
      info: {
        backgroundColor: colors.primary[100],
      },
      neutral: {
        backgroundColor: colors.neutral[100],
      },
    },
  },
};

// =================================================================
// RESPONSIVE BREAKPOINTS
// =================================================================

export const breakpoints = {
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
};

export const responsive = {
  isSmallScreen: screenWidth < breakpoints.sm,
  isMediumScreen: screenWidth >= breakpoints.sm && screenWidth < breakpoints.md,
  isLargeScreen: screenWidth >= breakpoints.md,
  
  // Responsive spacing
  spacing: (base) => {
    if (screenWidth < breakpoints.sm) return base * 0.8;
    if (screenWidth >= breakpoints.lg) return base * 1.2;
    return base;
  },
  
  // Responsive font size
  fontSize: (base) => {
    if (screenWidth < breakpoints.sm) return base * 0.9;
    if (screenWidth >= breakpoints.lg) return base * 1.1;
    return base;
  },
};

// =================================================================
// ANIMATION CONFIGURATIONS
// =================================================================

export const animations = {
  timing: {
    fast: 200,
    normal: 300,
    slow: 500,
  },
  
  easing: {
    linear: 'linear',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
  },
  
  // Common animation presets
  presets: {
    fadeIn: {
      from: { opacity: 0 },
      to: { opacity: 1 },
      duration: 300,
    },
    slideInUp: {
      from: { opacity: 0, translateY: 20 },
      to: { opacity: 1, translateY: 0 },
      duration: 300,
    },
    scaleIn: {
      from: { opacity: 0, scale: 0.9 },
      to: { opacity: 1, scale: 1 },
      duration: 200,
    },
  },
};

// =================================================================
// LAYOUT HELPERS
// =================================================================

export const layout = {
  // Safe area constants
  safeArea: {
    top: 44, // Status bar height
    bottom: 34, // Home indicator height on newer iPhones
  },
  
  // Common layout patterns
  container: {
    flex: 1,
    paddingHorizontal: spacing[4],
  },
  
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  column: {
    flexDirection: 'column',
  },
  
  // Header styles
  header: {
    height: 56,
    paddingHorizontal: spacing[4],
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
    ...shadows.sm,
  },
  
  // Tab bar styles
  tabBar: {
    height: 60,
    paddingBottom: spacing[2],
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
  },
};

// =================================================================
// ACCESSIBILITY HELPERS
// =================================================================

export const accessibility = {
  // Minimum touch target size
  minTouchTarget: 44,
  
  // Semantic labels for screen readers
  labels: {
    button: (action) => `${action} button`,
    input: (label) => `${label} input field`,
    link: (destination) => `Navigate to ${destination}`,
    image: (description) => `Image: ${description}`,
  },
  
  // Color contrast ratios
  contrastRatios: {
    normal: 4.5, // WCAG AA standard
    large: 3.0,  // WCAG AA for large text
  },
};

// =================================================================
// ICON SYSTEM
// =================================================================

export const iconSizes = {
  xs: 16,
  sm: 20,
  base: 24,
  lg: 32,
  xl: 40,
  '2xl': 48,
};

// =================================================================
// PLATFORM-SPECIFIC STYLES
// =================================================================

import { Platform } from 'react-native';

export const platformStyles = {
  // iOS specific styles
  ios: {
    headerButton: {
      fontSize: typography.fontSize.lg,
      fontWeight: '400',
    },
    tabBarLabel: {
      fontSize: typography.fontSize.xs,
      fontWeight: '600',
    },
  },
  
  // Android specific styles
  android: {
    headerButton: {
      fontSize: typography.fontSize.base,
      fontWeight: '500',
      textTransform: 'uppercase',
    },
    tabBarLabel: {
      fontSize: typography.fontSize.sm,
      fontWeight: '400',
    },
  },
  
  // Current platform styles
  current: Platform.select({
    ios: this?.ios || {},
    android: this?.android || {},
    default: {},
  }),
};

// =================================================================
// COMPONENT FACTORY HELPERS
// =================================================================

/**
 * Create styled component with theme support
 */
export const createStyledComponent = (baseStyles, variants = {}) => {
  return (variant = 'default', size = 'md', state = 'default') => {
    return {
      ...baseStyles.base,
      ...(baseStyles.sizes?.[size] || {}),
      ...(baseStyles.variants?.[variant] || {}),
      ...(baseStyles.states?.[state] || {}),
    };
  };
};

/**
 * Generate responsive styles
 */
export const createResponsiveStyle = (styles) => {
  const scaleFactor = responsive.isSmallScreen ? 0.9 : responsive.isLargeScreen ? 1.1 : 1;
  
  const responsiveStyles = {};
  Object.keys(styles).forEach(key => {
    if (typeof styles[key] === 'number' && (key.includes('padding') || key.includes('margin') || key.includes('fontSize'))) {
      responsiveStyles[key] = styles[key] * scaleFactor;
    } else {
      responsiveStyles[key] = styles[key];
    }
  });
  
  return responsiveStyles;
};

/**
 * Theme-aware style creator
 */
export const createThemedStyles = (styleFunction) => {
  return (theme = lightTheme) => {
    return StyleSheet.create(styleFunction(theme));
  };
};

// =================================================================
// EXPORT DEFAULT THEME
// =================================================================

export default {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  lightTheme,
  darkTheme,
  componentStyles,
  responsive,
  animations,
  layout,
  accessibility,
  iconSizes,
  platformStyles,
  breakpoints,
  
  // Utility functions
  createStyledComponent,
  createResponsiveStyle,
  createThemedStyles,
};

// =================================================================
// USAGE EXAMPLES
// =================================================================

/*
// Example 1: Using design tokens
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[50],
    padding: spacing[4],
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontFamily: typography.fontFamily.bold,
    color: colors.neutral[900],
    marginBottom: spacing[2],
  },
});

// Example 2: Using component styles
const buttonStyle = createStyledComponent(componentStyles.button);
const primaryButton = buttonStyle('primary', 'lg');

// Example 3: Using themed styles
const themedStyles = createThemedStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.base,
  },
  text: {
    color: theme.colors.text.primary,
    fontSize: theme.fontSize.base,
  },
}));

// Example 4: Responsive styles
const responsiveContainer = createResponsiveStyle({
  padding: spacing[4],
  fontSize: typography.fontSize.base,
});
*/