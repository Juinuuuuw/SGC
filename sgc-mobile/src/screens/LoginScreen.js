// src/screens/LoginScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  Image, Animated, Easing,
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

  // ═══ ANIMAÇÕES ═══
  const logoSlideY = useRef(new Animated.Value(-300)).current;   // Logo começa de cima
  const logoOpacity = useRef(new Animated.Value(0)).current;      // Logo começa invisível
  const cardSlideY = useRef(new Animated.Value(100)).current;     // Card começa de baixo
  const cardOpacity = useRef(new Animated.Value(0)).current;      // Card começa invisível
  const configOpacity = useRef(new Animated.Value(0)).current;    // Config começa invisível
  const versionOpacity = useRef(new Animated.Value(0)).current;   // Versão começa invisível

  useEffect(() => {
    // Animação de entrada ao montar a tela
    Animated.sequence([
      // Pequena pausa inicial
      Animated.delay(200),
      
      // Logo desce e aparece
      Animated.parallel([
        Animated.timing(logoSlideY, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      
      // Card sobe e aparece
      Animated.parallel([
        Animated.timing(cardSlideY, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      
      // Config e versão aparecem
      Animated.parallel([
        Animated.timing(configOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(versionOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !senha.trim()) {
      Alert.alert('Atenção', 'Preencha e-mail e senha para continuar.');
      return;
    }
    setLoading(true);
    try {
      const result = await login(email.trim(), senha);
      if (result.success) {
        // Anima a saída antes de navegar
        Animated.parallel([
          Animated.timing(logoOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(cardOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(configOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(versionOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
        // O redirecionamento é feito pelo AuthContext após o login
      } else {
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
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView 
        contentContainerStyle={styles.scroll} 
        keyboardShouldPersistTaps="handled"
      >
        {/* Área da logo — Animada */}
        <Animated.View 
          style={[
            styles.logoArea,
            { 
              opacity: logoOpacity,
              transform: [{ translateY: logoSlideY }]
            }
          ]}
        >
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logoTitle}>SGC</Text>
          <Text style={styles.logoSub}>Sistema de Gestão Comercial</Text>
        </Animated.View>

        {/* Card de login — Animado */}
        <Animated.View 
          style={[
            styles.card,
            { 
              opacity: cardOpacity,
              transform: [{ translateY: cardSlideY }]
            }
          ]}
        >
          <Text style={styles.cardTitle}>Acessar o sistema</Text>

          <Input
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Senha"
            value={senha}
            onChangeText={setSenha}
            placeholder="••••••••"
            secureTextEntry
          />

          <TouchableOpacity style={styles.forgotBtn}>
            <Text style={styles.forgotTxt}>Esqueceu a senha?</Text>
          </TouchableOpacity>

          <Button
            title="Entrar"
            onPress={handleLogin}
            loading={loading}
            style={styles.loginBtn}
            textStyle={styles.loginBtnText}
          />
        </Animated.View>

        {/* Configuração do servidor — Animado */}
        <Animated.View style={{ opacity: configOpacity }}>
          <TouchableOpacity 
            onPress={() => setShowConfig(!showConfig)} 
            style={styles.configToggle}
          >
            <Text style={styles.configToggleTxt}>
              ⚙️ {showConfig ? 'Ocultar' : 'Configurar'} servidor
            </Text>
          </TouchableOpacity>

          {showConfig && (
            <View style={styles.configCard}>
              <Text style={styles.configLabel}>URL do Servidor</Text>
              <Text style={styles.configHint}>
                Ex: http://192.168.1.100/sgc/api
              </Text>
              <Input
                value={serverUrl}
                onChangeText={setServerUrl}
                placeholder="http://192.168.1.100/sgc/api"
                autoCapitalize="none"
                autoCorrect={false}
                icon="🔗"
              />
              <Button 
                title="Salvar endereço" 
                onPress={handleSaveConfig} 
                variant="outline"
                style={{ marginTop: spacing.sm }}
              />
            </View>
          )}
        </Animated.View>

        {/* Versão — Animado */}
        <Animated.Text 
          style={[
            styles.version,
            { opacity: versionOpacity }
          ]}
        >
          SGC Mobile v1.0
        </Animated.Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.background,
  },
  scroll: { 
    flexGrow: 1, 
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  
  // ═══ LOGO AREA ═══
  logoArea: { 
    alignItems: 'center', 
    paddingTop: 80,
    paddingBottom: spacing.xl,
    marginHorizontal: -spacing.lg,
    backgroundColor: '#3e1c67',
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    marginBottom: -20,
    ...shadow.lg,
  },
  
  // ═══ ÍCONE ═══
  logoImage: {
    width: 80,
    height: 80,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 8,
  },
  
  // ═══ SGC (branco) ═══
  logoTitle: { 
    fontSize: 36, 
    color: '#ffffff',
    fontWeight: '800', 
    letterSpacing: 3,
  },
  
  // ═══ Sistema de Gestão Comercial (amarelo) ═══
  logoSub: { 
    fontSize: fontSize.sm, 
    color: '#ffb700',
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  
  // ═══ CARD DE LOGIN ═══
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.lg,
    zIndex: 1,
  },
  cardTitle: {
    fontSize: fontSize.xl, 
    fontWeight: '700', 
    color: colors.text,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  
  // ═══ ESQUECEU SENHA ═══
  forgotBtn: {
    alignItems: 'flex-end',
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  forgotTxt: {
    color: '#3e1c67',
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  
  // ═══ BOTÃO ENTRAR ═══
  loginBtn: {
    backgroundColor: '#3e1c67',
    borderRadius: radius.sm,
    paddingVertical: 14,
    ...shadow.sm,
  },
  loginBtnText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  
  // ═══ CONFIG ═══
  configToggle: { 
    alignItems: 'center', 
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  configToggleTxt: { 
    color: colors.textSecondary, 
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  configCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  configLabel: { 
    color: colors.text, 
    fontSize: fontSize.sm, 
    fontWeight: '600', 
    marginBottom: spacing.xs,
  },
  configHint: { 
    color: colors.textMuted, 
    fontSize: fontSize.xs, 
    marginBottom: spacing.sm,
  },
  
  // ═══ VERSÃO ═══
  version: { 
    textAlign: 'center', 
    color: colors.textMuted, 
    fontSize: fontSize.xs, 
    marginTop: spacing.lg,
  },
});