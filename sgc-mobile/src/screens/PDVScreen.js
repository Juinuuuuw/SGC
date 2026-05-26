// src/screens/PDVScreen.js
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Modal, Alert, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useCart }  from '../context/CartContext';
import { useAuth }  from '../context/AuthContext';
import { useEmpresa } from '../context/EmpresaContext';
import BarcodeScanner from '../components/BarcodeScanner';
import { Button, Card, Input, EmptyState, SectionHeader } from '../components/ui';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import {
  getProdutoByBarcode,
  getProdutos,
  getGrupos,
  finalizarVenda,
  getCaixaAtivo,
  abrirCaixa,
  fecharCaixa,
  getClientes,
  salvarCliente,
} from '../services/api';

// ══════════════ IMPRESSÃO ══════════════
import { imprimir } from '../services/printer';
import { reciboPDV } from '../utils/recibos';

const FORMAS_PAGAMENTO = ['DINHEIRO', 'PIX', 'DÉBITO', 'CRÉDITO', 'VOUCHER'];
const FORMAS_ICONS = {
  DINHEIRO: 'cash-outline',
  PIX: 'phone-portrait-outline',
  DÉBITO: 'card-outline',
  CRÉDITO: 'card-outline',
  VOUCHER: 'ticket-outline',
};
const MAX_LAST_SCANNED = 3;

