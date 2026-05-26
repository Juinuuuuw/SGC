// src/screens/MesaPedidoScreen.js
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Modal, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useEmpresa } from '../context/EmpresaContext';
import * as Haptics from 'expo-haptics';

import BarcodeScanner from '../components/BarcodeScanner';
import { Button, Badge, Card, EmptyState, Input } from '../components/ui';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import {
  getMesaPedido,
  mesaPdvAction,
  getProdutoByBarcode,
  getProdutos,
  getGrupos,
  getClientes,
  salvarCliente,
} from '../services/api';

// ══════════════ IMPRESSÃO ══════════════
import { imprimir } from '../services/printer';
import { comandaCozinha, reciboFechamentoMesa, extratoConta } from '../utils/recibos';

const FORMAS_PAGAMENTO = [
  { key: 'DINHEIRO', label: 'Dinheiro', icon: 'cash-outline' },
  { key: 'PIX',      label: 'PIX',      icon: 'phone-portrait-outline' },
  { key: 'DEBITO',   label: 'Débito',   icon: 'card-outline' },
  { key: 'CREDITO',  label: 'Crédito',  icon: 'card-outline' },
  { key: 'VOUCHER',  label: 'Voucher',  icon: 'ticket-outline' },
  { key: 'FIADO',    label: 'Fiado',    icon: 'create-outline' },
];

