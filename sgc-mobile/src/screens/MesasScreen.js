// src/screens/MesasScreen.js
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { useEmpresa }       from '../context/EmpresaContext';
import { getMesas, mesaPdvAction } from '../services/api';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import { Button } from '../components/ui';

const AUTO_REFRESH_MS = 30_000;

const STATUS_CONFIG = {
  livre:   { label: 'Livre',   bg: '#e8f5e9', border: '#2e7d32', text: '#2e7d32', dot: '#2e7d32' },
  ocupada: { label: 'Ocupada', bg: '#fff5f5', border: '#c62828', text: '#c62828', dot: '#c62828' },
  conta:   { label: 'Conta',   bg: '#fffbf0', border: '#f57f17', text: '#e65100', dot: '#f57f17' },
};

function calcTempo(dataISO) {
  if (!dataISO) return '';
  const diff = Date.now() - new Date(dataISO).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
}

function fmt(v) {
  return parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Card individual de mesa ───────────────────────────────
function MesaCard({ mesa, onPress }) {
  const cfg  = STATUS_CONFIG[mesa.status] || STATUS_CONFIG.livre;
  const tempo = calcTempo(mesa.aberta_em);
  const pulseAnim = useRef(null);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
      onPress={() => onPress(mesa)}
      activeOpacity={0.82}
    >
      {/* Número */}
      <Text style={styles.cardNumero}>{mesa.numero}</Text>

      {/* Nome */}
      {mesa.nome ? (
        <Text style={styles.cardNome} numberOfLines={1}>{mesa.nome}</Text>
      ) : null}

      {/* Badge de status */}
      <View style={[styles.statusBadge, { backgroundColor: cfg.border + '22' }]}>
        <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
        <Text style={[styles.statusLabel, { color: cfg.text }]}>{cfg.label}</Text>
      </View>

      {/* Info da conta aberta */}
      {mesa.status !== 'livre' && (
        <View style={styles.cardInfo}>
          {!!tempo && <Text style={styles.cardTempo}>{tempo}</Text>}
          {parseFloat(mesa.total_atual) > 0 && (
            <Text style={styles.cardTotal}>R$ {fmt(mesa.total_atual)}</Text>
          )}
        </View>
      )}

      {/* Capacidade */}
      <Text style={styles.cardCap}>👤 {mesa.capacidade}</Text>

      {/* Ícone pulsante para "conta solicitada" */}
      {mesa.status === 'conta' && (
        <Text style={styles.contaAlert}>⚠️</Text>
      )}
    </TouchableOpacity>
  );
}

