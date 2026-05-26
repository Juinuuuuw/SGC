// src/screens/HomeScreen.js
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Animated, Easing,
  Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { getVendas, getCaixaAtivo, fecharCaixa } from '../services/api';
import { Button, Card, Input } from '../components/ui';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';

const FORMA_LABEL = {
  DINHEIRO:       { label: 'Dinheiro',  icon: 'cash-outline',           color: '#2e7d32' },
  CARTAO_DEBITO:  { label: 'Débito',    icon: 'card-outline',           color: '#0277bd' },
  CARTAO_CREDITO: { label: 'Crédito',   icon: 'card-outline',           color: '#4a148c' },
  PIX:            { label: 'Pix',       icon: 'phone-portrait-outline', color: '#ff8f00' },
};

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { qtdItens, total } = useCart();

  const [vendas, setVendas] = useState([]);
  const [caixa, setCaixa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Estados para Fechar Caixa ──
  const [modalFechar, setModalFechar] = useState(false);
  const [sangria, setSangria] = useState('0');
  const [valorRestante, setValorRestante] = useState('0');
  const [observacoes, setObservacoes] = useState('');
  const [fechando, setFechando] = useState(false);

  const now = new Date();
  const hora = now.getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  // ═══ ANIMAÇÕES ═══
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerSlideY = useRef(new Animated.Value(-50)).current;
  
  const carrinhoOpacity = useRef(new Animated.Value(0)).current;
  const carrinhoSlideY = useRef(new Animated.Value(-20)).current;
  
  const caixaOpacity = useRef(new Animated.Value(0)).current;
  const caixaScale = useRef(new Animated.Value(0.95)).current;
  
  const modulosOpacity = useRef(new Animated.Value(0)).current;
  const modulosSlideX = useRef(new Animated.Value(-30)).current;
  
  const statsOpacity = useRef(new Animated.Value(0)).current;
  const statsSlideY = useRef(new Animated.Value(30)).current;
  
  const formasOpacity = useRef(new Animated.Value(0)).current;
  const vendasOpacity = useRef(new Animated.Value(0)).current;

  // Anima ao montar a tela
  useEffect(() => {
    const animate = () => {
      Animated.sequence([
        // Header
        Animated.parallel([
          Animated.timing(headerOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(headerSlideY, {
            toValue: 0,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),

        // Carrinho + Caixa
        Animated.parallel([
          Animated.timing(carrinhoOpacity, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(carrinhoSlideY, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(caixaOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(caixaScale, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.back(1.1)),
            useNativeDriver: true,
          }),
        ]),

        // Módulos
        Animated.parallel([
          Animated.timing(modulosOpacity, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(modulosSlideX, {
            toValue: 0,
            duration: 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),

        // Stats
        Animated.parallel([
          Animated.timing(statsOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(statsSlideY, {
            toValue: 0,
            duration: 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),

        // Formas de pagamento + Vendas
        Animated.parallel([
          Animated.timing(formasOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(vendasOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    };

    // Pequeno delay para a navegação terminar
    const timer = setTimeout(animate, 100);
    return () => clearTimeout(timer);
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData();
  }, []));

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const hoje = now.toISOString().split('T')[0];
      const [vendasData, caixaData] = await Promise.allSettled([
        getVendas({ data: hoje }),
        getCaixaAtivo(),
      ]);

      if (vendasData.status === 'fulfilled') {
        const lista = Array.isArray(vendasData.value) ? vendasData.value : [];
        setVendas(lista);
      }
      if (caixaData.status === 'fulfilled') {
        const c = caixaData.value;
        setCaixa(c && c.id ? c : null);
      }
    } catch {
      // offline
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleConfirmarFechamento = async () => {
    if (!caixa) return;
    setFechando(true);
    try {
      const valSangria = parseFloat(sangria.replace(',', '.')) || 0;
      const valRestante = parseFloat(valorRestante.replace(',', '.')) || 0;
      const saldoFinalSistema = parseFloat(caixa.saldo_atual || 0);
      
      const res = await fecharCaixa(caixa.id, saldoFinalSistema, valSangria, valRestante, observacoes);
      if (res.success) {
        Alert.alert('Sucesso', 'Caixa fechado com sucesso!');
        setModalFechar(false);
        fetchData(true);
      } else {
        Alert.alert('Erro', res.message || 'Erro ao fechar caixa');
      }
    } catch {
      Alert.alert('Erro', 'Falha na conexão com o servidor.');
    } finally {
      setFechando(false);
    }
  };

  const totalVendas = vendas.reduce((a, v) => a + parseFloat(v.valor_total || 0) - parseFloat(v.valor_desconto || 0), 0);
  const qtdVendas = vendas.length;
  const ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0;
  const vendasCanceladas = vendas.filter(v => v.status === 'CANCELADA').length;

  const porForma = vendas
    .filter(v => v.status !== 'CANCELADA')
    .reduce((acc, v) => {
      const fp = v.forma_pagamento || 'OUTROS';
      if (!acc[fp]) acc[fp] = 0;
      acc[fp] += parseFloat(v.valor_total || 0) - parseFloat(v.valor_desconto || 0);
      return acc;
    }, {});

  const confirmLogout = () => {
    Alert.alert('Sair', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header Animado ── */}
      <Animated.View 
        style={[
          styles.header,
          { 
            opacity: headerOpacity,
            transform: [{ translateY: headerSlideY }]
          }
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.saudacao}>
            {saudacao}, <Text style={styles.saudacaoNome}>{user?.nome?.split(' ')[0] || 'usuário'}</Text>
          </Text>
          <Text style={styles.data}>
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <TouchableOpacity style={styles.avatarBtn} onPress={confirmLogout}>
          <Ionicons name="person-circle-outline" size={36} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchData(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Carrinho Ativo Animado ── */}
        {qtdItens > 0 && (
          <Animated.View 
            style={{
              opacity: carrinhoOpacity,
              transform: [{ translateY: carrinhoSlideY }]
            }}
          >
            <TouchableOpacity 
              style={styles.carrinhoAlert} 
              onPress={() => navigation.navigate('PDV')}
              activeOpacity={0.9}
            >
              <View style={styles.carrinhoIconBox}>
                <Ionicons name="cart" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.carrinhoTitle}>
                  {qtdItens} {qtdItens === 1 ? 'item' : 'itens'} no carrinho
                </Text>
                <Text style={styles.carrinhoSub}>
                  Total: R$ {total.toFixed(2).replace('.', ',')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.accent} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Status do Caixa Animado ── */}
        <Animated.View 
          style={[
            styles.caixaCard, 
            caixa ? styles.caixaAberto : styles.caixaFechado,
            {
              opacity: caixaOpacity,
              transform: [{ scale: caixaScale }]
            }
          ]}
        >
          <View style={[styles.caixaIconBox, { backgroundColor: caixa ? colors.successLight : colors.warningLight }]}>
            <MaterialCommunityIcons 
              name={caixa ? "cash-register" : "cash-remove"} 
              size={28} 
              color={caixa ? colors.success : colors.warning} 
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.caixaLabel, { color: caixa ? colors.success : colors.warning }]}>
              {caixa ? 'Caixa aberto' : 'Nenhum caixa aberto'}
            </Text>
            {caixa && (
              <Text style={styles.caixaSaldo}>
                Saldo: R$ {parseFloat(caixa.saldo_atual || 0).toFixed(2).replace('.', ',')}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {caixa ? (
              <>
                <TouchableOpacity
                  style={[styles.caixaBtn, { backgroundColor: colors.danger, paddingHorizontal: 12 }]}
                  onPress={() => {
                    setSangria('0');
                    setValorRestante('0');
                    setObservacoes('');
                    setModalFechar(true);
                  }}
                >
                  <Text style={styles.caixaBtnTxt}>Fechar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.caixaBtn, { backgroundColor: colors.primary }]}
                  onPress={() => navigation.navigate('PDV')}
                >
                  <Text style={styles.caixaBtnTxt}>PDV</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.caixaBtn, { backgroundColor: colors.success }]}
                onPress={() => navigation.navigate('PDV')}
              >
                <Text style={styles.caixaBtnTxt}>Abrir Caixa</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* ── Módulos Animados ── */}
        <Animated.View 
          style={{
            opacity: modulosOpacity,
            transform: [{ translateX: modulosSlideX }]
          }}
        >
          <Text style={styles.sectionTitle}>Acesso rápido</Text>
          <View style={styles.modulosGrid}>
            <TouchableOpacity
              style={[styles.moduloCard, styles.moduloPDV]}
              onPress={() => navigation.navigate('PDV')}
              activeOpacity={0.85}
            >
              <View style={[styles.moduloIconCircle, { backgroundColor: colors.primaryLight + '20' }]}>
                <MaterialCommunityIcons name="cart-outline" size={26} color={colors.primary} />
              </View>
              <Text style={styles.moduloTitle}>PDV</Text>
              <Text style={styles.moduloSub}>Ponto de Venda</Text>
              {qtdItens > 0 && (
                <View style={styles.moduloBadge}>
                  <Text style={styles.moduloBadgeTxt}>{qtdItens} no carrinho</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.moduloCard, styles.moduloConferencia]}
              onPress={() => navigation.navigate('Conferencia')}
              activeOpacity={0.85}
            >
              <View style={[styles.moduloIconCircle, { backgroundColor: colors.accent + '20' }]}>
                <FontAwesome5 name="clipboard-check" size={22} color={colors.accentDark} />
              </View>
              <Text style={styles.moduloTitle}>Conferência</Text>
              <Text style={styles.moduloSub}>Recebimento</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.moduloCard, { borderTopWidth: 3, borderTopColor: '#f57f17' }]}
              onPress={() => navigation.navigate('Mesas')}
              activeOpacity={0.85}
            >
              <View style={[styles.moduloIconCircle, { backgroundColor: '#fff8e1' }]}>
                <MaterialCommunityIcons name="table-furniture" size={26} color="#f57f17" />
              </View>
              <Text style={styles.moduloTitle}>Mesas</Text>
              <Text style={styles.moduloSub}>Restaurante</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Resumo de Vendas ── */}
        <Animated.View 
          style={{
            opacity: statsOpacity,
            transform: [{ translateY: statsSlideY }]
          }}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Vendas de hoje</Text>
            <TouchableOpacity onPress={() => fetchData(true)} style={styles.refreshBtn}>
              <Ionicons name="refresh" size={16} color={colors.primary} />
              <Text style={styles.refreshTxt}>Atualizar</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingTxt}>Carregando vendas...</Text>
          </View>
        ) : (
          <>
            {/* Stats Cards Animados */}
            <Animated.View 
              style={[
                styles.statsGrid,
                {
                  opacity: statsOpacity,
                  transform: [{ translateY: statsSlideY }]
                }
              ]}
            >
              <StatCard
                icon="wallet-outline"
                label="Total do dia"
                value={`R$ ${totalVendas.toFixed(2).replace('.', ',')}`}
                color="#2e7d32"
              />
              <StatCard
                icon="receipt-outline"
                label="Vendas"
                value={String(qtdVendas)}
                color={colors.primary}
              />
              <StatCard
                icon="analytics-outline"
                label="Ticket médio"
                value={`R$ ${ticketMedio.toFixed(2).replace('.', ',')}`}
                color="#0277bd"
              />
              {vendasCanceladas > 0 && (
                <StatCard
                  icon="close-circle-outline"
                  label="Canceladas"
                  value={String(vendasCanceladas)}
                  color="#c62828"
                />
              )}
            </Animated.View>

            {/* Formas de Pagamento Animadas */}
            {Object.keys(porForma).length > 0 && (
              <Animated.View style={{ opacity: formasOpacity }}>
                <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>
                  Por forma de pagamento
                </Text>
                <View style={styles.formasContainer}>
                  {Object.entries(porForma).map(([fp, valor]) => {
                    const info = FORMA_LABEL[fp] || { label: fp, icon: 'ellipse-outline', color: colors.textSecondary };
                    return (
                      <View key={fp} style={styles.formaRow}>
                        <View style={[styles.formaIconCircle, { backgroundColor: info.color + '15' }]}>
                          <Ionicons name={info.icon} size={18} color={info.color} />
                        </View>
                        <Text style={styles.formaLabel}>{info.label}</Text>
                        <Text style={[styles.formaValor, { color: info.color }]}>
                          R$ {valor.toFixed(2).replace('.', ',')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Animated.View>
            )}

            {/* Lista de Vendas Animada */}
            {vendas.length > 0 ? (
              <Animated.View style={{ opacity: vendasOpacity }}>
                <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>
                  Últimas vendas
                </Text>
                {vendas.slice(0, 5).map((venda) => (
                  <VendaCard key={venda.id} venda={venda} />
                ))}
                {vendas.length > 5 && (
                  <Text style={styles.maisVendas}>
                    + {vendas.length - 5} vendas anteriores
                  </Text>
                )}
              </Animated.View>
            ) : (
              <Animated.View style={[styles.emptyBox, { opacity: vendasOpacity }]}>
                <Ionicons name="storefront-outline" size={56} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Nenhuma venda hoje</Text>
                <Text style={styles.emptySub}>As vendas realizadas aparecerão aqui</Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => navigation.navigate('PDV')}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.white} />
                  <Text style={styles.emptyBtnTxt}>Ir para o PDV</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════════════════
          Modal: Fechar Caixa
      ══════════════════════════════════════════════════════ */}
      <Modal
        visible={modalFechar}
        transparent
        animationType="fade"
        onRequestClose={() => setModalFechar(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderClose}>
              <Text style={styles.modalTitle}>Fechar Caixa</Text>
              <TouchableOpacity onPress={() => setModalFechar(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ width: '100%' }} contentContainerStyle={{ gap: spacing.md }}>
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxLabel}>Saldo Atual (Sistema)</Text>
                <Text style={styles.infoBoxVal}>R$ {parseFloat(caixa?.saldo_atual || 0).toFixed(2).replace('.', ',')}</Text>
              </View>

              <Input
                label="Sangria (Retirada)"
                placeholder="0,00"
                keyboardType="decimal-pad"
                value={sangria}
                onChangeText={setSangria}
                icon={<Ionicons name="exit-outline" size={20} color={colors.danger} />}
              />

              <Input
                label="Valor Restante no Caixa"
                placeholder="0,00"
                keyboardType="decimal-pad"
                value={valorRestante}
                onChangeText={setValorRestante}
                icon={<Ionicons name="wallet-outline" size={20} color={colors.success} />}
              />

              <Input
                label="Observações"
                placeholder="Opcional..."
                multiline
                numberOfLines={3}
                value={observacoes}
                onChangeText={setObservacoes}
                style={{ height: 80, textAlignVertical: 'top' }}
              />

              <Button
                title={fechando ? 'Fechando...' : 'Confirmar Fechamento'}
                variant="danger"
                onPress={handleConfirmarFechamento}
                loading={fechando}
                style={{ marginTop: spacing.sm }}
              />
              
              <Button
                title="Cancelar"
                variant="ghost"
                onPress={() => setModalFechar(false)}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── StatCard ──────────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <View style={[sc.card, { borderLeftColor: color }]}>
      <View style={[sc.iconBox, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={sc.label}>{label}</Text>
      <Text style={[sc.value, { color }]}>{value}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1, minWidth: '45%',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderLeftWidth: 3,
    ...shadow.sm,
    marginBottom: spacing.sm,
  },
  iconBox: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  value: {
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
});

// ── VendaCard ─────────────────────────────────────────────────
function VendaCard({ venda }) {
  const info = FORMA_LABEL[venda.forma_pagamento] || {
    label: venda.forma_pagamento || 'Outros',
    icon: 'ellipse-outline',
    color: colors.textSecondary,
  };
  const valor = (parseFloat(venda.valor_total || 0) - parseFloat(venda.valor_desconto || 0)).toFixed(2);
  const hora = venda.data_venda
    ? new Date(venda.data_venda).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const cancelada = venda.status === 'CANCELADA';

  return (
    <View style={[vc.card, cancelada && vc.cancelada]}>
      <View style={[vc.iconCircle, { backgroundColor: cancelada ? colors.dangerLight : info.color + '15' }]}>
        <Ionicons
          name={cancelada ? 'close-circle' : info.icon}
          size={18}
          color={cancelada ? colors.danger : info.color}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={vc.nome}>
          Venda #{venda.id}
          {venda.cliente_nome ? ` · ${venda.cliente_nome}` : ''}
        </Text>
        <Text style={vc.sub}>{info.label} · {hora}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {cancelada ? (
          <Text style={[vc.valor, { color: colors.danger }]}>CANCELADA</Text>
        ) : (
          <>
            <Text style={[vc.valor, { color: colors.text }]}>
              R$ {valor.replace('.', ',')}
            </Text>
            {venda.valor_desconto > 0 && (
              <Text style={vc.desc}>desc. R$ {parseFloat(venda.valor_desconto).toFixed(2)}</Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}
const vc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    ...shadow.sm,
  },
  cancelada: { opacity: 0.5 },
  iconCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  nome: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  sub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  valor: { fontSize: fontSize.md, fontWeight: '800' },
  desc: { fontSize: fontSize.xs, color: colors.textMuted },
});

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.primary,
  },
  saudacao: {
    fontSize: fontSize.lg, fontWeight: '600', color: 'rgba(255,255,255,0.9)',
  },
  saudacaoNome: {
    fontWeight: '800', color: colors.accent,
  },
  data: {
    fontSize: fontSize.xs, color: 'rgba(255,255,255,0.6)',
    marginTop: 2, textTransform: 'capitalize',
  },
  avatarBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },

  scroll: { padding: spacing.md, paddingBottom: spacing.xl + 20 },

  // Carrinho
  carrinhoAlert: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.accent + '12',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent + '30',
    marginBottom: spacing.md,
  },
  carrinhoIconBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accent + '20',
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  carrinhoTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.accentDark },
  carrinhoSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },

  // Caixa
  caixaCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  caixaAberto: { backgroundColor: colors.successLight, borderWidth: 1, borderColor: colors.success + '30' },
  caixaFechado: { backgroundColor: colors.warningLight, borderWidth: 1, borderColor: colors.warning + '30' },
  caixaIconBox: {
    width: 48, height: 48, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  caixaLabel: { fontSize: fontSize.sm, fontWeight: '700' },
  caixaSaldo: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  caixaBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.sm,
  },
  caixaBtnTxt: { color: colors.white, fontSize: fontSize.xs, fontWeight: '700' },

  // Seção
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg, fontWeight: '800', color: colors.text,
    marginBottom: spacing.sm,
  },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4, marginBottom: spacing.sm,
  },
  refreshTxt: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },

  // Módulos
  modulosGrid: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md,
  },
  moduloCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  moduloPDV: { borderTopWidth: 3, borderTopColor: colors.primary },
  moduloConferencia: { borderTopWidth: 3, borderTopColor: colors.accent },
  moduloIconCircle: {
    width: 48, height: 48, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  moduloTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  moduloSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  moduloBadge: {
    marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.accent + '20',
    alignSelf: 'flex-start',
  },
  moduloBadgeTxt: { fontSize: fontSize.xs, color: colors.accentDark, fontWeight: '600' },

  // Stats
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    marginBottom: spacing.xs,
  },

  // Formas de pagamento
  formasContainer: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.sm,
  },
  formaRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  formaIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  formaLabel: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  formaValor: { fontSize: fontSize.md, fontWeight: '800' },

  // Loading
  loadingBox: {
    alignItems: 'center', padding: spacing.xxl, gap: spacing.sm,
  },
  loadingTxt: { fontSize: fontSize.sm, color: colors.textSecondary },

  // Empty
  emptyBox: {
    alignItems: 'center', paddingVertical: spacing.xxl,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    ...shadow.sm,
  },
  emptyTitle: {
    fontSize: fontSize.lg, fontWeight: '700', color: colors.text,
    marginTop: spacing.md,
  },
  emptySub: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    marginTop: spacing.xs, marginBottom: spacing.lg,
  },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
  },
  emptyBtnTxt: {
    color: colors.white, fontSize: fontSize.sm, fontWeight: '700',
  },

  // Mais vendas
  maisVendas: {
    textAlign: 'center', fontSize: fontSize.xs,
    color: colors.textMuted, paddingVertical: spacing.sm,
  },

  // Modal Fechar Caixa
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.white, borderRadius: radius.xl,
    padding: spacing.lg, width: '100%', maxHeight: '80%',
    ...shadow.lg, gap: spacing.md,
  },
  modalHeaderClose: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.xs,
  },
  infoBox: {
    backgroundColor: colors.background, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  infoBoxLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  infoBoxVal: { fontSize: 24, fontWeight: '900', color: colors.primary, marginTop: 4 },
});