export default function PDVScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { empresa } = useEmpresa();
  const { cart, dispatch, total, qtdItens } = useCart();

  // ── Scanner ───────────────────────────────────────────────
  const [scannerVisible,   setScannerVisible]   = useState(false);
  const [lastScanned,      setLastScanned]       = useState([]);

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

  // ── Clientes ──────────────────────────────────────────────
  const [cliente,          setCliente]           = useState(null);
  const [modalClientes,    setModalClientes]     = useState(false);
  const [buscaCliente,     setBuscaCliente]      = useState('');
  const [listaClientes,    setListaClientes]     = useState([]);
  const [buscandoCli,      setBuscandoCli]       = useState(false);
  const [modalNovoCli,     setModalNovoCli]      = useState(false);
  const [novoCliData,      setNovoCliData]       = useState({ nome: '', telefone: '', cpf_cnpj: '' });

  // ── Catálogo Inteligente ──────────────────────────────────
  const [modalCatalogo,    setModalCatalogo]     = useState(false);
  const [catalogoProdutos, setCatalogoProdutos]  = useState([]);
  const [catalogoGrupos,   setCatalogoGrupos]    = useState([]);
  const [grupoSel,         setGrupoSel]          = useState(null);
  const [subgrupoSel,      setSubgrupoSel]       = useState(null);
  const [buscaCatalogo,    setBuscaCatalogo]     = useState('');
  const [loadingCatalogo,  setLoadingCatalogo]   = useState(false);

  // ── Notificação toast ─────────────────────────────────────
  const [toast,            setToast]             = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg, tipo = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, tipo });
    toastTimer.current = setTimeout(() => setToast(null), 1500);
  }, []);

  // ════════════════════════════════════════════════════════════
  //  SCANNER CONTÍNUO
  // ════════════════════════════════════════════════════════════
  const handleScanContinuo = useCallback(async (barcode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const produto = await getProdutoByBarcode(barcode);
      if (!produto) {
        setLastScanned(prev => [...prev.slice(-(MAX_LAST_SCANNED - 1)), { barcode, nome: `(${barcode})`, notFound: true }]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      dispatch({ type: 'ADD_ITEM', payload: { produto, quantidade: 1 } });
      setLastScanned(prev => [...prev.slice(-(MAX_LAST_SCANNED - 1)), { barcode, nome: produto.nome, preco_venda: produto.preco_venda }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLastScanned(prev => [...prev.slice(-(MAX_LAST_SCANNED - 1)), { barcode, nome: `(${barcode})`, notFound: true }]);
    }
  }, [dispatch]);

  // ════════════════════════════════════════════════════════════
  //  CATÁLOGO INTUITIVO
  // ════════════════════════════════════════════════════════════
  const abrirCatalogo = async () => {
    setModalCatalogo(true);
    if (catalogoProdutos.length === 0) {
      setLoadingCatalogo(true);
      try {
        const [prods, grps] = await Promise.all([ getProdutos(''), getGrupos() ]);
        setCatalogoProdutos(Array.isArray(prods) ? prods : []);
        setCatalogoGrupos(grps.success ? grps.grupos : []);
      } catch {
        showToast('Erro ao carregar catálogo', 'erro');
      } finally {
        setLoadingCatalogo(false);
      }
    }
  };

  const adicionarDoCatalogo = (produto) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch({ type: 'ADD_ITEM', payload: { produto, quantidade: 1 } });
    showToast(`+1 ${produto.nome}`, 'ok');
  };

  const subgruposAtuais = grupoSel ? (catalogoGrupos.find(g => g.id == grupoSel)?.subgrupos || []) : [];

  const produtosFiltradosCat = catalogoProdutos.filter(p => {
    if (buscaCatalogo.length > 1) {
      const term = buscaCatalogo.toLowerCase();
      if (!p.nome.toLowerCase().includes(term) && !(p.referencia || '').toLowerCase().includes(term)) return false;
    }
    if (subgrupoSel) {
      if (p.id_grupo != subgrupoSel) return false;
    } else if (grupoSel) {
      if (p.id_grupo != grupoSel && p.grupo_pai_id != grupoSel) return false;
    }
    return true;
  });

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
      showToast('Erro ao buscar clientes', 'erro');
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
        const novoCli = { id: res.id, ...novoCliData };
        setCliente(novoCli);
        setNovoCliData({ nome: '', telefone: '', cpf_cnpj: '' });
        setModalClientes(false);
        showToast('Cliente cadastrado!', 'ok');
      } else {
        Alert.alert('Erro', res.message || 'Falha ao cadastrar cliente.');
      }
    } catch {
      showToast('Erro de conexão', 'erro');
    } finally {
      setBuscandoCli(false);
    }
  };

  const handleConfirmarIdentificacao = () => {
    if (novoCliData.nome) {
        setCliente(null); // Garante que estamos usando os dados manuais
    }
    setModalClientes(false);
  };

  const handleSelecionarCliente = (item) => {
    setCliente(item);
    setNovoCliData({ nome: '', telefone: '', cpf_cnpj: '' });
    setModalClientes(false);
  };

  const renderCatalogoItem = ({ item }) => (
    <View style={styles.catItem}>
      <View style={styles.catItemInfo}>
        <Text style={styles.catItemNome}>{item.nome}</Text>
        {item.referencia ? <Text style={styles.catItemRef}>Ref: {item.referencia}</Text> : null}
        <Text style={styles.catItemPreco}>R$ {fmt(item.preco_venda)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
        <Text style={styles.catItemEstoque}>Est: {item.estoque}</Text>
        <TouchableOpacity style={styles.catAddBtn} onPress={() => adicionarDoCatalogo(item)}>
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ════════════════════════════════════════════════════════════
  //  BUSCA MANUAL
  // ════════════════════════════════════════════════════════════
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
  //  CAIXA E FINALIZAR VENDA (COM IMPRESSÃO)
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

  const handleFinalizar = async () => {
    if (!caixa) { Alert.alert('Caixa fechado', 'Abra o caixa antes de finalizar a venda.'); return; }
    const desconto = parseFloat(descontoInput.replace(',', '.')) || 0;
    setFinalizando(true);
    try {
      const res = await finalizarVenda({
        id_caixa:        caixa.id,
        id_cliente:      cliente?.id || null,
        cliente_nome_manual: cliente?.id ? null : novoCliData.nome,
        cliente_cpf_manual:  cliente?.id ? null : novoCliData.cpf_cnpj,
        itens:           cart.itens.map(i => ({ id_produto: i.id, quantidade: i.quantidade, preco_unitario: parseFloat(i.preco_venda) })),
        valor_total:     total,
        valor_desconto:  desconto,
        forma_pagamento: formaPagamento,
      });

      if (res.success) {
        // ── IMPRESSÃO ──
        try {
          const dadosRecibo = {
            id: res.id_venda || '---',
            total: total - desconto,
            forma_pagamento: formaPagamento,
            desconto: desconto,
            cliente_nome: cliente?.nome,
            cliente_nome_manual: cliente?.id ? null : novoCliData.nome,
            cliente_cpf_manual: cliente?.id ? null : novoCliData.cpf_cnpj,
            cliente_cpf: cliente?.cpf_cnpj
          };
          const comando = reciboPDV(empresa, dadosRecibo, cart.itens);
          await imprimir(comando);   // enfileira e tenta enviar agora
        } catch (printErr) {
          console.warn('Falha ao imprimir recibo:', printErr);
          // Não trava o fluxo — o recibo ficará na fila offline
        }

        // ── LIMPA E FINALIZA ──
        dispatch({ type: 'LIMPAR' });
        setModalFinalizar(false);
        setLastScanned([]);
        Alert.alert('✅ Venda Finalizada!', `Total: R$ ${(total - desconto).toFixed(2).replace('.', ',')}`);
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
  //  HELPERS
  // ════════════════════════════════════════════════════════════
  const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemInfo}>
        <Text style={styles.cartItemNome} numberOfLines={2}>{item.nome}</Text>
        <Text style={styles.cartItemPreco}>R$ {fmt(item.preco_venda)}</Text>
      </View>
      <View style={styles.cartItemControls}>
        <TouchableOpacity style={styles.qtyBtn} onPress={() => dispatch({ type: 'UPDATE_QTD', payload: { id: item.id, quantidade: item.quantidade - 1 } })}>
          <Ionicons name="remove" size={16} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.qtyValue}>{item.quantidade}</Text>
        <TouchableOpacity style={styles.qtyBtn} onPress={() => dispatch({ type: 'UPDATE_QTD', payload: { id: item.id, quantidade: item.quantidade + 1 } })}>
          <Ionicons name="add" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <Text style={styles.cartItemTotal}>R$ {fmt(parseFloat(item.preco_venda) * item.quantidade)}</Text>
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
          <Text style={styles.headerTitle}>PDV</Text>
          <Text style={styles.headerSub}>{user?.nome || 'Operador'}</Text>
        </View>
        <View style={styles.headerActions}>
          
          {/* Scanner */}
          <TouchableOpacity style={styles.headerBtn} onPress={() => setScannerVisible(true)}>
            <Ionicons name="qr-code-outline" size={22} color={colors.white} />
          </TouchableOpacity>

          {/* Catálogo */}
          <TouchableOpacity style={styles.headerBtn} onPress={abrirCatalogo}>
            <Ionicons name="grid-outline" size={22} color={colors.white} />
          </TouchableOpacity>
          
          {/* Carrinho */}
          <TouchableOpacity style={styles.cartBadgeBtn} onPress={() => setModalCarrinho(true)}>
            <Ionicons name="cart-outline" size={22} color={colors.white} />
            {qtdItens > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{qtdItens > 99 ? '99+' : qtdItens}</Text>
              </View>
            )}
          </TouchableOpacity>

        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Toast ─────────────────────────────────────── */}
          {toast && (
            <View style={[styles.toast, toast.tipo === 'erro' && styles.toastErro]}>
              <Ionicons 
                name={toast.tipo === 'erro' ? 'close-circle' : 'checkmark-circle'} 
                size={18} 
                color={colors.white} 
                style={{ marginRight: 8 }}
              />
              <Text style={styles.toastTxt}>{toast.msg}</Text>
            </View>
          )}

          {/* ── Busca manual ─────────────────────────────── */}
          <Card style={styles.card}>
            <SectionHeader title="Buscar Produto" />
            <Input
              icon={<Ionicons name="search" size={18} color={colors.textMuted} />}
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
              <EmptyState 
                icon={<Ionicons name="cart-outline" size={48} color={colors.textMuted} />}
                title="Carrinho vazio" 
                subtitle="Escaneie, busque ou abra o catálogo acima" 
              />
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
              icon={<Ionicons name="checkmark-circle" size={18} color={colors.white} />}
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
          Scanner Contínuo 
      ══════════════════════════════════════════════════════ */}
      <BarcodeScanner
        visible={scannerVisible}
        continuous={true}
        onContinuousScan={handleScanContinuo}
        onClose={() => setScannerVisible(false)}
        title={'Escaneamento Automático Rápido'}
        lastScanned={lastScanned}
      />

      {/* ══════════════════════════════════════════════════════
          Modal: Catálogo
      ══════════════════════════════════════════════════════ */}
      <Modal visible={modalCatalogo} animationType="slide" onRequestClose={() => setModalCatalogo(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top || 16, backgroundColor: colors.surface }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.surface }]}>
            <TouchableOpacity onPress={() => setModalCatalogo(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Catálogo</Text>
            <View style={{ width: 36 }} />
          </View>

          {loadingCatalogo ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={{ backgroundColor: colors.white, paddingBottom: spacing.sm, ...shadow.sm }}>
                <Input
                  icon={<Ionicons name="search" size={18} color={colors.textMuted} />}
                  value={buscaCatalogo} 
                  onChangeText={setBuscaCatalogo}
                  placeholder="Pesquisar no catálogo..."
                  style={{ paddingHorizontal: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm }}
                />

                {/* Filtro de Grupos */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupScroll}>
                  <TouchableOpacity style={[styles.groupChip, !grupoSel && styles.groupChipSel]} onPress={() => { setGrupoSel(null); setSubgrupoSel(null); }}>
                    <Text style={[styles.groupChipTxt, !grupoSel && styles.groupChipTxtSel]}>Todos</Text>
                  </TouchableOpacity>
                  {catalogoGrupos.map(g => (
                    <TouchableOpacity key={g.id} style={[styles.groupChip, grupoSel === g.id && styles.groupChipSel]} onPress={() => { setGrupoSel(g.id); setSubgrupoSel(null); }}>
                      <Text style={[styles.groupChipTxt, grupoSel === g.id && styles.groupChipTxtSel]}>
                        {g.icone ? g.icone + ' ' : ''}{g.nome}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Filtro de Subgrupos */}
                {subgruposAtuais.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.groupScroll, { marginTop: 8 }]}>
                    <TouchableOpacity style={[styles.subgroupChip, !subgrupoSel && styles.subgroupChipSel]} onPress={() => setSubgrupoSel(null)}>
                      <Text style={[styles.subgroupChipTxt, !subgrupoSel && styles.subgroupChipTxtSel]}>Todos</Text>
                    </TouchableOpacity>
                    {subgruposAtuais.map(s => (
                      <TouchableOpacity key={s.id} style={[styles.subgroupChip, subgrupoSel === s.id && styles.subgroupChipSel]} onPress={() => setSubgrupoSel(s.id)}>
                        <Text style={[styles.subgroupChipTxt, subgrupoSel === s.id && styles.subgroupChipTxtSel]}>
                          {s.icone ? s.icone + ' ' : ''}{s.nome}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <FlatList
                data={produtosFiltradosCat}
                keyExtractor={item => String(item.id)}
                renderItem={renderCatalogoItem}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                ListEmptyComponent={
                  <EmptyState 
                    icon={<Ionicons name="cube-outline" size={48} color={colors.textMuted} />}
                    title="Nenhum produto" 
                    subtitle="Não há produtos nesta categoria." 
                  />
                }
              />
            </View>
          )}
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          Modal: Carrinho
      ══════════════════════════════════════════════════════ */}
      <Modal visible={modalCarrinho} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalCarrinho(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top || 16 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalCarrinho(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Carrinho</Text>
            {cart.itens.length > 0 && (
              <TouchableOpacity onPress={() => { dispatch({ type: 'LIMPAR' }); setModalCarrinho(false); }}>
                <Text style={{ color: colors.danger, fontWeight: '700', fontSize: fontSize.sm }}>Limpar</Text>
              </TouchableOpacity>
            )}
          </View>

          {cart.itens.length === 0 ? (
            <EmptyState 
              icon={<Ionicons name="cart-outline" size={48} color={colors.textMuted} />}
              title="Carrinho vazio" 
            />
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
          Modal: Finalizar
      ══════════════════════════════════════════════════════ */}
      <Modal visible={modalFinalizar} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalFinalizar(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top || 16 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalFinalizar(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Finalizar Venda</Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
            {caixaLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : !caixa ? (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                  <Ionicons name="warning" size={20} color={colors.warning} style={{ marginRight: 8 }} />
                  <Text style={{ fontWeight: '700', color: colors.warning }}>
                    Nenhum caixa aberto
                  </Text>
                </View>
                <Input
                  label="Saldo inicial"
                  icon={<Ionicons name="wallet-outline" size={18} color={colors.textMuted} />}
                  value={saldoInput}
                  onChangeText={setSaldoInput}
                  keyboardType="decimal-pad"
                />
                <Button title="Abrir Caixa" onPress={handleAbrirCaixa} variant="success" />
              </Card>
            ) : (
              <View style={styles.caixaTag}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} style={{ marginRight: 8 }} />
                <Text style={styles.caixaTagTxt}>Caixa aberto · ID {caixa.id}</Text>
              </View>
            )}

            {/* Cliente Selection */}
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                <Text style={styles.modalSectionTitle}>Cliente</Text>
                {(cliente || novoCliData.nome) ? (
                  <TouchableOpacity onPress={() => { setCliente(null); setNovoCliData({ nome: '', telefone: '', cpf_cnpj: '' }); }}>
                    <Text style={{ color: colors.danger, fontSize: fontSize.xs, fontWeight: '700' }}>Remover</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {cliente || novoCliData.nome ? (
                <View style={styles.clienteSelecionadoBox}>
                  <View style={styles.clienteIconBox}>
                    <Ionicons name="person" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clienteNomeSel}>{cliente?.nome || novoCliData.nome}</Text>
                    {!!(cliente?.cpf_cnpj || novoCliData.cpf_cnpj) && (
                      <Text style={styles.clienteSubSel}>{cliente?.cpf_cnpj || novoCliData.cpf_cnpj}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => setModalClientes(true)}>
                    <Ionicons name="swap-horizontal" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.btnAdicionarCliente} onPress={() => setModalClientes(true)}>
                  <Ionicons name="person-add-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.btnAdicionarClienteTxt}>Vincular Cliente</Text>
                </TouchableOpacity>
              )}
            </Card>

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

            <Input
              label="Desconto (R$)"
              icon={<Ionicons name="pricetag-outline" size={18} color={colors.textMuted} />}
              value={descontoInput}
              onChangeText={setDescontoInput}
              keyboardType="decimal-pad"
            />

            <Card style={styles.totalCard}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                <Text style={styles.totalValue}>
                  R$ {fmt(Math.max(0, total - (parseFloat(descontoInput.replace(',', '.')) || 0)))}
                </Text>
              </View>
            </Card>

            <Text style={styles.modalSectionTitle}>Pagamento</Text>
            <View style={styles.formasGrid}>
              {FORMAS_PAGAMENTO.map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.formaBtn, formaPagamento === f && styles.formaBtnSelected]}
                  onPress={() => setFormaPagamento(f)}
                >
                  <Ionicons 
                    name={FORMAS_ICONS[f] || 'ellipse-outline'} 
                    size={18} 
                    color={formaPagamento === f ? colors.white : colors.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.formaBtnTxt, formaPagamento === f && styles.formaBtnTxtSel]}>
                    {f.charAt(0) + f.slice(1).toLowerCase().replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title={finalizando ? 'Registrando...' : 'Confirmar Venda'}
              icon={<Ionicons name="checkmark-circle" size={18} color={colors.white} />}
              onPress={handleFinalizar}
              disabled={!caixa || finalizando}
              loading={finalizando}
              style={{ marginTop: spacing.sm }}
            />
          </ScrollView>

          {/* ══════════════════════════════════════════════════════
              Overlay: Selecionar Cliente (DENTRO do Modal Finalizar)
          ══════════════════════════════════════════════════════ */}
          {modalClientes && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 9999 }]}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setModalClientes(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Vincular Cliente</Text>
                <View style={{ width: 44 }} />
              </View>

              <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }} keyboardShouldPersistTaps="handled">
                <Card>
                  <Text style={styles.modalSectionTitle}>Identificação Rápida</Text>
                  <Input
                    label="Nome do Cliente"
                    placeholder="Ex: João da Silva"
                    value={novoCliData.nome}
                    onChangeText={v => {
                      if (cliente) setCliente(null);
                      setNovoCliData(p => ({ ...p, nome: v }));
                    }}
                  />
                  <Input
                    label="CPF ou CNPJ"
                    placeholder="Opcional"
                    value={novoCliData.cpf_cnpj}
                    onChangeText={v => {
                      if (cliente) setCliente(null);
                      setNovoCliData(p => ({ ...p, cpf_cnpj: v }));
                    }}
                    keyboardType="numeric"
                  />
                  <Button 
                    title="Confirmar Identificação" 
                    onPress={handleConfirmarIdentificacao}
                    disabled={novoCliData.nome.length < 3}
                  />
                  {novoCliData.nome.length > 2 && (
                    <TouchableOpacity onPress={handleCadastrarCliente} style={{ marginTop: 10, alignSelf: 'center' }}>
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>+ Salvar no banco de dados</Text>
                    </TouchableOpacity>
                  )}
                </Card>

                <Text style={[styles.modalSectionTitle, { marginTop: spacing.sm }]}>Ou buscar cadastrado</Text>
                <Input
                  placeholder="Buscar por nome ou CPF..."
                  value={buscaCliente}
                  onChangeText={handleBuscarCliente}
                  icon={<Ionicons name="search" size={18} color={colors.textMuted} />}
                />

                {buscandoCli ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <View style={{ gap: spacing.xs }}>
                    {listaClientes.map(item => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.cliItem}
                        onPress={() => handleSelecionarCliente(item)}
                      >
                        <View style={styles.cliIconBox}>
                          <Text style={styles.cliInitial}>{item.nome ? item.nome[0].toUpperCase() : '?'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cliNome}>{item.nome}</Text>
                          <Text style={styles.cliInfo}>{item.cpf_cnpj || 'Sem CPF'} • {item.telefone || 'Sem fone'}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Button
                  title="Consumidor Final (Limpar)"
                  variant="ghost"
                  onPress={() => {
                    setCliente(null);
                    setNovoCliData({ nome: '', telefone: '', cpf_cnpj: '' });
                    setModalClientes(false);
                  }}
                />
              </ScrollView>
            </View>
          )}
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
  cartBadgeBtn: { 
    position: 'relative', width: 40, height: 40, borderRadius: 20, 
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' 
  },
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
    position: 'absolute', top: 90, alignSelf: 'center', zIndex: 100,
    backgroundColor: colors.success, borderRadius: radius.full,
    paddingHorizontal: 20, paddingVertical: 10, ...shadow.md,
    flexDirection: 'row', alignItems: 'center',
  },
  toastErro: { backgroundColor: colors.danger },
  toastTxt:  { color: colors.white, fontWeight: '800', fontSize: fontSize.sm },

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
  qtyValue: { fontSize: fontSize.md, fontWeight: '800', color: colors.primary, minWidth: 24, textAlign: 'center' },
  cartItemTotal: { fontSize: fontSize.sm, fontWeight: '700', minWidth: 70, textAlign: 'right' },

  // Modais Base
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
  modalTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  modalSectionTitle: { 
    fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary, 
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs 
  },
  modalFooter: { backgroundColor: colors.white, padding: spacing.md, gap: spacing.sm, ...shadow.md },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Catálogo
  groupScroll: { flexGrow: 0, paddingHorizontal: spacing.md },
  groupChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: colors.background,
    borderWidth: 1.5, borderColor: colors.border, marginRight: 8,
  },
  groupChipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  groupChipTxt: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  groupChipTxtSel: { color: colors.white },
  
  subgroupChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, marginRight: 6,
  },
  subgroupChipSel: { backgroundColor: colors.accent, borderColor: colors.accent },
  subgroupChipTxt: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  subgroupChipTxtSel: { color: colors.text },

  catItem: {
    flexDirection: 'row', padding: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.border,
  },
  catItemInfo: { flex: 1 },
  catItemNome: { fontSize: 15, fontWeight: '700', color: colors.text },
  catItemRef:  { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  catItemPreco:{ fontSize: 16, fontWeight: '900', color: colors.primary, marginTop: 4 },
  catItemEstoque: { fontSize: 11, color: colors.textSecondary, marginBottom: 8, fontWeight: '600' },
  catAddBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    ...shadow.sm,
  },

  caixaTag: {
    backgroundColor: colors.successLight, borderRadius: radius.md,
    padding: spacing.sm, flexDirection: 'row', alignItems: 'center',
  },
  caixaTagTxt: { color: colors.success, fontWeight: '700', fontSize: fontSize.sm },

  formasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  formaBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  formaBtnSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  formaBtnTxt: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  formaBtnTxtSel: { color: colors.white },

  // Clientes
  clienteSelecionadoBox: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary + '30',
  },
  clienteIconBox: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  clienteNomeSel: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  clienteSubSel: { fontSize: fontSize.xs, color: colors.textSecondary },

  btnAdicionarCliente: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm, borderStyle: 'dashed',
    borderWidth: 1.5, borderColor: colors.primary + '50',
    borderRadius: radius.md,
  },
  btnAdicionarClienteTxt: { color: colors.primary, fontWeight: '700', fontSize: fontSize.sm },

  btnSmallSearch: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  btnQuickRegister: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, paddingVertical: 8, borderRadius: radius.md,
    marginTop: 4,
  },
  btnQuickRegisterTxt: { color: colors.white, fontSize: 12, fontWeight: '700' },
  miniBadgeSuccess: {
    flexDirection: 'row', alignItems: 'center', marginTop: 4,
    backgroundColor: colors.successLight, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.sm, alignSelf: 'flex-start',
  },
  miniBadgeSuccessTxt: { color: colors.success, fontSize: 10, fontWeight: '700' },

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