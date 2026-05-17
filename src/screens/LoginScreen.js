// src/screens/LoginScreen.js
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Input, Button } from '../components/ui';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import { setBaseUrl, getBaseUrl } from '../services/api';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !senha.trim()) {
      Alert.alert('Atenção', 'Preencha e-mail e senha para continuar.');
      return;
    }
    setLoading(true);
    try {
      const result = await login(email.trim(), senha);
      if (!result.success) {
        Alert.alert('Acesso negado', result.message || 'Credenciais inválidas.');
      }
    } catch (e) {
      Alert.alert('Erro de conexão', 'Verifique o endereço do servidor nas configurações.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!serverUrl.trim()) return;
    await setBaseUrl(serverUrl.trim());
    Alert.alert('Salvo', 'Endereço do servidor atualizado!');
    setShowConfig(false);
  };

  React.useEffect(() => {
    getBaseUrl().then(setServerUrl);
  }, []);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🏪</Text>
          </View>
          <Text style={styles.logoTitle}>SGC Mobile</Text>
          <Text style={styles.logoSub}>Sistema de Gestão Comercial</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Entrar</Text>

          <Input
            label="E-mail"
            icon="✉️"
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Senha"
            icon="🔒"
            value={senha}
            onChangeText={setSenha}
            placeholder="••••••••"
            secureTextEntry
          />

          <Button
            title="Entrar"
            onPress={handleLogin}
            loading={loading}
            style={{ marginTop: spacing.sm }}
          />
        </View>

        {/* Config servidor */}
        <TouchableOpacity onPress={() => setShowConfig(!showConfig)} style={styles.configBtn}>
          <Text style={styles.configTxt}>⚙️ Configurar servidor</Text>
        </TouchableOpacity>

        {showConfig && (
          <View style={styles.configCard}>
            <Text style={styles.configLabel}>URL do servidor</Text>
            <Input
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://192.168.1.100/sgc/api"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button title="Salvar" onPress={handleSaveConfig} variant="outline" />
            <Text style={styles.configHint}>
              Ex: http://IP_DO_SERVIDOR/sgc/api
            </Text>
          </View>
        )}

        <Text style={styles.version}>SGC Mobile v1.0</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  scroll: { flexGrow: 1, padding: spacing.lg, paddingTop: 72 },
  logoArea: { alignItems: 'center', marginBottom: spacing.xl },
  logoCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadow.md,
  },
  logoEmoji: { fontSize: 44 },
  logoTitle: { fontSize: fontSize.xxxl, color: colors.white, fontWeight: '800', letterSpacing: -0.5 },
  logoSub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.lg,
  },
  cardTitle: {
    fontSize: fontSize.xxl, fontWeight: '800', color: colors.text,
    marginBottom: spacing.lg,
  },
  configBtn: { alignItems: 'center', paddingVertical: spacing.md },
  configTxt: { color: 'rgba(255,255,255,0.65)', fontSize: fontSize.sm },
  configCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  configLabel: { color: colors.white, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.sm },
  configHint: { color: 'rgba(255,255,255,0.5)', fontSize: fontSize.xs, marginTop: spacing.sm, textAlign: 'center' },
  version: { textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: fontSize.xs, marginTop: spacing.xl },
});
