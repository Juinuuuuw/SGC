// src/screens/MesasScreen.js
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  RefreshControl, Modal, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { useEmpresa } from '../context/EmpresaContext';
import { 
  getMesas, 
  mesaPdvAction,
  getClientes,
  salvarCliente,
} from '../services/api';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import { Button, Card, Input } from '../components/ui';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';

const AUTO_REFRESH_MS = 30_000;

const STATUS_CONFIG = {
  livre: {
    label: 'Livre',
    bg: '#e8f5e9',
    border: '#2e7d32',
    text: '#2e7d32',
    dot: '#2e7d32',
    icon: 'checkmark-circle',
  },
  ocupada: {
    label: 'Ocupada',
    bg: '#fff5f5',
    border: '#c62828',
    text: '#c62828',
    dot: '#c62828',
    icon: 'close-circle',
  },
  conta: {
    label: 'Conta',
    bg: '#fffbf0',
    border: '#f57f17',
    text: '#e65100',
    dot: '#f57f17',
    icon: 'alert-circle',
  },
};

const CAPACIDADE_ICONS = {
  2: 'person-outline',
  4: 'people-outline',
  6: 'people-outline',
  8: 'people-outline',
  default: 'person-outline',
};

function calcTempo(dataISO) {
  if (!dataISO) return '';
  const diff = Date.now() - new Date(dataISO).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
}

