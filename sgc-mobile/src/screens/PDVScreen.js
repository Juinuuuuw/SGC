// src/screens/PDVScreen.js
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Modal, Alert, ActivityIndicator,
  Animated, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useCart }  from '../context/CartContext';
import { useAuth }  from '../context/AuthContext';
import BarcodeScanner from '../components/BarcodeScanner';
import { Button, Card, Input, EmptyState, SectionHeader } from '../components/ui';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import {
  getProdutoByBarcode,
  getProdutos,
  finalizarVenda,
  getCaixaAtivo,
  abrirCaixa,
} from '../services/api';

const FORMAS_PAGAMENTO = ['DINHEIRO', 'PIX', 'DÉBITO', 'CRÉDITO', 'VOUCHER'];
const MAX_LAST_SCANNED = 3;

export default function PDVScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { cart, dispatch, total, totalComDesconto, qtdItens } = useCart();

  // ── Scanner ───────────────────────────────────────────────
  const [scannerVisible,   setScannerVisible]   = useState(false);
  const [continuousMode,   setContinuousMode]   = useState(false);
  const [lastScanned,      setLastScanned]       = useState([]); // últimos itens lidos

  // ── Busca manual ──────────────────────────────────────────
  const [searchTerm,       setSearchTerm]        = useState('');
  const [searchResults,    setSearchResults]      = useState([]);
  const [searching,        setSearching]          = useState(false);

  // ── Caixa ─────────────────────────────────────────────────
  const [caixa,            setCaixa]             = useState(null);
  const [caixaLoading,     setCaixaLoading]      = useState(false);
  const [saldoInput,       setSaldoInput]        = useState('0');

  // ── Finalizar ─────────────────────────────────────────────
  const [modalFinalizar,   setModalFinalizar]    = useState(false);
  const [formaPagamento,   setFormaPagamento]    = useState('DINHEIRO');
  const [descontoInput,    setDescontoInput]     = useState('0');
  const [finalizando,      setFinalizando]        = useState(false);

  // ── Carrinho ──────────────────────────────────────────────
  const [modalCarrinho,    setModalCarrinho]     = useState(false);

  // ── Notificação toast ─────────────────────────────────────
  const [toast,            setToast]             = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg, tipo = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, tipo });
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // ════════════════════════════════════════════════════════════
  //  SCANNER — modo normal
  // ════════════════════════════════════════════════════════════
  const handleScanNormal = useCallback(async (barcode) => {
    setScannerVisible(false);
    await adicionarPorBarcode(barcode);
  }, []);

  // ════════════════════════════════════════════════════════════
  //  SCANNER — modo contínuo
  // ════════════════════════════════════════════════════════════
  const handleScanContinuo = useCallback(async (barcode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const produto = await getProdutoByBarcode(barcode);

      if (!produto) {
        // Produto não encontrado
        setLastScanned(prev => [
          ...prev.slice(-(MAX_LAST_SCANNED - 1)),
          { barcode, nome: `(${barcode})`, notFound: true },
        ]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      // Adiciona ao carrinho
      dispatch({ type: 'ADD_ITEM', payload: { produto, quantidade: 1 } });

      setLastScanned(prev => [
        ...prev.slice(-(MAX_LAST_SCANNED - 1)),
        { barcode, nome: produto.nome, preco_venda: produto.preco_venda },
      ]);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLastScanned(prev => [
        ...prev.slice(-(MAX_LAST_SCANNED - 1)),
        { barcode, nome: `(${barcode})`, notFound: true },
      ]);
    }
  }, [dispatch]);

  // ════════════════════════════════════════════════════════════
  //  ADICIONAR AO CARRINHO
  // ════════════════════════════════════════════════════════════
  const adicionarPorBarcode = async (barcode) => {
    try {
      const produto = await getProdutoByBarcode(barcode);
      if (!produto) { showToast('Produto não encontrado', 'erro'); return; }
      dispatch({ type: 'ADD_ITEM', payload: { produto, quantidade: 1 } });
      showToast(`✓ ${produto.nome}`, 'ok');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      showToast('Erro ao buscar produto', 'erro');
    }
  };

  // ── Busca por nome ────────────────────────────────────────
  const buscarProdutos = async (termo) => {
    if (termo.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const lista = await getProdutos(termo);
      setSearchResults(Array.isArray(lista) ? lista : []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const adicionarDaBusca = (produto) => {
    dispatch({ type: 'ADD_ITEM', payload: { produto, quantidade: 1 } });
    setSearchTerm('');
    setSearchResults([]);
    showToast(`✓ ${produto.nome}`, 'ok');
  };

  // ════════════════════════════════════════════════════════════
  //  CAIXA
  // ════════════════════════════════════════════════════════════
  const verificarCaixa = async () => {
    setCaixaLoading(true);
    try {
      const data = await getCaixaAtivo();
      setCaixa(data || null);
    } catch { setCaixa(null); }
    finally { setCaixaLoading(false); }
  };

  const handleAbrirCaixa = async () => {
    const saldo = parseFloat(saldoInput.replace(',', '.')) || 0;
    setCaixaLoading(true);
    try {
      const res = await abrirCaixa(saldo);
      if (res.success) { setCaixa(res.caixa); showToast('Caixa aberto!', 'ok'); }
      else showToast(res.message || 'Erro ao abrir caixa', 'erro');
    } catch { showToast('Erro de conexão', 'erro'); }
    finally { setCaixaLoading(false); }
  };

  // ════════════════════════════════════════════════════════════
  //  FINALIZAR VENDA
  // ════════════════════════════════════════════════════════════
  const handleFinalizar = async () => {
    if (!caixa) { Alert.alert('Caixa fechado', 'Abra o caixa antes de finalizar a venda.'); return; }
    const desconto = parseFloat(descontoInput.replace(',', '.')) || 0;
    setFinalizando(true);
    try {
      const res = await finalizarVenda({
        id_caixa:        caixa.id,
        itens:           cart.itens.map(i => ({
                           id_produto:     i.id,
                           quantidade:     i.quantidade,
                           preco_unitario: parseFloat(i.preco_venda),
                         })),
        valor_total:     total,
        valor_desconto:  desconto,
        forma_pagamento: formaPagamento,
      });

      if (res.success) {
        dispatch({ type: 'LIMPAR' });
        setModalFinalizar(false);
        setLastScanned([]);
        Alert.alert(
          '✅ Venda Finalizada!',
          `Total: R$ ${(total - desconto).toFixed(2).replace('.', ',')}`,
        );
      } else {
        Alert.alert('Erro', res.message || 'Não foi possível registrar a venda.');
      }
    } catch {
      Alert.alert('Erro', 'Falha ao conectar com o servidor.');
    } finally {
      setFinalizando(false);
    }
  };

  // ════════════════════════════════════════════════════════════
  //  RENDER HELPERS
  // ════════════════════════════════════════════════════════════
  const fmt = (v) =>
    parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemInfo}>
        <Text style={styles.cartItemNome} numberOfLines={2}>{item.nome}</Text>
        <Text style={styles.cartItemPreco}>R$ {fmt(item.preco_venda)}</Text>
      </View>
      <View style={styles.cartItemControls}>
        <TouchableOpacity
          style={styles.qtyBtn}
          onPress={() => dispatch({ type: 'UPDATE_QTD', payload: { id: item.id, quantidade: item.quantidade - 1 } })}
        >
          <Text style={styles.qtyBtnTxt}>−</Text>
        </TouchableOpacity>
        <Text style={styles.qtyValue}>{item.quantidade}</Text>
        <TouchableOpacity
          style={styles.qtyBtn}
          onPress={() => dispatch({ type: 'UPDATE_QTD', payload: { id: item.id, quantidade: item.quantidade + 1 } })}
        >
          <Text style={styles.qtyBtnTxt}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.cartItemTotal}>
        R$ {fmt(parseFloat(item.preco_venda) * item.quantidade)}
      </Text>
    </View>
  );

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>PDV{continuousMode ? ' · Modo Contínuo' : ''}</Text>
          <Text style={styles.headerSub}>{user?.nome || 'Operador'}</Text>
        </View>
        <View style={styles.headerActions}>
          {/* Toggle modo contínuo */}
          <TouchableOpacity
            style={[styles.headerBtn, continuousMode && styles.headerBtnActive]}
            onPress={() => {
              const next = !continuousMode;
              setContinuousMode(next);
              if (next) setScannerVisible(true);
            }}
          >
            <Text style={styles.headerBtnTxt}>🔁</Text>
          </TouchableOpacity>
          {/* Scanner normal */}
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => { setContinuousMode(false); setScannerVisible(true); }}
          >
            <Text style={styles.headerBtnTxt}>📷</Text>
          </TouchableOpacity>
          {/* Carrinho */}
          <TouchableOpacity style={styles.cartBadgeBtn} onPress={() => setModalCarrinho(true)}>
            <Text style={styles.headerBtnTxt}>🛒</Text>
            {qtdItens > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{qtdItens > 99 ? '99+' : qtdItens}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Toast ─────────────────────────────────────── */}
          {toast && (
            <View style={[styles.toast, toast.tipo === 'erro' && styles.toastErro]}>
              <Text style={styles.toastTxt}>{toast.msg}</Text>
            </View>
          )}

          {/* ── Busca manual ─────────────────────────────── */}
          <Card style={styles.card}>
            <SectionHeader title="Buscar Produto" />
            <Input
              icon="🔍"
              value={searchTerm}
              onChangeText={(t) => { setSearchTerm(t); buscarProdutos(t); }}
              placeholder="Nome, código ou referência..."
              returnKeyType="search"
            />
            {searching && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
            {searchResults.map(p => (
              <TouchableOpacity key={p.id} style={styles.searchResult} onPress={() => adicionarDaBusca(p)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchResultNome}>{p.nome}</Text>
                  <Text style={styles.searchResultRef}>Ref: {p.referencia || 'N/A'} · Est: {p.estoque}</Text>
                </View>
                <Text style={styles.searchResultPreco}>R$ {fmt(p.preco_venda)}</Text>
              </TouchableOpacity>
            ))}
          </Card>

          {/* ── Carrinho resumido ──────────────────────────── */}
          {cart.itens.length > 0 ? (
            <Card style={styles.card}>
              <SectionHeader
                title={`Carrinho (${qtdItens} item${qtdItens !== 1 ? 's' : ''})`}
                action="Ver tudo"
                onAction={() => setModalCarrinho(true)}
              />
              {cart.itens.slice(0, 3).map(item => (
                <View key={item.id} style={styles.cartPreviewRow}>
                  <Text style={styles.cartPreviewNome} numberOfLines={1}>{item.nome}</Text>
                  <Text style={styles.cartPreviewQtd}>× {item.quantidade}</Text>
                  <Text style={styles.cartPreviewVal}>
                    R$ {fmt(parseFloat(item.preco_venda) * item.quantidade)}
                  </Text>
                </View>
              ))}
              {cart.itens.length > 3 && (
                <Text style={styles.moreItems}>+ {cart.itens.length - 3} item(s) no carrinho</Text>
              )}
            </Card>
          ) : (
            <Card style={styles.card}>
              <EmptyState icon="🛒" title="Carrinho vazio" subtitle="Escaneie ou busque produtos acima" />
            </Card>
          )}

          {/* ── Total e finalizar ──────────────────────────── */}
          <Card style={[styles.card, styles.totalCard]}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValue}>R$ {fmt(total)}</Text>
            </View>
            <Button
              title="Finalizar Venda"
              icon="✅"
              onPress={() => {
                if (cart.itens.length === 0) { showToast('Carrinho vazio', 'erro'); return; }
                verificarCaixa();
                setModalFinalizar(true);
              }}
              disabled={cart.itens.length === 0}
              style={{ marginTop: spacing.sm }}
            />
            {cart.itens.length > 0 && (
              <Button
                title="Limpar carrinho"
                variant="ghost"
                onPress={() => { dispatch({ type: 'LIMPAR' }); setLastScanned([]); }}
                style={{ marginTop: spacing.xs }}
              />
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ══════════════════════════════════════════════════════
          Scanner (normal ou contínuo)
      ══════════════════════════════════════════════════════ */}
      <BarcodeScanner
        visible={scannerVisible}
        continuous={continuousMode}
        onScan={handleScanNormal}
        onContinuousScan={handleScanContinuo}
        onClose={() => setScannerVisible(false)}
        title={
          continuousMode
            ? 'Escaneie os produtos — adicionados automaticamente ao carrinho'
            : 'Aponte para o código de barras do produto'
        }
        lastScanned={lastScanned}
      />

      {/* ══════════════════════════════════════════════════════
          Modal: Carrinho completo
      ══════════════════════════════════════════════════════ */}
      <Modal visible={modalCarrinho} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalCarrinho(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top || 16 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalCarrinho(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseTxt}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Carrinho</Text>
            {cart.itens.length > 0 && (
              <TouchableOpacity onPress={() => { dispatch({ type: 'LIMPAR' }); setModalCarrinho(false); }}>
                <Text style={{ color: colors.danger, fontWeight: '700', fontSize: fontSize.sm }}>Limpar</Text>
              </TouchableOpacity>
            )}
          </View>

          {cart.itens.length === 0 ? (
            <EmptyState icon="🛒" title="Carrinho vazio" />
          ) : (
            <FlatList
              data={cart.itens}
              keyExtractor={i => String(i.id)}
              renderItem={renderCartItem}
              contentContainerStyle={{ padding: spacing.md }}
            />
          )}

          <View style={[styles.modalFooter, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValue}>R$ {fmt(total)}</Text>
            </View>
            <Button
              title="Finalizar Venda"
              onPress={() => {
                setModalCarrinho(false);
                verificarCaixa();
                setModalFinalizar(true);
              }}
              disabled={cart.itens.length === 0}
            />
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          Modal: Finalizar venda
      ══════════════════════════════════════════════════════ */}
      <Modal visible={modalFinalizar} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalFinalizar(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top || 16 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalFinalizar(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseTxt}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Finalizar Venda</Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
            {/* Caixa */}
            {caixaLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : !caixa ? (
              <Card>
                <Text style={{ fontWeight: '700', marginBottom: spacing.sm, color: colors.warning }}>
                  ⚠️ Nenhum caixa aberto
                </Text>
                <Input
                  label="Saldo inicial"
                  icon="💵"
                  value={saldoInput}
                  onChangeText={setSaldoInput}
                  keyboardType="decimal-pad"
                />
                <Button title="Abrir Caixa" onPress={handleAbrirCaixa} variant="success" />
              </Card>
            ) : (
              <View style={styles.caixaTag}>
                <Text style={styles.caixaTagTxt}>✅ Caixa aberto · ID {caixa.id}</Text>
              </View>
            )}

            {/* Resumo */}
            <Card>
              <Text style={styles.modalSectionTitle}>Resumo</Text>
              {cart.itens.map(i => (
                <View key={i.id} style={styles.cartPreviewRow}>
                  <Text style={styles.cartPreviewNome} numberOfLines={1}>{i.nome}</Text>
                  <Text style={styles.cartPreviewQtd}>× {i.quantidade}</Text>
                  <Text style={styles.cartPreviewVal}>R$ {fmt(parseFloat(i.preco_venda) * i.quantidade)}</Text>
                </View>
              ))}
            </Card>

            {/* Desconto */}
            <Input
              label="Desconto (R$)"
              icon="🏷️"
              value={descontoInput}
              onChangeText={setDescontoInput}
              keyboardType="decimal-pad"
            />

            {/* Total */}
            <Card style={styles.totalCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                <Text style={styles.totalValue}>
                  R$ {fmt(Math.max(0, total - (parseFloat(descontoInput.replace(',', '.')) || 0)))}
                </Text>
              </View>
            </Card>

            {/* Forma de pagamento */}
            <Text style={styles.modalSectionTitle}>Pagamento</Text>
            <View style={styles.formasGrid}>
              {FORMAS_PAGAMENTO.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.formaBtn, formaPagamento === f && styles.formaBtnSelected]}
                  onPress={() => setFormaPagamento(f)}
                >
                  <Text style={[styles.formaBtnTxt, formaPagamento === f && styles.formaBtnTxtSel]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title={finalizando ? 'Registrando...' : '✅ Confirmar Venda'}
              onPress={handleFinalizar}
              disabled={!caixa || finalizando}
              loading={finalizando}
              style={{ marginTop: spacing.sm }}
            />
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, ...shadow.md,
  },
  headerTitle: { color: colors.white, fontSize: fontSize.lg, fontWeight: '800' },
  headerSub:   { color: 'rgba(255,255,255,0.65)', fontSize: fontSize.xs },
  headerActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerBtnActive: { backgroundColor: colors.accent },
  headerBtnTxt: { fontSize: 20 },
  cartBadgeBtn: { position: 'relative', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: colors.accent,
    borderRadius: 10, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeTxt: { color: '#000', fontSize: 10, fontWeight: '900' },

  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 40 },
  card: { marginBottom: 0 },

  toast: {
    backgroundColor: colors.success,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  toastErro: { backgroundColor: colors.danger },
  toastTxt:  { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },

  searchResult: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  searchResultNome:  { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  searchResultRef:   { fontSize: fontSize.xs, color: colors.textMuted },
  searchResultPreco: { fontSize: fontSize.md, fontWeight: '800', color: colors.primary },

  cartPreviewRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cartPreviewNome: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  cartPreviewQtd:  { fontSize: fontSize.sm, color: colors.textMuted, marginHorizontal: spacing.sm },
  cartPreviewVal:  { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  moreItems: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },

  totalCard: { },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase' },
  totalValue: { fontSize: 28, fontWeight: '900', color: colors.primary },

  // Carrinho modal
  cartItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.sm, marginBottom: spacing.sm, ...shadow.sm,
  },
  cartItemInfo: { flex: 1 },
  cartItemNome: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  cartItemPreco: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  cartItemControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 30, height: 30, borderRadius: radius.sm,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnTxt: { fontSize: 18, fontWeight: '700', color: colors.primary, lineHeight: 22 },
  qtyValue: { fontSize: fontSize.md, fontWeight: '800', color: colors.primary, minWidth: 24, textAlign: 'center' },
  cartItemTotal: { fontSize: fontSize.sm, fontWeight: '700', minWidth: 70, textAlign: 'right' },

  // Modal
  modalRoot: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
  },
  modalCloseTxt: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  modalSectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs },
  modalFooter: { backgroundColor: colors.white, padding: spacing.md, gap: spacing.sm, ...shadow.md },

  caixaTag: {
    backgroundColor: colors.successLight, borderRadius: radius.md,
    padding: spacing.sm, alignItems: 'center',
  },
  caixaTagTxt: { color: colors.success, fontWeight: '700', fontSize: fontSize.sm },

  formasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  formaBtn: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  formaBtnSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  formaBtnTxt: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  formaBtnTxtSel: { color: colors.white },
});