// ════════════════════════════════════════════════════════════
//  MesasScreen
// ════════════════════════════════════════════════════════════
export default function MesasScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { empresa } = useEmpresa();

  const [mesas,     setMesas]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  // Modal de confirmação para abrir mesa livre
  const [modalAbrir, setModalAbrir] = useState(false);
  const [mesaSelecionada, setMesaSelecionada] = useState(null);
  const [abrindo, setAbrindo] = useState(false);

  const refreshTimer = useRef(null);

  // ── Carrega mesas ─────────────────────────────────────────
  const carregarMesas = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getMesas();
      setMesas(Array.isArray(data) ? data : []);
    } catch {
      // silencioso em refresh automático
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-refresh enquanto a tela está em foco
  useFocusEffect(
    useCallback(() => {
      carregarMesas();
      refreshTimer.current = setInterval(() => carregarMesas(true), AUTO_REFRESH_MS);
      return () => clearInterval(refreshTimer.current);
    }, [carregarMesas])
  );

  // ── Clique numa mesa ──────────────────────────────────────
  const handlePressMesa = useCallback((mesa) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (mesa.status === 'livre') {
      setMesaSelecionada(mesa);
      setModalAbrir(true);
    } else {
      // Vai direto para a tela de pedido
      navigation.navigate('MesaPedido', { mesa });
    }
  }, [navigation]);

  // ── Abrir mesa (cria venda em aberto) ─────────────────────
  const confirmarAbrirMesa = async () => {
    if (!mesaSelecionada) return;
    setAbrindo(true);
    try {
      const res = await mesaPdvAction({ acao: 'ABRIR', id_mesa: mesaSelecionada.id });
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setModalAbrir(false);
        // Navega para tela de pedido com a mesa recém-aberta
        const mesaAtualizada = { ...mesaSelecionada, status: 'ocupada', venda_id: res.id_venda };
        navigation.navigate('MesaPedido', { mesa: mesaAtualizada });
        // Recarrega o grid em background
        carregarMesas(true);
      } else {
        Alert.alert('Erro', res.message || 'Não foi possível abrir a mesa.');
      }
    } catch {
      Alert.alert('Erro de Conexão', 'Verifique a conexão com o servidor.');
    } finally {
      setAbrindo(false);
    }
  };

  // ── Estatísticas rápidas ──────────────────────────────────
  const livres   = mesas.filter(m => m.status === 'livre').length;
  const ocupadas = mesas.filter(m => m.status === 'ocupada').length;
  const contas   = mesas.filter(m => m.status === 'conta').length;

  // ── Render ────────────────────────────────────────────────
  if (loading && !refreshing) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingTxt}>Carregando mesas...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            🍽️ {empresa?.nome_fantasia || empresa?.razao_social || 'Restaurante'}
          </Text>
          <Text style={styles.headerSub}>
            {livres} livre{livres !== 1 ? 's' : ''} ·{' '}
            {ocupadas} ocupada{ocupadas !== 1 ? 's' : ''} ·{' '}
            {contas > 0 ? `${contas} conta solicitada${contas !== 1 ? 's' : ''} ⚠️` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => carregarMesas()} style={styles.refreshBtn}>
          <Text style={{ fontSize: 20 }}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* ── Legenda ────────────────────────────────────────── */}
      <View style={styles.legenda}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <View key={key} style={styles.legendaItem}>
            <View style={[styles.legendaDot, { backgroundColor: cfg.dot }]} />
            <Text style={styles.legendaTxt}>{cfg.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Grid ───────────────────────────────────────────── */}
      {mesas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 56, marginBottom: spacing.md }}>🪑</Text>
          <Text style={styles.emptyTitle}>Nenhuma mesa cadastrada</Text>
          <Text style={styles.emptySub}>
            Acesse o sistema web para cadastrar as mesas do restaurante.
          </Text>
        </View>
      ) : (
        <FlatList
          data={mesas}
          keyExtractor={m => String(m.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={styles.grid}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); carregarMesas(); }}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <MesaCard mesa={item} onPress={handlePressMesa} />
            </View>
          )}
        />
      )}

      {/* ══════════════════════════════════════════════════════
          Modal: Confirmar abertura de mesa
      ══════════════════════════════════════════════════════ */}
      <Modal
        visible={modalAbrir}
        transparent
        animationType="fade"
        onRequestClose={() => setModalAbrir(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🍽️</Text>
            <Text style={styles.modalTitle}>
              Abrir {mesaSelecionada?.nome || `Mesa ${mesaSelecionada?.numero}`}?
            </Text>
            <Text style={styles.modalSub}>
              Isso criará uma conta em aberto para esta mesa.
            </Text>
            <View style={styles.modalBtns}>
              <Button
                title="Cancelar"
                variant="ghost"
                onPress={() => setModalAbrir(false)}
                style={{ flex: 1 }}
              />
              <Button
                title={abrindo ? 'Abrindo...' : 'Abrir Mesa'}
                onPress={confirmarAbrirMesa}
                loading={abrindo}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  centered:{ justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { color: colors.textSecondary, marginTop: spacing.sm, fontSize: fontSize.md },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.md,
  },
  headerTitle: { color: colors.white, fontSize: fontSize.lg, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, marginTop: 2 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  legenda: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendaDot:  { width: 10, height: 10, borderRadius: 5 },
  legendaTxt:  { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },

  grid: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: 40,
  },

  // ── Mesa Card ──────────────────────────────────────────
  card: {
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.md,
    gap: 6,
    position: 'relative',
    ...shadow.sm,
  },
  cardNumero: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text,
    lineHeight: 36,
  },
  cardNome: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  statusDot:   { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: fontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  cardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  cardTempo: { fontSize: fontSize.xs, color: colors.textMuted },
  cardTotal: { fontSize: fontSize.md, fontWeight: '900', color: colors.primary },
  cardCap:   { fontSize: fontSize.xs, color: colors.textMuted },

  contaAlert: {
    position: 'absolute',
    top: 10,
    right: 10,
    fontSize: 18,
  },

  // ── Empty ──────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptySub:   { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },

  // ── Modal ──────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    ...shadow.lg,
  },
  modalEmoji: { fontSize: 48 },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text, textAlign: 'center' },
  modalSub:   { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center' },
  modalBtns:  { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, width: '100%' },
});
