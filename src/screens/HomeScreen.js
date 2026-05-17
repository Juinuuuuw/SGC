// src/screens/HomeScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { getVendas, getCaixaAtivo } from '../services/api';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';

const FORMA_LABEL = {
  DINHEIRO:       { label: 'Dinheiro',  icon: '💵', color: colors.success },
  CARTAO_DEBITO:  { label: 'Débito',    icon: '💳', color: colors.info },
  CARTAO_CREDITO: { label: 'Crédito',   icon: '💎', color: colors.primary },
  PIX:            { label: 'Pix',       icon: '📱', color: colors.accent },
};

export default function HomeScreen({ navigation }) {
  const insets           = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { qtdItens, total } = useCart();

  const [vendas,      setVendas]      = useState([]);
  const [caixa,       setCaixa]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [logoutAlert, setLogoutAlert] = useState(false);

  const now      = new Date();
  const hora     = now.getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  // ── Carrega dados ao focar na tela ───────────────────────
  useFocusEffect(useCallback(() => {
    fetchData();
  }, []));

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const hoje = now.toISOString().split('T')[0]; // YYYY-MM-DD
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
      // sem conexão — mantém os dados anteriores
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Estatísticas das vendas ──────────────────────────────
  const totalVendas    = vendas.reduce((a, v) => a + parseFloat(v.valor_total || 0) - parseFloat(v.valor_desconto || 0), 0);
  const qtdVendas      = vendas.length;
  const ticketMedio    = qtdVendas > 0 ? totalVendas / qtdVendas : 0;
  const vendasCanceladas = vendas.filter(v => v.status === 'CANCELADA').length;

  // Agrupa por forma de pagamento
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

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.saudacao}>{saudacao}, {user?.nome?.split(' ')[0] || 'usuário'}! 👋</Text>
          <Text style={styles.data}>
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
        <TouchableOpacity style={styles.avatarBtn} onPress={confirmLogout}>
          <Text style={styles.avatarEmoji}>👤</Text>
        </TouchableOpacity>
      </View>

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
        {/* ── Alerta carrinho ativo ── */}
        {qtdItens > 0 && (
          <TouchableOpacity onPress={() => navigation.navigate('PDV')}>
            <View style={styles.carrinhoAlert}>
              <Text style={styles.carrinhoIcon}>🛒</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.carrinhoTitle}>
                  {qtdItens} {qtdItens === 1 ? 'item' : 'itens'} no carrinho
                </Text>
                <Text style={styles.carrinhoSub}>
                  R$ {total.toFixed(2).replace('.', ',')} · Toque para continuar
                </Text>
              </View>
              <Text style={styles.carrinhoArrow}>→</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Status do caixa ── */}
        <View style={[styles.caixaStatus, { borderColor: caixa ? colors.success : colors.warning }]}>
          <Text style={styles.caixaIcon}>{caixa ? '🟢' : '🔴'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.caixaLabel, { color: caixa ? colors.success : colors.warning }]}>
              {caixa ? `Caixa #${caixa.id} aberto` : 'Nenhum caixa aberto'}
            </Text>
            {caixa && (
              <Text style={styles.caixaSaldo}>
                Saldo: R$ {parseFloat(caixa.saldo_atual || 0).toFixed(2).replace('.', ',')}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.caixaBtn, { backgroundColor: caixa ? colors.primary : colors.success }]}
            onPress={() => navigation.navigate('PDV')}
          >
            <Text style={styles.caixaBtnTxt}>{caixa ? 'Abrir PDV' : 'Abrir Caixa'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Módulos ── */}
        <Text style={styles.sectionTitle}>Módulos</Text>
        <View style={styles.modulosGrid}>
          <TouchableOpacity
            style={[styles.modulo, { borderTopColor: colors.primary }]}
            onPress={() => navigation.navigate('PDV')}
            activeOpacity={0.85}
          >
            <Text style={styles.moduloIcon}>🏪</Text>
            <Text style={styles.moduloTitle}>PDV</Text>
            <Text style={styles.moduloSub}>Ponto de Venda</Text>
            {qtdItens > 0 && (
              <View style={[styles.moduloBadge, { backgroundColor: colors.accent }]}>
                <Text style={styles.moduloBadgeTxt}>{qtdItens} no carrinho</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modulo, { borderTopColor: colors.accent }]}
            onPress={() => navigation.navigate('Conferencia')}
            activeOpacity={0.85}
          >
            <Text style={styles.moduloIcon}>📦</Text>
            <Text style={styles.moduloTitle}>Conferência</Text>
            <Text style={styles.moduloSub}>Recebimento</Text>
          </TouchableOpacity>
        </View>

        {/* ── Resumo do dia ── */}
        <View style={styles.resumoHeader}>
          <Text style={styles.sectionTitle}>Vendas de hoje</Text>
          <TouchableOpacity onPress={() => fetchData(true)}>
            <Text style={styles.refreshBtn}>🔄 Atualizar</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingTxt}>Carregando vendas...</Text>
          </View>
        ) : (
          <>
            {/* Cards de stats */}
            <View style={styles.statsGrid}>
              <StatCard
                icon="💰" label="Total do dia"
                value={`R$ ${totalVendas.toFixed(2).replace('.', ',')}`}
                color={colors.success}
              />
              <StatCard
                icon="🛒" label="Vendas"
                value={String(qtdVendas)}
                color={colors.primary}
              />
              <StatCard
                icon="📊" label="Ticket médio"
                value={`R$ ${ticketMedio.toFixed(2).replace('.', ',')}`}
                color={colors.info}
              />
              {vendasCanceladas > 0 && (
                <StatCard
                  icon="❌" label="Canceladas"
                  value={String(vendasCanceladas)}
                  color={colors.danger}
                />
              )}
            </View>

            {/* Por forma de pagamento */}
            {Object.keys(porForma).length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>Por forma de pagamento</Text>
                {Object.entries(porForma).map(([fp, valor]) => {
                  const info = FORMA_LABEL[fp] || { label: fp, icon: '💰', color: colors.textSecondary };
                  return (
                    <View key={fp} style={styles.formaRow}>
                      <Text style={styles.formaIcon}>{info.icon}</Text>
                      <Text style={styles.formaLabel}>{info.label}</Text>
                      <Text style={[styles.formaValor, { color: info.color }]}>
                        R$ {valor.toFixed(2).replace('.', ',')}
                      </Text>
                    </View>
                  );
                })}
              </>
            )}

            {/* Lista das vendas */}
            {vendas.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>Últimas vendas</Text>
                {vendas.slice(0, 20).map((venda) => (
                  <VendaCard key={venda.id} venda={venda} />
                ))}
                {vendas.length > 20 && (
                  <Text style={styles.maisVendas}>+ {vendas.length - 20} vendas mais antigas</Text>
                )}
              </>
            ) : (
              <View style={styles.emptyVendas}>
                <Text style={styles.emptyIcon}>🏪</Text>
                <Text style={styles.emptyTxt}>Nenhuma venda registrada hoje</Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => navigation.navigate('PDV')}
                >
                  <Text style={styles.emptyBtnTxt}>Ir para o PDV</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── StatCard ──────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <View style={[sc.card, { borderLeftColor: color }]}>
      <Text style={sc.icon}>{icon}</Text>
      <Text style={sc.label}>{label}</Text>
      <Text style={[sc.value, { color }]}>{value}</Text>
    </View>
  );
}
const sc = StyleSheet.create({
  card: {
    flex: 1, minWidth: '45%', backgroundColor: colors.white,
    borderRadius: radius.md, padding: spacing.sm,
    borderLeftWidth: 4, ...shadow.sm, marginBottom: spacing.sm,
  },
  icon:  { fontSize: 22, marginBottom: 4 },
  label: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '500' },
  value: { fontSize: fontSize.lg, fontWeight: '800', marginTop: 2 },
});