function fmt(v) {
  return parseFloat(v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const { empresa } = useEmpresa();
  const { mesa: mesaParam } = route.params;

  const [venda, setVenda] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Busca
  const [busca, setBusca] = useState('');
  const [buscaResults, setBuscaResults] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [qtdInput, setQtdInput] = useState('1');
  const [produtoFocus, setProdutoFocus] = useState(null);

  // Scanner
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanContinuo, setScanContinuo] = useState(false);
  const [lastScanned, setLastScanned] = useState([]);

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Modais
  const [modalFechar, setModalFechar] = useState(false);
  const [forma, setForma] = useState('DINHEIRO');
  const [desconto, setDesconto] = useState('0');
  const [fechando, setFechando] = useState(false);

  // Catálogo
  const [modalCatalogo, setModalCatalogo] = useState(false);
  const [catalogoProdutos, setCatalogoProdutos] = useState([]);
  const [catalogoGrupos, setCatalogoGrupos] = useState([]);
  const [grupoSel, setGrupoSel] = useState(null);
  const [subgrupoSel, setSubgrupoSel] = useState(null);
  const [buscaCatalogo, setBuscaCatalogo] = useState('');
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);

  // ── Controle de conta solicitada ──────────────────────────
  const [contaSolicitada, setContaSolicitada] = useState(false);
  const [solicitandoConta, setSolicitandoConta] = useState(false);

  // Clientes
  const [modalClientes,    setModalClientes]     = useState(false);
  const [buscaCliente,     setBuscaCliente]      = useState('');
  const [listaClientes,    setListaClientes]     = useState([]);
  const [buscandoCli,      setBuscandoCli]       = useState(false);
  const [modalNovoCli,     setModalNovoCli]      = useState(false);
  const [novoCliData,      setNovoCliData]       = useState({ nome: '', telefone: '', cpf_cnpj: '' });

  // ── Controle de itens já existentes ao entrar na tela ────
  const itensIniciaisIds = useRef(new Set());

  const showToast = useCallback((msg, tipo = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, tipo });
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // ── Carrega o pedido e registra os IDs iniciais ────────────
  const carregarPedido = useCallback(async (silent = false, guardarIniciais = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getMesaPedido(mesaParam.id);
      const novaVenda = res?.venda || null;
      setVenda(novaVenda);
      if (guardarIniciais && novaVenda?.itens) {
        itensIniciaisIds.current = new Set(novaVenda.itens.map(i => i.id));
      }
      // Verifica se a mesa já está com status "conta"
      if (novaVenda?.status === 'conta' || mesaParam?.status === 'conta') {
        setContaSolicitada(true);
      }
    } catch {
      if (!silent) Alert.alert('Erro', 'Não foi possível carregar o pedido.');
    } finally {
      setLoading(false);
    }
  }, [mesaParam.id]);

  // Ao focar na tela, carrega e salva os IDs iniciais
  useFocusEffect(useCallback(() => {
    carregarPedido(false, true);
  }, [carregarPedido]));

  // ── Busca ─────────────────────────────────────────────────
  const buscarProdutos = async (termo) => {
    if (termo.length < 2) { setBuscaResults([]); return; }
    setBuscando(true);
    try {
      const lista = await getProdutos(termo);
      setBuscaResults(Array.isArray(lista) ? lista : []);
    } catch { setBuscaResults([]); }
    finally { setBuscando(false); }
  };

  // ── Adicionar item (SEM impressão imediata) ────────────────
  const adicionarItem = async (produto, qtd = 1) => {
    if (!venda?.id) {
      Alert.alert('Erro', 'Nenhuma conta em aberto para esta mesa.');
      return;
    }
    setSalvando(true);
    try {
      const res = await mesaPdvAction({
        acao: 'ADD_ITEM',
        id_venda: venda.id,
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

  // ── Scanner (SEM impressão individual) ──────────────────────
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
        acao: 'ADD_ITEM',
        id_venda: venda.id,
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

  // ── Remover item ───────────────────────────────────────────
  const removerItem = (idItem) => {
    Alert.alert('Remover item?', 'Este item será removido do pedido.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          try {
            const res = await mesaPdvAction({ acao: 'REMOVER_ITEM', id_item: idItem });
            if (res.success) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              carregarPedido(true);
            } else showToast(res.message || 'Erro ao remover', 'erro');
          } catch { showToast('Erro de conexão', 'erro'); }
        },
      },
    ]);
  };

  // ── Pedir conta (com impressão do extrato) ─────────────────
  const pedirConta = async () => {
    if (contaSolicitada) {
      showToast('Conta já foi solicitada', 'info');
      return;
    }
    setSolicitandoConta(true);
    try {
      const res = await mesaPdvAction({ acao: 'PEDIR_CONTA', id_mesa: mesaParam.id });
      if (res.success) {
        setContaSolicitada(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('Conta solicitada! Extrato impresso.', 'ok');

        // ── IMPRIME O EXTRATO PARA O CLIENTE ──
        try {
          await imprimir(extratoConta(empresa, mesaParam, venda, parseFloat(desconto.replace(',', '.')) || 0));
        } catch (printErr) {
          console.warn('Falha ao imprimir extrato:', printErr);
        }

        // Atualiza a tela para refletir o novo status
        await carregarPedido(true);
      } else {
        showToast(res.message || 'Erro ao solicitar conta', 'erro');
      }
    } catch {
      showToast('Erro de conexão', 'erro');
    } finally {
      setSolicitandoConta(false);
    }
  };

  // ── Fechar conta (com impressão do recibo) ─────────────────
  const confirmarFechamento = async () => {
    if (!venda?.id) return;
    setFechando(true);
    try {
      const desc = parseFloat(desconto.replace(',', '.')) || 0;
      const res = await mesaPdvAction({
        acao: 'FECHAR',
        id_venda: venda.id,
        id_mesa: mesaParam.id,
        forma_pagamento: forma,
        desconto: desc,
      });
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // ── IMPRIME RECIBO PARA O CLIENTE ──
        try {
          await imprimir(reciboFechamentoMesa(empresa, mesaParam, venda, desc, forma));
        } catch (printErr) {
          console.warn('Falha ao imprimir recibo:', printErr);
        }

        setModalFechar(false);
        Alert.alert(
          'Conta Fechada!',
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

  // ── Imprime comanda dos itens adicionados nesta visita ─────
  const imprimirComandaPendente = useCallback(async () => {
    if (!venda?.itens?.length) return;
    const novos = venda.itens.filter(i => !itensIniciaisIds.current.has(i.id));
    if (novos.length === 0) return;
    try {
      await imprimir(comandaCozinha(mesaParam, novos));
      novos.forEach(i => itensIniciaisIds.current.add(i.id));
    } catch (e) {
      console.warn('Falha ao imprimir comanda:', e);
    }
  }, [venda, mesaParam]);

  // ── Botão voltar: imprime pendências e sai ─────────────────
  const handleVoltar = useCallback(async () => {
    await imprimirComandaPendente();
    navigation.goBack();
  }, [imprimirComandaPendente, navigation]);

  const totalVenda = venda?.total || 0;
  const totalComDesconto = Math.max(0, totalVenda - (parseFloat(desconto.replace(',', '.')) || 0));

  // ════════════════ Catálogo ═════════════════════════════════
  const abrirCatalogo = async () => {
    setModalCatalogo(true);
    if (catalogoProdutos.length === 0) {
      setLoadingCatalogo(true);
      try {
        const [prods, grps] = await Promise.all([getProdutos(''), getGrupos()]);
        setCatalogoProdutos(Array.isArray(prods) ? prods : []);
        setCatalogoGrupos(Array.isArray(grps) ? grps : []);
      } catch { showToast('Erro ao carregar catálogo', 'erro'); }
      finally { setLoadingCatalogo(false); }
    }
  };

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
        vincularCliente({ id: res.id, ...novoCliData });
        setModalNovoCli(false);
        setModalClientes(false);
      } else {
        Alert.alert('Erro', res.message || 'Falha ao cadastrar cliente.');
      }
    } catch {
      showToast('Erro de conexão', 'erro');
    } finally {
      setBuscandoCli(false);
    }
  };

  const vincularCliente = async (cli) => {
    if (!venda?.id) {
        // Se a mesa ainda não está aberta, apenas guardamos o cliente para usar no ABRIR
        setVenda(v => ({ 
            ...(v || {}), 
            id_cliente: cli.id, 
            cliente_nome: cli.nome,
            cliente_nome_manual: cli.id ? null : cli.nome,
            cliente_cpf_manual: cli.id ? null : cli.cpf_cnpj
        }));
        setModalClientes(false);
        return;
    }
    
    setSalvando(true);
    try {
      const res = await mesaPdvAction({
        acao: 'SET_CLIENTE',
        id_venda: venda.id,
        id_cliente: cli.id,
        cliente_nome_manual: cli.id ? null : cli.nome,
        cliente_cpf_manual: cli.id ? null : cli.cpf_cnpj
      });
      if (res.success) {
        await carregarPedido(true);
        setModalClientes(false);
        showToast('Cliente vinculado!', 'ok');
      } else {
        Alert.alert('Erro', res.message || 'Falha ao vincular cliente.');
      }
    } catch {
      showToast('Erro de conexão', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const adicionarDoCatalogo = async (produto) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await adicionarItem(produto, 1);
  };

  const subgruposAtuais = grupoSel
    ? catalogoGrupos.find((g) => g.id == grupoSel)?.subgrupos || []
    : [];

  const produtosFiltradosCat = catalogoProdutos.filter((p) => {
    if (buscaCatalogo.length > 1) {
      const term = buscaCatalogo.toLowerCase();
      if (!p.nome.toLowerCase().includes(term) && !(p.referencia || '').toLowerCase().includes(term))
        return false;
    }
    if (subgrupoSel) {
      if (p.id_grupo != subgrupoSel) return false;
    } else if (grupoSel) {
      if (p.id_grupo != grupoSel && p.grupo_pai_id != grupoSel) return false;
    }
    return true;
  });

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

  // ── Render item ──────────────────────────────────────────
  const renderItem = ({ item, index }) => (
    <View style={styles.itemRow}>
      <View style={styles.itemIndex}>
        <Text style={styles.itemIndexTxt}>{index + 1}</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemNome} numberOfLines={2}>
          {item.produto_nome}
        </Text>
        <Text style={styles.itemPreco}>
          R$ {fmt(item.preco_unitario)} / {item.unidade_venda || 'un'}
        </Text>
      </View>
      <Text style={styles.itemQtd}>
        × {parseFloat(item.quantidade).toFixed(item.quantidade % 1 !== 0 ? 2 : 0)}
      </Text>
      <Text style={styles.itemSubtotal}>R$ {fmt(item.subtotal)}</Text>
      <TouchableOpacity onPress={() => removerItem(item.id)} style={styles.removeBtn}>
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
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
        <TouchableOpacity onPress={handleVoltar} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {mesaParam.nome || `Mesa ${mesaParam.numero}`}
          </Text>
          <TouchableOpacity onPress={() => setModalClientes(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="person-outline" size={14} color="rgba(255,255,255,0.7)" style={{ marginRight: 4 }} />
            <Text style={[styles.headerSub, { maxWidth: 120 }]} numberOfLines={1}>
              {venda?.cliente_nome ? venda.cliente_nome : 'Consumidor Final'}
            </Text>
            <Ionicons name="caret-down" size={10} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerTotal}>
          <Text style={styles.headerTotalLabel}>Total</Text>
          <Text style={styles.headerTotalVal}>R$ {fmt(totalVenda)}</Text>
        </View>
      </View>

      {/* ── Toast ──────────────────────────────────────────── */}
      {toast && (
        <View style={[styles.toast, toast.tipo === 'erro' && styles.toastErro]}>
          <Ionicons
            name={toast.tipo === 'erro' ? 'close-circle' : 'checkmark-circle'}
            size={16}
            color={colors.white}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.toastTxt}>{toast.msg}</Text>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ── Área de busca ──────────────────────────────── */}
        <View style={styles.buscaContainer}>
          <View style={{ flex: 1, position: 'relative' }}>
            <View style={styles.buscaRow}>
              <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={styles.buscaInput}
                value={busca}
                onChangeText={(t) => {
                  setBusca(t);
                  buscarProdutos(t);
                  setProdutoFocus(null);
                }}
                placeholder="Buscar produto por nome ou ref..."
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
              />
              {buscando && <ActivityIndicator color={colors.primary} style={{ marginLeft: 8 }} />}
            </View>
            {buscaResults.length > 0 && (
              <View style={styles.dropdown}>
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
                  {buscaResults.map((p) => (
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
                        <Text style={styles.dropItemRef}>
                          Ref: {p.referencia || 'N/A'} · Est: {p.estoque}
                        </Text>
                      </View>
                      <Text style={styles.dropItemPreco}>R$ {fmt(p.preco_venda)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Qtd + Adicionar */}
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
            {salvando ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Ionicons name="add" size={24} color={colors.white} />
            )}
          </TouchableOpacity>

          {/* Scanner & Catálogo */}
          <TouchableOpacity
            style={[styles.scanBtn, scanContinuo && styles.scanBtnActive]}
            onPress={() => {
              setScanContinuo(true);
              setScannerVisible(true);
            }}
          >
            <Ionicons name="qr-code-outline" size={20} color={scanContinuo ? colors.accent : colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.scanBtn} onPress={abrirCatalogo}>
            <Ionicons name="grid-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Lista de itens ──────────────────────────────── */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : !venda || !venda.itens?.length ? (
          <View style={styles.centered}>
            <MaterialCommunityIcons name="food-outline" size={56} color={colors.textMuted} />
            <Text style={styles.emptyTxt}>Nenhum item ainda</Text>
            <Text style={styles.emptySubTxt}>Escaneie ou busque produtos acima</Text>
          </View>
        ) : (
          <FlatList
            data={venda.itens}
            keyExtractor={(i) => String(i.id)}
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
          <TouchableOpacity
            style={[styles.btnPedirConta, contaSolicitada && styles.btnPedirContaDisabled]}
            onPress={pedirConta}
            disabled={contaSolicitada || solicitandoConta}
          >
            {solicitandoConta ? (
              <ActivityIndicator color="#e65100" size="small" />
            ) : (
              <Ionicons
                name={contaSolicitada ? 'checkmark-done' : 'receipt-outline'}
                size={16}
                color="#e65100"
                style={{ marginRight: 6 }}
              />
            )}
            <Text style={[styles.btnPedirContaTxt, contaSolicitada && styles.btnPedirContaTxtDisabled]}>
              {contaSolicitada ? 'Conta Solicitada' : 'Pedir Conta'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnFecharConta, (!venda?.id || solicitandoConta) && styles.btnDisabled]}
            onPress={() => {
              if (!venda?.id) { showToast('Nenhuma conta em aberto', 'erro'); return; }
              setModalFechar(true);
            }}
            disabled={!venda?.id || solicitandoConta}
          >
            <Ionicons name="checkmark-circle" size={18} color={colors.text} style={{ marginRight: 6 }} />
            <Text style={styles.btnFecharContaTxt}>Fechar Conta</Text>
          </TouchableOpacity>
        </View>
      </View>

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

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupScroll}>
                  <TouchableOpacity style={[styles.groupChip, !grupoSel && styles.groupChipSel]} onPress={() => { setGrupoSel(null); setSubgrupoSel(null); }}>
                    <Text style={[styles.groupChipTxt, !grupoSel && styles.groupChipTxtSel]}>Todos</Text>
                  </TouchableOpacity>
                  {catalogoGrupos.map((g) => (
                    <TouchableOpacity key={g.id} style={[styles.groupChip, grupoSel === g.id && styles.groupChipSel]} onPress={() => { setGrupoSel(g.id); setSubgrupoSel(null); }}>
                      <Text style={[styles.groupChipTxt, grupoSel === g.id && styles.groupChipTxtSel]}>
                        {g.icone ? g.icone + ' ' : ''}{g.nome}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {subgruposAtuais.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.groupScroll, { marginTop: 8 }]}>
                    <TouchableOpacity style={[styles.subgroupChip, !subgrupoSel && styles.subgroupChipSel]} onPress={() => setSubgrupoSel(null)}>
                      <Text style={[styles.subgroupChipTxt, !subgrupoSel && styles.subgroupChipTxtSel]}>Todos</Text>
                    </TouchableOpacity>
                    {subgruposAtuais.map((s) => (
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
                keyExtractor={(item) => String(item.id)}
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
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalFechar(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Fechar Conta</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
            {/* Resumo */}
            {venda?.itens?.length > 0 ? (
              <View style={styles.resumoBox}>
                <Text style={styles.resumoTitle}>Resumo do Pedido</Text>
                {venda.itens.map((i) => (
                  <View key={i.id} style={styles.resumoRow}>
                    <Text style={styles.resumoNome} numberOfLines={1}>{i.produto_nome}</Text>
                    <Text style={styles.resumoQtd}>× {parseFloat(i.quantidade).toFixed(0)}</Text>
                    <Text style={styles.resumoVal}>R$ {fmt(i.subtotal)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ textAlign: 'center', color: colors.textMuted, padding: spacing.md }}>
                Nenhum item no pedido.
              </Text>
            )}

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

            {/* Total */}
            <View style={styles.totalFinalBox}>
              <Text style={styles.totalFinalLabel}>Total a Cobrar</Text>
              <Text style={styles.totalFinalVal}>R$ {fmt(totalComDesconto)}</Text>
            </View>

            {/* Formas de pagamento */}
            <Text style={styles.inputLabel}>Forma de Pagamento</Text>
            <View style={styles.formasGrid}>
              {FORMAS_PAGAMENTO.map((fp) => (
                <TouchableOpacity
                  key={fp.key}
                  style={[styles.formaBtn, forma === fp.key && styles.formaBtnSel]}
                  onPress={() => setForma(fp.key)}
                >
                  <Ionicons
                    name={fp.icon}
                    size={16}
                    color={forma === fp.key ? colors.white : colors.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.formaBtnTxt, forma === fp.key && styles.formaBtnTxtSel]}>
                    {fp.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title={fechando ? 'Registrando...' : 'Confirmar Pagamento'}
              icon={<Ionicons name="checkmark-circle" size={18} color={colors.white} />}
              onPress={confirmarFechamento}
              loading={fechando}
              style={{ marginTop: spacing.sm }}
            />
          </ScrollView>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          Overlay: Selecionar Cliente (Sem usar o componente <Modal> nativo)
      ══════════════════════════════════════════════════════ */}
      {modalClientes && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 999 }]}>
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
                onChangeText={v => setNovoCliData(p => ({ ...p, nome: v }))}
              />
              <Input
                label="CPF ou CNPJ"
                placeholder="Opcional"
                value={novoCliData.cpf_cnpj}
                onChangeText={v => setNovoCliData(p => ({ ...p, cpf_cnpj: v }))}
                keyboardType="numeric"
              />
              <Button 
                title="Usar estes dados" 
                onPress={() => vincularCliente({ id: null, nome: novoCliData.nome, cpf_cnpj: novoCliData.cpf_cnpj })}
                disabled={novoCliData.nome.length < 3}
              />
              {novoCliData.nome.length > 2 && (
                <TouchableOpacity onPress={handleCadastrarCliente} style={{ marginTop: 10, alignSelf: 'center' }}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>+ Cadastrar no banco de dados</Text>
                </TouchableOpacity>
              )}
            </Card>

            <Text style={[styles.modalSectionTitle, { marginTop: spacing.sm }]}>Ou buscar existente</Text>
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
                    onPress={() => vincularCliente(item)}
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
              onPress={() => vincularCliente({ id: null, nome: 'Consumidor Final' })}
            />
          </ScrollView>
        </View>
      )}

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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  headerCenter: { flex: 1 },
  headerTitle: { color: colors.white, fontSize: fontSize.lg, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: fontSize.xs },
  headerTotal: { alignItems: 'flex-end' },
  headerTotalLabel: { color: 'rgba(255,255,255,0.65)', fontSize: fontSize.xs },
  headerTotalVal: { color: colors.accent, fontSize: fontSize.xl, fontWeight: '900' },

  // Toast
  toast: {
    backgroundColor: colors.success, padding: spacing.xs + 4,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
  },
  toastErro: { backgroundColor: colors.danger },
  toastTxt: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },

  // Busca
  buscaContainer: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.white, padding: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, ...shadow.sm,
  },
  buscaRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.sm, height: 46,
  },
  buscaInput: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  dropdown: {
    position: 'absolute', top: 50, left: 0, right: 0,
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, zIndex: 100, ...shadow.md,
  },
  dropItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  dropItemSelected: { backgroundColor: colors.primary + '12' },
  dropItemNome: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  dropItemRef: { fontSize: fontSize.xs, color: colors.textMuted },
  dropItemPreco: { fontSize: fontSize.sm, fontWeight: '800', color: colors.primary },
  qtdInput: {
    width: 52, height: 46, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, textAlign: 'center',
    fontSize: fontSize.md, fontWeight: '700', color: colors.primary,
    backgroundColor: colors.background,
  },
  addBtn: {
    width: 46, height: 46, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  addBtnDisabled: { backgroundColor: colors.border },
  scanBtn: {
    width: 44, height: 46, borderRadius: radius.md,
    backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  scanBtnActive: { backgroundColor: colors.accent + '22', borderColor: colors.accent },

  // Itens
  listaContent: { padding: spacing.md, paddingBottom: 120, gap: spacing.sm },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.sm, gap: spacing.xs, ...shadow.sm,
  },
  itemIndex: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  itemIndexTxt: { color: colors.white, fontSize: 11, fontWeight: '800' },
  itemInfo: { flex: 1 },
  itemNome: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  itemPreco: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  itemQtd: { fontSize: fontSize.sm, color: colors.textSecondary, minWidth: 30, textAlign: 'center' },
  itemSubtotal: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary, minWidth: 70, textAlign: 'right' },
  removeBtn: { padding: 4 },

  emptyTxt: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.md },
  emptySubTxt: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },

  // Footer
  footer: {
    backgroundColor: colors.white, padding: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, ...shadow.md,
  },
  footerTotal: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.sm,
  },
  footerTotalLabel: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  footerTotalVal: { fontSize: 26, fontWeight: '900', color: colors.primary },
  footerBtns: { flexDirection: 'row', gap: spacing.sm },
  btnPedirConta: {
    flex: 1, flexDirection: 'row', paddingVertical: 13, borderRadius: radius.md,
    backgroundColor: '#fff3e0', borderWidth: 2, borderColor: '#ffb300',
    alignItems: 'center', justifyContent: 'center',
  },
  btnPedirContaDisabled: {
    opacity: 0.6,
    backgroundColor: '#e8e8e8',
    borderColor: '#aaa',
  },
  btnPedirContaTxt: { color: '#e65100', fontWeight: '800', fontSize: fontSize.sm },
  btnPedirContaTxtDisabled: { color: '#888' },
  btnFecharConta: {
    flex: 1.4, flexDirection: 'row', paddingVertical: 13, borderRadius: radius.md,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  btnFecharContaTxt: { color: colors.text, fontWeight: '900', fontSize: fontSize.md },
  btnDisabled: { opacity: 0.45 },

  // Modais
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

  resumoBox: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, gap: spacing.xs, ...shadow.sm,
  },
  resumoTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  resumoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  resumoNome: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  resumoQtd: { fontSize: fontSize.sm, color: colors.textMuted, marginHorizontal: spacing.sm },
  resumoVal: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },

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
  totalFinalLabel: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.primary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  totalFinalVal: { fontSize: 28, fontWeight: '900', color: colors.primary },

  formasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  formaBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  formaBtnSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  formaBtnTxt: { fontSize: fontSize.sm, fontWeight: '700', color: colors.textSecondary },
  formaBtnTxtSel: { color: colors.white },
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
  catItemRef: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  catItemPreco: { fontSize: 16, fontWeight: '900', color: colors.primary, marginTop: 4 },
  catItemEstoque: { fontSize: 11, color: colors.textSecondary, marginBottom: 8, fontWeight: '600' },
  catAddBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    ...shadow.sm,
  },

  // Clientes
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