// src/screens/MesaPedidoScreen.js
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Modal, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import BarcodeScanner from '../components/BarcodeScanner';
import { Button, Badge } from '../components/ui';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import {
  getMesaPedido,
  mesaPdvAction,
  getProdutoByBarcode,
  getProdutos,
} from '../services/api';

const FORMAS_PAGAMENTO = [
  { key: 'DINHEIRO', label: '💵 Dinheiro' },
  { key: 'PIX',      label: '📱 PIX' },
  { key: 'DEBITO',   label: '💳 Débito' },
  { key: 'CREDITO',  label: '💳 Crédito' },
  { key: 'VOUCHER',  label: '🎫 Voucher' },
  { key: 'FIADO',    label: '📝 Fiado' },
];

function fmt(v) {
  return parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcTempo(dataISO) {
  if (!dataISO) return '';
  const diff = Date.now() - new Date(dataISO).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}min`;
}

export default function MesaPedidoScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { mesa: mesaParam } = route.params;

  const [venda,     setVenda]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [salvando,  setSalvando]  = useState(false);

  // Busca
  const [busca,         setBusca]         = useState('');
  const [buscaResults,  setBuscaResults]  = useState([]);
  const [buscando,      setBuscando]      = useState(false);
  const [qtdInput,      setQtdInput]      = useState('1');
  const [produtoFocus,  setProdutoFocus]  = useState(null); // produto selecionado da lista

  // Scanner
  const [scannerVisible,  setScannerVisible]  = useState(false);
  const [scanContinuo,    setScanContinuo]    = useState(false);
  const [lastScanned,     setLastScanned]     = useState([]);

  // Toast
  const [toast,     setToast]     = useState(null);
  const toastTimer  = useRef(null);

  // Modais
  const [modalFechar,   setModalFechar]   = useState(false);
  const [forma,         setForma]         = useState('DINHEIRO');
  const [desconto,      setDesconto]      = useState('0');
  const [fechando,      setFechando]      = useState(false);

  const showToast = useCallback((msg, tipo = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, tipo });
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // ── Carrega o pedido da mesa ──────────────────────────────
  const carregarPedido = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getMesaPedido(mesaParam.id);
      setVenda(res?.venda || null);
    } catch {
      if (!silent) Alert.alert('Erro', 'Não foi possível carregar o pedido.');
    } finally {
      setLoading(false);
    }
  }, [mesaParam.id]);

  useFocusEffect(useCallback(() => { carregarPedido(); }, [carregarPedido]));

  // ── Busca de produto por nome ─────────────────────────────
  const buscarProdutos = async (termo) => {
    if (termo.length < 2) { setBuscaResults([]); return; }
    setBuscando(true);
    try {
      const lista = await getProdutos(termo);
      setBuscaResults(Array.isArray(lista) ? lista : []);
    } catch { setBuscaResults([]); }
    finally { setBuscando(false); }
  };

  // ── Adicionar item ao pedido ──────────────────────────────
  const adicionarItem = async (produto, qtd = 1) => {
    if (!venda?.id) {
      Alert.alert('Erro', 'Nenhuma conta em aberto para esta mesa.');
      return;
    }
    setSalvando(true);
    try {
      const res = await mesaPdvAction({
        acao:       'ADD_ITEM',
        id_venda:   venda.id,
        id_produto: produto.id,
        quantidade: qtd,
      });
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(`✓ ${produto.nome}`, 'ok');
        setBusca('');
        setBuscaResults([]);
        setQtdInput('1');
        setProdutoFocus(null);
        await carregarPedido(true);
      } else {
        showToast(res.message || 'Erro ao adicionar item', 'erro');
      }
    } catch {
      showToast('Erro de conexão', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  // ── Scan de código de barras ──────────────────────────────
  const handleScanNormal = async (barcode) => {
    setScannerVisible(false);
    await adicionarPorBarcode(barcode);
  };

  const handleScanContinuo = async (barcode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await adicionarPorBarcode(barcode, true);
  };

  const adicionarPorBarcode = async (barcode, continuo = false) => {
    try {
      const produto = await getProdutoByBarcode(barcode);
      if (!produto) {
        setLastScanned(p => [...p.slice(-2), { barcode, nome: `(${barcode})`, notFound: true }]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (!continuo) showToast('Produto não encontrado', 'erro');
        return;
      }

      if (!venda?.id) {
        showToast('Mesa sem conta aberta', 'erro'); return;
      }

      const res = await mesaPdvAction({
        acao:       'ADD_ITEM',
        id_venda:   venda.id,
        id_produto: produto.id,
        quantidade: 1,
      });

      if (res.success) {
        setLastScanned(p => [...p.slice(-2), { barcode, nome: produto.nome, preco_venda: produto.preco_venda }]);
        if (!continuo) showToast(`✓ ${produto.nome}`, 'ok');
        await carregarPedido(true);
      } else {
        setLastScanned(p => [...p.slice(-2), { barcode, nome: res.message || barcode, notFound: true }]);
      }
    } catch {
      setLastScanned(p => [...p.slice(-2), { barcode, nome: `(${barcode})`, notFound: true }]);
    }
  };

  // ── Remover item ──────────────────────────────────────────
  const removerItem = (idItem) => {
    Alert.alert('Remover item?', 'Este item será removido do pedido.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          try {
            const res = await mesaPdvAction({ acao: 'REMOVER_ITEM', id_item: idItem });
            if (res.success) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); carregarPedido(true); }
            else showToast(res.message || 'Erro ao remover', 'erro');
          } catch { showToast('Erro de conexão', 'erro'); }
        },
      },
    ]);
  };

  // ── Pedir conta ───────────────────────────────────────────
  const pedirConta = async () => {
    try {
      await mesaPdvAction({ acao: 'PEDIR_CONTA', id_mesa: mesaParam.id });
      showToast('Conta solicitada! ⚠️', 'ok');
    } catch { showToast('Erro', 'erro'); }
  };

  // ── Fechar conta ──────────────────────────────────────────
  const confirmarFechamento = async () => {
    if (!venda?.id) return;
    setFechando(true);
    try {
      const desc = parseFloat(desconto.replace(',', '.')) || 0;
      const res = await mesaPdvAction({
        acao:            'FECHAR',
        id_venda:        venda.id,
        id_mesa:         mesaParam.id,
        forma_pagamento: forma,
        desconto:        desc,
      });
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setModalFechar(false);
        Alert.alert(
          '✅ Conta Fechada!',
          `Total cobrado: R$ ${fmt(res.total_final)}\nForma: ${forma}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Erro', res.message || 'Não foi possível fechar a conta.');
      }
    } catch {
      Alert.alert('Erro', 'Falha na conexão com o servidor.');
    } finally {
      setFechando(false);
    }
  };

  const totalVenda = venda?.total || 0;
  const totalComDesconto = Math.max(0, totalVenda - (parseFloat(desconto.replace(',', '.')) || 0));

  // ── Render items ──────────────────────────────────────────
  const renderItem = ({ item, index }) => (
    <View style={styles.itemRow}>
      <View style={styles.itemIndex}>
        <Text style={styles.itemIndexTxt}>{index + 1}</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemNome} numberOfLines={2}>{item.produto_nome}</Text>
        <Text style={styles.itemPreco}>
          R$ {fmt(item.preco_unitario)} / {item.unidade_venda || 'un'}
        </Text>
      </View>
      <Text style={styles.itemQtd}>× {parseFloat(item.quantidade).toFixed(item.quantidade % 1 !== 0 ? 2 : 0)}</Text>
      <Text style={styles.itemSubtotal}>R$ {fmt(item.subtotal)}</Text>
      <TouchableOpacity onPress={() => removerItem(item.id)} style={styles.removeBtn}>
        <Text style={styles.removeBtnTxt}>🗑</Text>
      </TouchableOpacity>
    </View>
  );

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {mesaParam.nome || `Mesa ${mesaParam.numero}`}
          </Text>
          <Text style={styles.headerSub}>
            {venda?.data_venda ? calcTempo(venda.data_venda) : 'Carregando...'}
          </Text>
        </View>
        <View style={styles.headerTotal}>
          <Text style={styles.headerTotalLabel}>Total</Text>
          <Text style={styles.headerTotalVal}>R$ {fmt(totalVenda)}</Text>
        </View>
      </View>

      {/* ── Toast ──────────────────────────────────────────── */}
      {toast && (
        <View style={[styles.toast, toast.tipo === 'erro' && styles.toastErro]}>
          <Text style={styles.toastTxt}>{toast.msg}</Text>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ── Área de busca / adição ──────────────────────── */}
        <View style={styles.buscaContainer}>
          {/* Autocomplete */}
          <View style={{ flex: 1, position: 'relative' }}>
            <View style={styles.buscaRow}>
              <TextInput
                style={styles.buscaInput}
                value={busca}
                onChangeText={(t) => { setBusca(t); buscarProdutos(t); setProdutoFocus(null); }}
                placeholder="Buscar produto por nome ou ref..."
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
              />
              {buscando && <ActivityIndicator color={colors.primary} style={{ marginLeft: 8 }} />}
            </View>
            {/* Dropdown de resultados */}
            {buscaResults.length > 0 && (
              <View style={styles.dropdown}>
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
                  {buscaResults.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.dropItem, produtoFocus?.id === p.id && styles.dropItemSelected]}
                      onPress={() => {
                        setProdutoFocus(p);
                        setBusca(p.nome);
                        setBuscaResults([]);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dropItemNome}>{p.nome}</Text>
                        <Text style={styles.dropItemRef}>Ref: {p.referencia || 'N/A'} · Est: {p.estoque}</Text>
                      </View>
                      <Text style={styles.dropItemPreco}>R$ {fmt(p.preco_venda)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Qtd + Botão adicionar */}
          <TextInput
            style={styles.qtdInput}
            value={qtdInput}
            onChangeText={setQtdInput}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <TouchableOpacity
            style={[styles.addBtn, (!produtoFocus || salvando) && styles.addBtnDisabled]}
            onPress={() => {
              if (!produtoFocus) { showToast('Selecione um produto', 'erro'); return; }
              adicionarItem(produtoFocus, parseFloat(qtdInput.replace(',', '.')) || 1);
            }}
            disabled={!produtoFocus || salvando}
          >
            {salvando
              ? <ActivityIndicator color={colors.white} size="small" />
              : <Text style={styles.addBtnTxt}>+</Text>}
          </TouchableOpacity>

          {/* Scanner */}
          <TouchableOpacity
            style={[styles.scanBtn, scanContinuo && styles.scanBtnActive]}
            onPress={() => {
              setScannerVisible(true);
              setScanContinuo(false);
            }}
          >
            <Text style={{ fontSize: 20 }}>📷</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanBtn, scanContinuo && styles.scanBtnActive]}
            onPress={() => {
              setScanContinuo(true);
              setScannerVisible(true);
            }}
          >
            <Text style={{ fontSize: 18 }}>🔁</Text>
          </TouchableOpacity>
        </View>

        {/* ── Lista de itens ──────────────────────────────── */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : !venda || !venda.itens?.length ? (
          <View style={styles.centered}>
            <Text style={{ fontSize: 48, marginBottom: spacing.sm }}>🍽️</Text>
            <Text style={styles.emptyTxt}>Nenhum item ainda</Text>
            <Text style={styles.emptySubTxt}>Escaneie ou busque produtos acima</Text>
          </View>
        ) : (
          <FlatList
            data={venda.itens}
            keyExtractor={i => String(i.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listaContent}
          />
        )}
      </KeyboardAvoidingView>

      {/* ── Rodapé ─────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.footerTotal}>
          <Text style={styles.footerTotalLabel}>Total da Mesa</Text>
          <Text style={styles.footerTotalVal}>R$ {fmt(totalVenda)}</Text>
        </View>
        <View style={styles.footerBtns}>
          <TouchableOpacity style={styles.btnPedirConta} onPress={pedirConta}>
            <Text style={styles.btnPedirContaTxt}>🧾 Pedir Conta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnFecharConta, !venda?.id && styles.btnDisabled]}
            onPress={() => {
              if (!venda?.id) { showToast('Nenhuma conta em aberto', 'erro'); return; }
              setModalFechar(true);
            }}
            disabled={!venda?.id}
          >
            <Text style={styles.btnFecharContaTxt}>✅ Fechar Conta</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ══════════════════════════════════════════════════════
          Scanner
      ══════════════════════════════════════════════════════ */}
      <BarcodeScanner
        visible={scannerVisible}
        continuous={scanContinuo}
        onScan={handleScanNormal}
        onContinuousScan={handleScanContinuo}
        onClose={() => setScannerVisible(false)}
        title={
          scanContinuo
            ? 'Escaneie os produtos — adicionados automaticamente'
            : 'Aponte para o código de barras'
        }
        lastScanned={lastScanned}
      />

      {/* ══════════════════════════════════════════════════════
          Modal: Fechar Conta
      ══════════════════════════════════════════════════════ */}
      <Modal
        visible={modalFechar}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalFechar(false)}
      >
        <View style={[styles.modalRoot, { paddingTop: insets.top || 16 }]}>
          {/* Modal header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalFechar(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseTxt}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Fechar Conta</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>

            {/* Resumo dos itens */}
            <View style={styles.resumoBox}>
              <Text style={styles.resumoTitle}>Resumo do Pedido</Text>
              {venda?.itens?.map(i => (
                <View key={i.id} style={styles.resumoRow}>
                  <Text style={styles.resumoNome} numberOfLines={1}>{i.produto_nome}</Text>
                  <Text style={styles.resumoQtd}>× {parseFloat(i.quantidade).toFixed(0)}</Text>
                  <Text style={styles.resumoVal}>R$ {fmt(i.subtotal)}</Text>
                </View>
              ))}
            </View>

            {/* Desconto */}
            <View>
              <Text style={styles.inputLabel}>Desconto (R$)</Text>
              <TextInput
                style={styles.descontoInput}
                value={desconto}
                onChangeText={setDesconto}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Total final */}
            <View style={styles.totalFinalBox}>
              <Text style={styles.totalFinalLabel}>Total a Cobrar</Text>
              <Text style={styles.totalFinalVal}>R$ {fmt(totalComDesconto)}</Text>
            </View>

            {/* Formas de pagamento */}
            <Text style={styles.inputLabel}>Forma de Pagamento</Text>
            <View style={styles.formasGrid}>
              {FORMAS_PAGAMENTO.map(fp => (
                <TouchableOpacity
                  key={fp.key}
                  style={[styles.formaBtn, forma === fp.key && styles.formaBtnSel]}
                  onPress={() => setForma(fp.key)}
                >
                  <Text style={[styles.formaBtnTxt, forma === fp.key && styles.formaBtnTxtSel]}>
                    {fp.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Botão confirmar */}
            <Button
              title={fechando ? 'Registrando...' : '✅ Confirmar Pagamento'}
              onPress={confirmarFechamento}
              loading={fechando}
              style={{ marginTop: spacing.sm }}
            />
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    ...shadow.md,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  backTxt:      { color: colors.white, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  headerCenter: { flex: 1 },
  headerTitle:  { color: colors.white, fontSize: fontSize.lg, fontWeight: '800' },
  headerSub:    { color: 'rgba(255,255,255,0.65)', fontSize: fontSize.xs },
  headerTotal:  { alignItems: 'flex-end' },
  headerTotalLabel: { color: 'rgba(255,255,255,0.65)', fontSize: fontSize.xs },
  headerTotalVal:   { color: colors.accent, fontSize: fontSize.xl, fontWeight: '900' },

  // Toast
  toast:    { backgroundColor: colors.success, padding: spacing.xs + 4, alignItems: 'center' },
  toastErro:{ backgroundColor: colors.danger },
  toastTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },

  // Área de busca
  buscaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadow.sm,
  },
  buscaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    height: 46,
  },
  buscaInput: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  dropdown: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 100,
    ...shadow.md,
  },
  dropItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropItemSelected: { backgroundColor: colors.primary + '12' },
  dropItemNome:  { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  dropItemRef:   { fontSize: fontSize.xs, color: colors.textMuted },
  dropItemPreco: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primary },
  qtdInput: {
    width: 52, height: 46,
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.background,
  },
  addBtn: {
    width: 46, height: 46, borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnDisabled: { backgroundColor: colors.border },
  addBtnTxt: { color: colors.white, fontSize: 26, fontWeight: '700', lineHeight: 30 },
  scanBtn: {
    width: 44, height: 46, borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  scanBtnActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },

  // Items list
  listaContent: { padding: spacing.md, paddingBottom: 120, gap: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
    ...shadow.sm,
  },
  itemIndex: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  itemIndexTxt: { color: colors.white, fontSize: 11, fontWeight: '800' },
  itemInfo:     { flex: 1 },
  itemNome:     { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  itemPreco:    { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  itemQtd:      { fontSize: fontSize.sm, color: colors.textSecondary, minWidth: 30, textAlign: 'center' },
  itemSubtotal: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary, minWidth: 70, textAlign: 'right' },
  removeBtn:    { padding: 4 },
  removeBtnTxt: { fontSize: 18 },

  emptyTxt:    { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptySubTxt: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },

  // Footer
  footer: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.md,
  },
  footerTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  footerTotalLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  footerTotalVal:   { fontSize: 26, fontWeight: '900', color: colors.primary },
  footerBtns: { flexDirection: 'row', gap: spacing.sm },
  btnPedirConta: {
    flex: 1, paddingVertical: 13, borderRadius: radius.md,
    backgroundColor: '#fff3e0', borderWidth: 2, borderColor: '#ffb300',
    alignItems: 'center',
  },
  btnPedirContaTxt: { color: '#e65100', fontWeight: '800', fontSize: fontSize.sm },
  btnFecharConta: {
    flex: 1.4, paddingVertical: 13, borderRadius: radius.md,
    backgroundColor: colors.accent, alignItems: 'center',
  },
  btnFecharContaTxt: { color: colors.text, fontWeight: '900', fontSize: fontSize.md },
  btnDisabled: { opacity: 0.45 },

  // Modal
  modalRoot:     { flex: 1, backgroundColor: colors.background },
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
  modalTitle:    { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },

  resumoBox: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, gap: spacing.xs, ...shadow.sm,
  },
  resumoTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  resumoRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  resumoNome:  { flex: 1, fontSize: fontSize.sm, color: colors.text },
  resumoQtd:   { fontSize: fontSize.sm, color: colors.textMuted, marginHorizontal: spacing.sm },
  resumoVal:   { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },

  inputLabel: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  descontoInput: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    padding: spacing.md, fontSize: fontSize.lg,
    fontWeight: '700', color: colors.text,
  },
  totalFinalBox: {
    backgroundColor: colors.primary + '10', borderRadius: radius.md,
    padding: spacing.md, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.primary + '30',
  },
  totalFinalLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 1 },
  totalFinalVal:   { fontSize: 28, fontWeight: '900', color: colors.primary },

  formasGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  formaBtn: {
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  formaBtnSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  formaBtnTxt: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  formaBtnTxtSel: { color: colors.white },
});
