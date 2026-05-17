// src/components/ui.js
import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInput,
} from 'react-native';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';

// ── Button ───────────────────────────────────────────────
export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, textStyle }) {
  const variantStyle = {
    primary: { bg: colors.primary, text: colors.white },
    accent: { bg: colors.accent, text: colors.white },
    success: { bg: colors.success, text: colors.white },
    danger: { bg: colors.danger, text: colors.white },
    outline: { bg: 'transparent', text: colors.primary, border: colors.primary },
    ghost: { bg: colors.background, text: colors.text },
  }[variant] || { bg: colors.primary, text: colors.white };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
      style={[
        btnStyles.base,
        { backgroundColor: variantStyle.bg },
        variantStyle.border && { borderWidth: 1.5, borderColor: variantStyle.border },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.text} size="small" />
      ) : (
        <>
          {icon && <Text style={{ color: variantStyle.text, fontSize: 18, marginRight: 8 }}>{icon}</Text>}
          <Text style={[btnStyles.text, { color: variantStyle.text }, textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const btnStyles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  text: { fontSize: fontSize.md, fontWeight: '700', letterSpacing: 0.3 },
});

// ── Card ─────────────────────────────────────────────────
export function Card({ children, style }) {
  return (
    <View style={[cardStyles.card, style]}>
      {children}
    </View>
  );
}
const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
});

// ── Input ────────────────────────────────────────────────
export function Input({ label, error, icon, style, inputStyle, ...props }) {
  return (
    <View style={[inputStyles.wrapper, style]}>
      {label && <Text style={inputStyles.label}>{label}</Text>}
      <View style={[inputStyles.inputRow, error && inputStyles.inputError]}>
        {icon && <Text style={inputStyles.icon}>{icon}</Text>}
        <TextInput
          style={[inputStyles.input, inputStyle]}
          placeholderTextColor={colors.textMuted}
          {...props}
        />
      </View>
      {error && <Text style={inputStyles.errorText}>{error}</Text>}
    </View>
  );
}
const inputStyles = StyleSheet.create({
  wrapper: { marginBottom: spacing.sm },
  label: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600', marginBottom: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  inputError: { borderColor: colors.danger },
  icon: { fontSize: 18, marginRight: spacing.sm, color: colors.textSecondary },
  input: { flex: 1, fontSize: fontSize.md, color: colors.text },
  errorText: { fontSize: fontSize.xs, color: colors.danger, marginTop: 4 },
});

// ── Badge ────────────────────────────────────────────────
export function Badge({ label, color = colors.primary }) {
  return (
    <View style={[badgeStyles.badge, { backgroundColor: color + '22' }]}>
      <Text style={[badgeStyles.text, { color }]}>{label}</Text>
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  text: { fontSize: fontSize.xs, fontWeight: '700' },
});

// ── EmptyState ───────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }) {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>{icon || '📭'}</Text>
      <Text style={emptyStyles.title}>{title || 'Nada aqui ainda'}</Text>
      {subtitle && <Text style={emptyStyles.subtitle}>{subtitle}</Text>}
    </View>
  );
}
const emptyStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  icon: { fontSize: 56, marginBottom: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center' },
});

// ── SectionHeader ─────────────────────────────────────────
export function SectionHeader({ title, action, onAction }) {
  return (
    <View style={shStyles.row}>
      <Text style={shStyles.title}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={shStyles.action}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const shStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  action: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
});
