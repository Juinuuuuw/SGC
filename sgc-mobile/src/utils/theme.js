// src/utils/theme.js
export const colors = {
  primary: '#1a237e',       // Azul escuro SGC
  primaryLight: '#3949ab',
  primaryDark: '#0d1456',
  accent: '#ff6f00',        // Laranja para destaques
  accentLight: '#ffa040',
  success: '#2e7d32',
  successLight: '#e8f5e9',
  danger: '#c62828',
  dangerLight: '#ffebee',
  warning: '#f57f17',
  warningLight: '#fff8e1',
  info: '#0277bd',
  infoLight: '#e1f5fe',
  white: '#ffffff',
  background: '#f4f6fb',
  card: '#ffffff',
  border: '#e0e0e0',
  text: '#1a1a2e',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  surface: '#fafafa',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
};
