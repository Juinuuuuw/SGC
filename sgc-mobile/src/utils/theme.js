// src/utils/theme.js
// Tema do SGC Mobile — alinhado ao sistema web

export const colors = {
  // ═══ COR PRINCIPAL (Roxo SGC) ═══
  primary: '#3e1c67',        // Roxo escuro SGC (cor principal)
  primaryLight: '#5a249c',   // Roxo médio (hover)
  primaryDark: '#2d1448',    // Roxo mais escuro
  
  // ═══ DESTAQUE (Amarelo SGC) ═══
  accent: '#ffb700',         // Amarelo SGC (cor-destaque)
  accentLight: '#ffd54f',    // Amarelo claro
  accentDark: '#ff8f00',     // Âmbar
  
  // ═══ FUNCIONAIS ═══
  success: '#2e7d32',
  successLight: '#e8f5e9',
  danger: '#c62828',
  dangerLight: '#ffebee',
  warning: '#f57f17',
  warningLight: '#fff8e1',
  info: '#0277bd',
  infoLight: '#e1f5fe',
  
  // ═══ SUPERFÍCIES ═══
  white: '#ffffff',
  background: '#f4f6f8',     // cor-fundo-conteudo
  card: '#ffffff',
  surface: '#fafafa',
  
  // ═══ SIDEBAR ═══
  sidebarBg: '#1e1e1e',      // cor-fundo-sidebar
  sidebarText: '#cccccc',    // cor-texto-sidebar
  sidebarBorder: '#333333',  // cor-borda
  
  // ═══ BORDAS ═══
  border: '#e9ecef',         // cor-borda-cinza
  borderLight: '#f0f0f0',
  
  // ═══ TEXTO ═══
  text: '#333333',           // cor-texto-principal
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  textLight: '#ffffff',
  
  // ═══ BOTÕES ═══
  buttonPrimary: '#1e99ee',  // Azul (Editar)
  buttonPrimaryHover: '#1a87d6',
  buttonDanger: '#e74c3c',   // Vermelho (Excluir)
  buttonDangerHover: '#c0392b',
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
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
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