function fmt(v) {
  return parseFloat(v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Card individual de mesa ───────────────────────────────
function MesaCard({ mesa, onPress }) {
  const cfg = STATUS_CONFIG[mesa.status] || STATUS_CONFIG.livre;
  const tempo = calcTempo(mesa.aberta_em);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
      onPress={() => onPress(mesa)}
      activeOpacity={0.82}
    >
      {/* Status icon no canto superior direito */}
      <View style={styles.cardStatusIcon}>
        <Ionicons name={cfg.icon} size={20} color={cfg.text} />
      </View>

      {/* Número da mesa */}
      <Text style={styles.cardNumero}>{mesa.numero}</Text>

      {/* Nome da mesa */}
      {mesa.nome ? (
        <Text style={styles.cardNome} numberOfLines={1}>
          {mesa.nome}
        </Text>
      ) : null}

      {/* Badge de status */}
      <View style={[styles.statusBadge, { backgroundColor: cfg.border + '18' }]}>
        <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
        <Text style={[styles.statusLabel, { color: cfg.text }]}>{cfg.label}</Text>
      </View>

      {/* Info da conta aberta */}
      {mesa.status !== 'livre' && (
        <View style={styles.cardInfo}>
          {!!tempo && (
            <View style={styles.cardInfoItem}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <Text style={styles.cardTempo}>{tempo}</Text>
            </View>
          )}
          {parseFloat(mesa.total_atual) > 0 && (
            <Text style={styles.cardTotal}>R$ {fmt(mesa.total_atual)}</Text>
          )}
        </View>
      )}

      {/* Capacidade */}
      <View style={styles.cardCapRow}>
        <Ionicons name="person-outline" size={12} color={colors.textMuted} />
        <Text style={styles.cardCap}>{mesa.capacidade}</Text>
      </View>

      {/* Alerta de conta solicitada */}
      {mesa.status === 'conta' && (
        <View style={styles.contaAlertBadge}>
          <Ionicons name="alert-circle" size={14} color={colors.warning} />
          <Text style={styles.contaAlertTxt}>Conta!</Text>
        </View>
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

  const [mesas, setMesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalAbrir, setModalAbrir] = useState(false);
  const [mesaSelecionada, setMesaSelecionada] = useState(null);
  const [abrindo, setAbrindo] = useState(false);

  // Clientes
  const [cliente,          setCliente]           = useState(null);
  const [modalClientes,    setModalClientes]     = useState(false);
  const [buscaCliente,     setBuscaCliente]      = useState('');
  const [listaClientes,    setListaClientes]     = useState([]);
  const [buscandoCli,      setBuscandoCli]       = useState(false);
  const [modalNovoCli,     setModalNovoCli]      = useState(false);
  const [novoCliData,      setNovoCliData]       = useState({ nome: '', telefone: '', cpf_cnpj: '' });

  const refreshTimer = useRef(null);

  // ════════════════════════════════════════════════════════════
  //  CLIENTES
  // ════════════════════════════════════════════════════════════
  const handleBuscarCliente = async (txt) => {
    setBuscaCliente(txt);
    if (txt.length < 2) {
      setListaClientes([]);
      return;
    }
    setBuscandoCli(true);
    try {
      const data = await getClientes(txt);
      setListaClientes(Array.isArray(data) ? data : []);
    } catch {
      // erro silencioso
    } finally {
      setBuscandoCli(false);
    }
  };

  const handleCadastrarCliente = async () => {
    if (!novoCliData.nome) return Alert.alert('Aviso', 'O nome do cliente é obrigatório.');
    setBuscandoCli(true);
    try {
      const res = await salvarCliente(novoCliData);
      if (res.success) {
        setCliente({ id: res.id, ...novoCliData });
        setModalNovoCli(false);
        setModalClientes(false);
      } else {
        Alert.alert('Erro', res.message || 'Falha ao cadastrar cliente.');
      }
    } catch {
      // erro
    } finally {
      setBuscandoCli(false);
    }
  };

  // ── Carrega mesas ─────────────────────────────────────────
  const carregarMesas = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getMesas();
      setMesas(Array.isArray(data) ? data : []);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarMesas();
      refreshTimer.current = setInterval(() => carregarMesas(true), AUTO_REFRESH_MS);
      return () => clearInterval(refreshTimer.current);
    }, [carregarMesas])
  );

  // ── Clique numa mesa ──────────────────────────────────────
  const handlePressMesa = useCallback(
    (mesa) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (mesa.status === 'livre') {
        setMesaSelecionada(mesa);
        setModalAbrir(true);
      } else {
        navigation.navigate('MesaPedido', { mesa });
      }
    },
    [navigation]
  );

  // ── Abrir mesa ────────────────────────────────────────────
  const confirmarAbrirMesa = async () => {
    if (!mesaSelecionada) return;
    setAbrindo(true);
    try {
      const res = await mesaPdvAction({
        acao: 'ABRIR',
        id_mesa: mesaSelecionada.id,
        id_cliente: cliente?.id || null,
      });
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setModalAbrir(false);
        const mesaAtualizada = {
          ...mesaSelecionada,
          status: 'ocupada',
          venda_id: res.id_venda,
          cliente_nome: cliente?.nome || 'Consumidor Final',
        };
        setCliente(null); // limpa para o próximo
        navigation.navigate('MesaPedido', { mesa: mesaAtualizada });
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

  // ── Estatísticas ──────────────────────────────────────────
  const livres = mesas.filter((m) => m.status === 'livre').length;
  const ocupadas = mesas.filter((m) => m.status === 'ocupada').length;
  const contas = mesas.filter((m) => m.status === 'conta').length;

  // ── Loading ───────────────────────────────────────────────
  if (loading && !refreshing) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingTxt}>Carregando mesas...</Text>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {empresa?.nome_fantasia || empresa?.razao_social || 'Restaurante'}
          </Text>
          <View style={styles.headerStats}>
            <View style={styles.headerStatItem}>
              <View style={[styles.headerDot, { backgroundColor: STATUS_CONFIG.livre.dot }]} />
              <Text style={styles.headerStatTxt}>{livres} livre{livres !== 1 ? 's' : ''}</Text>
            </View>
            <View style={styles.headerStatItem}>
              <View style={[styles.headerDot, { backgroundColor: STATUS_CONFIG.ocupada.dot }]} />
              <Text style={styles.headerStatTxt}>{ocupadas} ocupada{ocupadas !== 1 ? 's' : ''}</Text>
            </View>
            {contas > 0 && (
              <View style={styles.headerStatItem}>
                <Ionicons name="alert-circle" size={14} color={colors.warning} />
                <Text style={[styles.headerStatTxt, { color: colors.warning }]}>
                  {contas} conta
                </Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={() => carregarMesas()} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={colors.white} />
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

      {/* ── Grid de mesas ──────────────────────────────────── */}
      {mesas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="table-furniture" size={64} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Nenhuma mesa cadastrada</Text>
          <Text style={styles.emptySub}>
            Acesse o sistema web para cadastrar as mesas do restaurante.
          </Text>
        </View>
      ) : (
        <FlatList
          data={mesas}
          keyExtractor={(m) => String(m.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={styles.grid}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                carregarMesas();
              }}
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
            <View style={styles.modalIconCircle}>
              <MaterialCommunityIcons
                name="table-furniture"
                size={40}
                color={colors.primary}
              />
            </View>
            <Text style={styles.modalTitle}>
              Abrir {mesaSelecionada?.nome || `Mesa ${mesaSelecionada?.numero}`}?
            </Text>
            <Text style={styles.modalSub}>
              Isso criará uma conta em aberto para esta mesa.
            </Text>

            {/* Seleção de Cliente */}
            <TouchableOpacity 
              style={[styles.clienteBtn, cliente && styles.clienteBtnActive]} 
              onPress={() => setModalClientes(true)}
            >
              <Ionicons name="person-outline" size={20} color={cliente ? colors.primary : colors.textMuted} />
              <Text style={[styles.clienteBtnTxt, cliente && styles.clienteBtnTxtActive]} numberOfLines={1}>
                {cliente ? cliente.nome : 'Vincular Cliente (Opcional)'}
              </Text>
              {cliente && (
                <TouchableOpacity onPress={() => setCliente(null)} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <View style={styles.modalBtns}>
              <Button
                title="Cancelar"
                variant="ghost"
                onPress={() => { setModalAbrir(false); setCliente(null); }}
                style={{ flex: 1 }}
              />
              <Button
                title={abrindo ? 'Abrindo...' : 'Abrir Mesa'}
                icon={
                  <Ionicons
                    name="open-outline"
                    size={18}
                    color={colors.white}
                    style={{ marginRight: 6 }}
                  />
                }
                onPress={confirmarAbrirMesa}
                loading={abrindo}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          Modal: Selecionar Cliente
      ══════════════════════════════════════════════════════ */}
      <Modal visible={modalClientes} animationType="fade" transparent onRequestClose={() => setModalClientes(false)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCardClientes}>
            <View style={styles.modalHeaderClose}>
              <Text style={styles.modalTitle}>Vincular Cliente</Text>
              <TouchableOpacity onPress={() => setModalClientes(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Input
              placeholder="Buscar por nome ou CPF..."
              value={buscaCliente}
              onChangeText={handleBuscarCliente}
              autoFocus
              icon={<Ionicons name="search" size={18} color={colors.textMuted} />}
            />

            <View style={{ height: 300 }}>
              {buscandoCli ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
              ) : listaClientes.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
                    {buscaCliente.length < 2 ? 'Digite 2 ou mais letras' : 'Nenhum cliente encontrado'}
                  </Text>
                  <Button
                    title="Cadastrar Novo Cliente"
                    variant="outline"
                    style={{ marginTop: 16 }}
                    onPress={() => setModalNovoCli(true)}
                  />
                </View>
              ) : (
                <FlatList
                  data={listaClientes}
                  keyExtractor={i => String(i.id)}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.cliItem}
                      onPress={() => { setCliente(item); setModalClientes(false); }}
                    >
                      <View style={styles.cliIconBox}>
                        <Text style={styles.cliInitial}>{item.nome[0].toUpperCase()}</Text>
                      </View>
                      <View>
                        <Text style={styles.cliNome}>{item.nome}</Text>
                        <Text style={styles.cliInfo}>{item.cpf_cnpj || 'Sem CPF'} • {item.telefone || 'Sem fone'}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </Card>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          Modal: Novo Cliente
      ══════════════════════════════════════════════════════ */}
      <Modal visible={modalNovoCli} animationType="slide" transparent onRequestClose={() => setModalNovoCli(false)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCardClientes}>
            <View style={styles.modalHeaderClose}>
              <Text style={styles.modalTitle}>Novo Cliente</Text>
              <TouchableOpacity onPress={() => setModalNovoCli(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
              <Input
                label="Nome completo"
                value={novoCliData.nome}
                onChangeText={v => setNovoCliData(p => ({ ...p, nome: v }))}
                placeholder="Ex: João da Silva"
              />
              <Input
                label="Telefone"
                value={novoCliData.telefone}
                onChangeText={v => setNovoCliData(p => ({ ...p, telefone: v }))}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
              />
              <Input
                label="CPF / CNPJ"
                value={novoCliData.cpf_cnpj}
                onChangeText={v => setNovoCliData(p => ({ ...p, cpf_cnpj: v }))}
                placeholder="000.000.000-00"
                keyboardType="numeric"
              />

              <Button
                title="Cadastrar e Vincular"
                onPress={handleCadastrarCliente}
                loading={buscandoCli}
                style={{ marginTop: 10 }}
              />
              <Button
                title="Voltar"
                variant="ghost"
                onPress={() => setModalNovoCli(false)}
              />
            </ScrollView>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingTxt: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontSize: fontSize.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.md,
  },
  headerTitle: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  headerStats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 4,
  },
  headerStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerStatTxt: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Legenda
  legenda: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  legendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendaDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendaTxt: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Grid
  grid: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: 40,
  },

  // Mesa Card
  card: {
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.md,
    gap: 6,
    position: 'relative',
    ...shadow.sm,
  },
  cardStatusIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    opacity: 0.7,
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
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  cardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  cardInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardTempo: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  cardTotal: {
    fontSize: fontSize.md,
    fontWeight: '900',
    color: colors.primary,
  },
  cardCapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardCap: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },

  contaAlertBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.warning + '40',
  },
  contaAlertTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.warning,
    textTransform: 'uppercase',
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  emptySub: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // Modal
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
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  modalBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    width: '100%',
  },

  // Clientes
  clienteBtn: {
    flexDirection: 'row', alignItems: 'center',
    width: '100%', padding: spacing.md,
    backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    marginVertical: spacing.sm,
  },
  clienteBtnActive: { backgroundColor: colors.primary + '10', borderColor: colors.primary, borderStyle: 'solid' },
  clienteBtnTxt: { flex: 1, marginLeft: 8, fontSize: fontSize.sm, color: colors.textSecondary },
  clienteBtnTxtActive: { color: colors.primary, fontWeight: '700' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.md,
  },
  modalCardClientes: {
    width: '95%', maxHeight: '85%', padding: spacing.lg,
    backgroundColor: colors.white, borderRadius: radius.xl,
    ...shadow.lg,
  },
  modalHeaderClose: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  cliItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, borderBottomWidth: 1, borderColor: colors.border,
  },
  cliIconBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  cliInitial: { fontSize: fontSize.lg, fontWeight: '800', color: colors.primary },
  cliNome: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  cliInfo: { fontSize: fontSize.xs, color: colors.textSecondary },
});