// ── VendaCard ─────────────────────────────────────────────
function VendaCard({ venda }) {
  const info   = FORMA_LABEL[venda.forma_pagamento] || { label: venda.forma_pagamento, icon: '💰', color: colors.textSecondary };
  const valor  = (parseFloat(venda.valor_total || 0) - parseFloat(venda.valor_desconto || 0)).toFixed(2);
  const hora   = venda.data_venda
    ? new Date(venda.data_venda).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const cancelada = venda.status === 'CANCELADA';

  return (
    <View style={[vc.card, cancelada && vc.cancelada]}>
      <View style={[vc.iconBox, { backgroundColor: info.color + '18' }]}>
        <Text style={vc.icon}>{cancelada ? '❌' : info.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={vc.nome}>
          Venda #{venda.id}
          {venda.cliente_nome ? ` · ${venda.cliente_nome}` : ''}
        </Text>
        <Text style={vc.sub}>{info.label} · {hora}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[vc.valor, { color: cancelada ? colors.danger : colors.text }]}>
          {cancelada ? 'CANCELADA' : `R$ ${valor.replace('.', ',')}`}
        </Text>
        {venda.valor_desconto > 0 && !cancelada && (
          <Text style={vc.desc}>desc. R$ {parseFloat(venda.valor_desconto).toFixed(2)}</Text>
        )}
      </View>
    </View>
  );
}
const vc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.sm, marginBottom: spacing.xs, ...shadow.sm,
  },
  cancelada: { opacity: 0.55 },
  iconBox: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  icon:  { fontSize: 20 },
  nome:  { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  sub:   { fontSize: fontSize.xs, color: colors.textSecondary },
  valor: { fontSize: fontSize.md, fontWeight: '800' },
  desc:  { fontSize: fontSize.xs, color: colors.textMuted },
});

// ── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    backgroundColor: colors.primary,
  },
  saudacao:  { fontSize: fontSize.lg, fontWeight: '800', color: colors.white },
  data:      { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.65)', marginTop: 2, textTransform: 'capitalize' },
  avatarBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 22 },

  scroll: { padding: spacing.md, paddingBottom: spacing.xl },

  // carrinho alert
  carrinhoAlert: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.accent + '18', borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1.5, borderColor: colors.accent, marginBottom: spacing.md,
  },
  carrinhoIcon:  { fontSize: 28, marginRight: spacing.sm },
  carrinhoTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.accent },
  carrinhoSub:   { fontSize: fontSize.xs, color: colors.textSecondary },
  carrinhoArrow: { fontSize: 22, color: colors.accent },

  // status caixa
  caixaStatus: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.sm, borderWidth: 1.5, marginBottom: spacing.md, ...shadow.sm,
  },
  caixaIcon:   { fontSize: 20, marginRight: spacing.sm },
  caixaLabel:  { fontSize: fontSize.sm, fontWeight: '700' },
  caixaSaldo:  { fontSize: fontSize.xs, color: colors.textSecondary },
  caixaBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    borderRadius: radius.sm,
  },
  caixaBtnTxt: { color: colors.white, fontSize: fontSize.xs, fontWeight: '700' },

  // módulos
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  modulosGrid:  { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  modulo: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, borderTopWidth: 4, ...shadow.sm,
  },
  moduloIcon:  { fontSize: 36, marginBottom: spacing.sm },
  moduloTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  moduloSub:   { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  moduloBadge: {
    marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.full, alignSelf: 'flex-start',
  },
  moduloBadgeTxt: { fontSize: fontSize.xs, color: colors.white, fontWeight: '700' },

  // resumo
  resumoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  refreshBtn:   { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },

  // forma de pagamento
  formaRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.sm, marginBottom: spacing.xs, ...shadow.sm,
  },
  formaIcon:  { fontSize: 20, marginRight: spacing.sm, width: 28 },
  formaLabel: { flex: 1, fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  formaValor: { fontSize: fontSize.md, fontWeight: '800' },

  // loading
  loadingBox: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  loadingTxt: { fontSize: fontSize.sm, color: colors.textSecondary },

  // empty
  emptyVendas: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyIcon:   { fontSize: 56, marginBottom: spacing.sm },
  emptyTxt:    { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.md },
  emptyBtn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, borderRadius: radius.full,
  },
  emptyBtnTxt: { color: colors.white, fontSize: fontSize.sm, fontWeight: '700' },

  maisVendas: { textAlign: 'center', fontSize: fontSize.xs, color: colors.textMuted, paddingVertical: spacing.sm },
});
