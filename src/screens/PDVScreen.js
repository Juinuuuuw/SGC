// src/screens/PDVScreen.js
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Alert, Modal, ScrollView, Animated, Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../context/CartContext';
import BarcodeScanner from '../components/BarcodeScanner';
import { Button, Card, EmptyState, Input } from '../components/ui';
import {
  getProdutos, getCaixaAtivo, abrirCaixa, fecharCaixa, finalizarVenda,
} from '../services/api';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import { useFocusEffect } from '@react-navigation/native';

const FORMAS_PAGAMENTO = [
  { id: 'DINHEIRO',       label: 'Dinheiro', icon: '💵' },
  { id: 'CARTAO_DEBITO',  label: 'Débito',   icon: '💳' },
  { id: 'CARTAO_CREDITO', label: 'Crédito',  icon: '💎' },
  { id: 'PIX',            label: 'Pix',      icon: '📱' },
];

export default function PDVScreen() {
  const insets = useSafeAreaInsets();
  const { cart, dispatch, total, qtdItens } = useCart();

  const [scannerOpen,     setScannerOpen]     = useState(false);
  const [barcodeInput,    setBarcodeInput]    = useState('');
  const [produtos,        setProdutos]        = useState([]);
  const [searchResults,   setSearchResults]   = useState([]);
  const [showSearch,      setShowSearch]      = useState(false);
  const [caixa,           setCaixa]           = useState(null);

  // modais
  const [caixaModal,      setCaixaModal]      = useState(false);
  const [fecharModal,     setFecharModal]     = useState(false);
  const [finalizarModal,  setFinalizarModal]  = useState(false);

  // form abrir caixa
  const [saldoInicial,    setSaldoInicial]    = useState('');

  // form fechar caixa
  const [saldoFechamento, setSaldoFechamento] = useState('');
  const [obsFechar,       setObsFechar]       = useState('');
  const [fechando,        setFechando]        = useState(false);

  // form finalizar venda
  const [formaPagamento,  setFormaPagamento]  = useState('DINHEIRO');
  const [desconto,        setDesconto]        = useState('');
  const [valorRecebido,   setValorRecebido]   = useState('');
  const [saving,          setSaving]          = useState(false);

  const barcodeRef = useRef(null);
  const flashAnim  = useRef(new Animated.Value(0)).current;

  // ── Carrega dados ao entrar na tela ──────────────────────
  useFocusEffect(useCallback(() => {
    loadData();
  }, []));

  const loadData = async () => {
    try {
      const [prods, caixaData] = await Promise.all([getProdutos(), getCaixaAtivo()]);
      setProdutos(Array.isArray(prods) ? prods : []);

      // getCaixaAtivo retorna objeto | null
      const caixaAtivo = caixaData && caixaData.id ? caixaData : null;
      setCaixa(caixaAtivo);

      if (!caixaAtivo) setCaixaModal(true);
    } catch {
      // sem conexão — permite uso offline (sem caixa)
    }
  };

  // ── Flash de feedback ──────────────────────────────────
  const flashFeedback = (ok = true) => {
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: ok ? 1 : -1, duration: 0,   useNativeDriver: false }),
      Animated.timing(flashAnim, { toValue: 0,            duration: 400, useNativeDriver: false }),
    ]).start();
  };

  // ── Busca de produto ───────────────────────────────────
  const buscarProduto = (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return produtos.find(p =>
      p.referencia?.toLowerCase() === q ||
      String(p.id) === q ||
      p.nome?.toLowerCase().includes(q)
    );
  };

  const adicionarProduto = (produto, qtd = 1) => {
    if (!produto) {
      Vibration.vibrate([0, 80, 40, 80]);
      flashFeedback(false);
      return;
    }
    if (produto.estoque < qtd) {
      Alert.alert('Estoque insuficiente', `Apenas ${produto.estoque} ${produto.unidade_venda || 'UN'} disponíveis.`);
      return;
    }
    dispatch({ type: 'ADD_ITEM', payload: { produto, quantidade: qtd } });
    Vibration.vibrate(60);
    flashFeedback(true);
    setBarcodeInput('');
    setShowSearch(false);
    setTimeout(() => barcodeRef.current?.focus(), 100);
  };

  const onBarcodeScanned = (data) => {
    setScannerOpen(false);
    const prod = buscarProduto(data);
    if (prod) {
      adicionarProduto(prod, 1);
    } else {
      Alert.alert('Produto não encontrado', `Código: ${data}\nVerifique o cadastro.`);
    }
  };

  const onBarcodeInputSubmit = () => {
    const val = barcodeInput.trim();
    if (!val) return;

    setShowSearch(false);

    // Formato QTD*COD — ex: "2*7891234567890" ou "3*REFPROD"
    const starIndex = val.indexOf('*');
    if (starIndex > 0) {
      const parteQtd = val.substring(0, starIndex).trim();
      const parteCod = val.substring(starIndex + 1).trim();
      const possQtd  = parseFloat(parteQtd.replace(',', '.'));

      if (!isNaN(possQtd) && possQtd > 0 && parteCod.length > 0) {
        const prod = buscarProduto(parteCod);
        if (!prod) {
          Alert.alert('Produto não encontrado', `Código: "${parteCod}"\nVerifique o cadastro.`);
          setBarcodeInput('');
          return;
        }
        adicionarProduto(prod, possQtd);
        return;
      }
    }

    // Sem *, trata como código/nome direto
    const prod = buscarProduto(val);
    if (!prod) {
      Alert.alert('Produto não encontrado', `"${val}"\nVerifique o código ou nome.`);
      setBarcodeInput('');
      return;
    }
    adicionarProduto(prod, 1);
  };

  const onSearchChange = (text) => {
    setBarcodeInput(text);

    // Se contém *, é formato QTD*COD — não abre dropdown
    if (text.includes('*')) {
      setShowSearch(false);
      return;
    }

    if (text.length >= 2) {
      const results = produtos
        .filter(p =>
          p.nome?.toLowerCase().includes(text.toLowerCase()) ||
          p.referencia?.toLowerCase().includes(text.toLowerCase())
        )
        .slice(0, 8);
      setSearchResults(results);
      setShowSearch(results.length > 0);
    } else {
      setShowSearch(false);
    }
  };

  // ── Abrir caixa ────────────────────────────────────────
  const handleAbrirCaixa = async () => {
    const saldo = parseFloat(saldoInicial.replace(',', '.')) || 0;
    try {
      const res = await abrirCaixa(saldo);
      if (res?.success || res?.id) {
        const caixaAberto = res.caixa || { id: res.id, saldo_atual: saldo };
        setCaixa(caixaAberto);
        setSaldoInicial('');
        setCaixaModal(false);
      } else {
        Alert.alert('Erro', res?.message || 'Não foi possível abrir o caixa.');
      }
    } catch (e) {
      Alert.alert('Erro de conexão', 'Verifique o servidor e tente novamente.');
    }
  };

  // ── Fechar caixa ───────────────────────────────────────
  const handleFecharCaixa = async () => {
    if (!caixa?.id) return;
    if (cart.itens.length > 0) {
      Alert.alert(
        'Carrinho em aberto',
        'Há itens no carrinho. Finalize ou limpe a venda antes de fechar o caixa.',
        [{ text: 'OK' }]
      );
      return;
    }
    const saldo = parseFloat(saldoFechamento.replace(',', '.')) || 0;
    setFechando(true);
    try {
      const res = await fecharCaixa(caixa.id, saldo, obsFechar);
      if (res?.success) {
        setCaixa(null);
        setSaldoFechamento('');
        setObsFechar('');
        setFecharModal(false);
        Alert.alert('✅ Caixa fechado', 'O caixa foi encerrado com sucesso.');
      } else {
        Alert.alert('Erro', res?.message || 'Não foi possível fechar o caixa.');
      }
    } catch {
      Alert.alert('Erro de conexão', 'Verifique o servidor e tente novamente.');
    } finally {
      setFechando(false);
    }
  };

  // ── Finalizar venda ────────────────────────────────────
  const handleFinalizar = async () => {
    if (cart.itens.length === 0) return;
    setSaving(true);
    try {
      const desc = parseFloat(desconto.replace(',', '.')) || 0;
      const venda = {
        id_caixa: caixa?.id,
        itens: cart.itens.map(i => ({
          id_produto:    i.id,
          quantidade:    i.quantidade,
          preco_unitario: i.preco_venda,
        })),
        valor_total:    total,
        valor_desconto: desc,
        forma_pagamento: formaPagamento,
      };
      const res = await finalizarVenda(venda);
      if (res?.success || res?.id_venda) {
        dispatch({ type: 'LIMPAR' });
        setFinalizarModal(false);
        setDesconto('');
        setValorRecebido('');
        Alert.alert('✅ Venda finalizada!', `Total: R$ ${(total - desc).toFixed(2).replace('.', ',')}`);
      } else {
        Alert.alert('Erro', res?.message || 'Não foi possível registrar a venda.');
      }
    } catch (e) {
      Alert.alert('Erro', e?.response?.data?.message || 'Falha ao comunicar com o servidor.');
    } finally {
      setSaving(false);
    }
  };

  const totalComDesconto = total - (parseFloat(desconto.replace(',', '.')) || 0);
  const troco = valorRecebido
    ? Math.max(0, parseFloat(valorRecebido.replace(',', '.')) - totalComDesconto)
    : 0;

  const bgColor = flashAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [colors.dangerLight, colors.background, colors.successLight],
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor: bgColor, paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🏪 PDV</Text>
          <Text style={styles.headerSub}>
            {caixa ? `Caixa #${caixa.id} · R$ ${parseFloat(caixa.saldo_atual || 0).toFixed(2)}` : 'Nenhum caixa aberto'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {/* Fechar caixa */}
          {caixa && (
            <TouchableOpacity style={styles.headerBtn} onPress={() => setFecharModal(true)}>
              <Text style={styles.headerBtnTxt}>🔒</Text>
            </TouchableOpacity>
          )}
          {/* Carrinho */}
          <TouchableOpacity
            style={styles.cartBadge}
            onPress={() => cart.itens.length > 0 && setFinalizarModal(true)}
          >
            <Text style={styles.cartIcon}>🛒</Text>
            {qtdItens > 0 && (
              <View style={styles.cartCount}>
                <Text style={styles.cartCountTxt}>{qtdItens}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Barra de leitura ── */}
      <View style={styles.scanBar}>
        <TouchableOpacity style={styles.cameraBtn} onPress={() => setScannerOpen(true)}>
          <Text style={styles.cameraBtnTxt}>📷</Text>
        </TouchableOpacity>
        <TextInput
          ref={barcodeRef}
          style={styles.barcodeInput}
          value={barcodeInput}
          onChangeText={onSearchChange}
          onSubmitEditing={onBarcodeInputSubmit}
          placeholder="Código de barras ou nome..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {barcodeInput.length > 0 && (
          <TouchableOpacity onPress={() => { setBarcodeInput(''); setShowSearch(false); }}>
            <Text style={{ fontSize: 18, padding: 6, color: colors.textSecondary }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Dica de formato — muda conforme o usuário digita */}
      {(() => {
        const starIdx = barcodeInput.indexOf('*');
        if (starIdx > 0) {
          const qtdParte = barcodeInput.substring(0, starIdx);
          const codParte = barcodeInput.substring(starIdx + 1);
          const qtdNum   = parseFloat(qtdParte);
          if (!isNaN(qtdNum) && qtdNum > 0) {
            return (
              <Text style={[styles.hint, { color: colors.primary, fontWeight: '600' }]}>
                ✅ {qtdNum}x · agora digite o código e pressione Enter
                {codParte.length > 0 ? ` → "${codParte}"` : ''}
              </Text>
            );
          }
        }
        return (
          <Text style={styles.hint}>
            Dica: <Text style={{ fontWeight: '700' }}>2*COD</Text> adiciona 2 unidades de uma vez
          </Text>
        );
      })()}

      {/* ── Dropdown de busca ── */}
      {showSearch && (
        <View style={styles.searchDropdown}>
          {searchResults.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.searchItem}
              onPress={() => adicionarProduto(p, 1)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.searchItemName} numberOfLines={1}>{p.nome}</Text>
                <Text style={styles.searchItemRef}>Ref: {p.referencia || '—'} · Estoque: {p.estoque}</Text>
              </View>
              <Text style={styles.searchItemPrice}>R$ {parseFloat(p.preco_venda).toFixed(2)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Carrinho ── */}
      <View style={styles.cartArea}>
        {cart.itens.length === 0 ? (
          <EmptyState
            icon="🛒"
            title="Caixa livre"
            subtitle="Leia um código de barras ou pesquise um produto"
          />
        ) : (
          <FlatList
            data={cart.itens}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingBottom: 130 }}
            renderItem={({ item, index }) => (
              <CartItem
                item={item}
                index={index}
                onRemove={() => dispatch({ type: 'REMOVE_ITEM', payload: item.id })}
                onUpdateQtd={(qtd) => dispatch({ type: 'UPDATE_QTD', payload: { id: item.id, quantidade: qtd } })}
              />
            )}
          />
        )}
      </View>

      {/* ── Footer total ── */}
      {cart.itens.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{qtdItens} {qtdItens === 1 ? 'item' : 'itens'}</Text>
            <Text style={styles.totalValue}>R$ {total.toFixed(2).replace('.', ',')}</Text>
          </View>
          <TouchableOpacity style={styles.finalizarBtn} onPress={() => setFinalizarModal(true)}>
            <Text style={styles.finalizarTxt}>Finalizar venda →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Scanner ── */}
      <BarcodeScanner
        visible={scannerOpen}
        onScan={onBarcodeScanned}
        onClose={() => setScannerOpen(false)}
      />

      {/* ════════ Modal: Abrir Caixa ════════ */}
      <Modal visible={caixaModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <Card style={styles.centeredCard}>
            <Text style={styles.modalIcon}>💰</Text>
            <Text style={styles.modalTitle}>Abrir Caixa</Text>
            <Text style={styles.modalSub}>Informe o saldo inicial para começar as vendas</Text>
            <Input
              label="Saldo inicial (R$)"
              icon="💵"
              value={saldoInicial}
              onChangeText={setSaldoInicial}
              placeholder="0,00"
              keyboardType="decimal-pad"
              style={{ marginTop: spacing.md }}
            />
            <Button title="Abrir Caixa" onPress={handleAbrirCaixa} style={{ marginTop: spacing.sm }} />
            <Button
              title="Continuar sem caixa"
              onPress={() => setCaixaModal(false)}
              variant="ghost"
              style={{ marginTop: spacing.xs }}
            />
          </Card>
        </View>
      </Modal>

      {/* ════════ Modal: Fechar Caixa ════════ */}
      <Modal visible={fecharModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <Card style={styles.centeredCard}>
            <Text style={styles.modalIcon}>🔒</Text>
            <Text style={styles.modalTitle}>Fechar Caixa</Text>
            <Text style={styles.modalSub}>
              Saldo atual: R$ {parseFloat(caixa?.saldo_atual || 0).toFixed(2).replace('.', ',')}
            </Text>

            <Input
              label="Saldo em caixa (R$)"
              icon="💵"
              value={saldoFechamento}
              onChangeText={setSaldoFechamento}
              placeholder="Valor contado fisicamente"
              keyboardType="decimal-pad"
              style={{ marginTop: spacing.md }}
            />
            <Input
              label="Observações (opcional)"
              icon="📝"
              value={obsFechar}
              onChangeText={setObsFechar}
              placeholder="Ex: sem ocorrências"
              style={{ marginTop: spacing.xs }}
            />

            {/* Diferença */}
            {saldoFechamento !== '' && (() => {
              const esperado = parseFloat(caixa?.saldo_atual || 0);
              const contado  = parseFloat(saldoFechamento.replace(',', '.')) || 0;
              const diff     = contado - esperado;
              const isOk     = Math.abs(diff) < 0.01;
              return (
                <View style={[styles.diffBox, { backgroundColor: isOk ? colors.successLight : colors.dangerLight }]}>
                  <Text style={[styles.diffLabel, { color: isOk ? colors.success : colors.danger }]}>
                    {isOk ? '✅ Caixa fechado' : diff > 0 ? '⬆️ Sobra' : '⬇️ Falta'}
                  </Text>
                  {!isOk && (
                    <Text style={[styles.diffValue, { color: colors.danger }]}>
                      R$ {Math.abs(diff).toFixed(2).replace('.', ',')}
                    </Text>
                  )}
                </View>
              );
            })()}

            <Button
              title="Confirmar Fechamento"
              onPress={handleFecharCaixa}
              loading={fechando}
              variant="danger"
              style={{ marginTop: spacing.sm }}
            />
            <Button
              title="Cancelar"
              onPress={() => setFecharModal(false)}
              variant="ghost"
              style={{ marginTop: spacing.xs }}
            />
          </Card>
        </View>
      </Modal>

      {/* ════════ Modal: Finalizar Venda ════════ */}
      <Modal visible={finalizarModal} transparent animationType="slide">
        {/* Fundo escuro — ao clicar fora, fecha */}
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setFinalizarModal(false)}
        >
          {/* O card é um filho, stopPropagation evita que o toque interno feche */}
          <TouchableOpacity activeOpacity={1} style={styles.bottomSheet}>
            {/* Handle */}
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>💳 Finalizar Venda</Text>
              <TouchableOpacity onPress={() => setFinalizarModal(false)}>
                <Text style={{ fontSize: 22, color: colors.textSecondary }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: spacing.md, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Resumo de itens */}
              {cart.itens.map((item) => (
                <View key={item.id} style={styles.finalizarItem}>
                  <Text style={styles.finalizarItemNome} numberOfLines={1}>{item.nome}</Text>
                  <Text style={styles.finalizarItemQtd}>{item.quantidade}x</Text>
                  <Text style={styles.finalizarItemTotal}>
                    R$ {(item.quantidade * parseFloat(item.preco_venda)).toFixed(2)}
                  </Text>
                </View>
              ))}

              {/* Desconto */}
              <Input
                label="Desconto (R$)"
                icon="🏷️"
                value={desconto}
                onChangeText={setDesconto}
                placeholder="0,00"
                keyboardType="decimal-pad"
                style={{ marginTop: spacing.md }}
              />

              {/* Total */}
              <View style={styles.totalBox}>
                <Text style={styles.totalBoxLabel}>Total a pagar</Text>
                <Text style={styles.totalBoxValue}>
                  R$ {Math.max(0, totalComDesconto).toFixed(2).replace('.', ',')}
                </Text>
              </View>

              {/* Formas de pagamento */}
              <Text style={styles.payLabel}>Forma de pagamento</Text>
              <View style={styles.payGrid}>
                {FORMAS_PAGAMENTO.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.payOption, formaPagamento === f.id && styles.payOptionActive]}
                    onPress={() => setFormaPagamento(f.id)}
                  >
                    <Text style={styles.payOptionIcon}>{f.icon}</Text>
                    <Text style={[styles.payOptionLabel, formaPagamento === f.id && styles.payOptionLabelActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Troco — só para dinheiro */}
              {formaPagamento === 'DINHEIRO' && (
                <>
                  <Input
                    label="Valor recebido (R$)"
                    icon="💵"
                    value={valorRecebido}
                    onChangeText={setValorRecebido}
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                  />
                  {troco > 0 && (
                    <View style={styles.trocoBox}>
                      <Text style={styles.trocoLabel}>Troco</Text>
                      <Text style={styles.trocoValue}>R$ {troco.toFixed(2).replace('.', ',')}</Text>
                    </View>
                  )}
                </>
              )}

              <Button
                title="✅ Confirmar Venda"
                onPress={handleFinalizar}
                loading={saving}
                variant="success"
                style={{ marginTop: spacing.md }}
              />
              <Button
                title="🗑️ Limpar carrinho"
                onPress={() => { dispatch({ type: 'LIMPAR' }); setFinalizarModal(false); }}
                variant="ghost"
                style={{ marginTop: spacing.xs }}
              />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Animated.View>
  );
}

// ── CartItem ─────────────────────────────────────────────
function CartItem({ item, index, onRemove, onUpdateQtd }) {
  const [editMode, setEditMode] = useState(false);
  const [qtdText, setQtdText]   = useState(String(item.quantidade));

  const commitQtd = () => {
    const val = parseFloat(qtdText.replace(',', '.'));
    if (!isNaN(val) && val > 0) onUpdateQtd(val);
    else setQtdText(String(item.quantidade));
    setEditMode(false);
  };

  return (
    <View style={ci.row}>
      <View style={ci.indexBadge}>
        <Text style={ci.indexTxt}>{index + 1}</Text>
      </View>
      <View style={ci.info}>
        <Text style={ci.name} numberOfLines={1}>{item.nome}</Text>
        <Text style={ci.price}>
          R$ {parseFloat(item.preco_venda).toFixed(2)} / {item.unidade_venda || 'UN'}
        </Text>
      </View>
      <View style={ci.qtdArea}>
        <TouchableOpacity style={ci.qtdBtn} onPress={() => onUpdateQtd(item.quantidade - 1)}>
          <Text style={ci.qtdBtnTxt}>−</Text>
        </TouchableOpacity>

        {editMode ? (
          <TextInput
            style={ci.qtdInput}
            value={qtdText}
            onChangeText={setQtdText}
            onBlur={commitQtd}
            onSubmitEditing={commitQtd}
            keyboardType="decimal-pad"
            autoFocus
          />
        ) : (
          <TouchableOpacity onPress={() => { setQtdText(String(item.quantidade)); setEditMode(true); }}>
            <Text style={ci.qtdValue}>{item.quantidade}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[ci.qtdBtn, { backgroundColor: colors.success }]} onPress={() => onUpdateQtd(item.quantidade + 1)}>
          <Text style={ci.qtdBtnTxt}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={ci.totalArea}>
        <Text style={ci.total}>
          R$ {(item.quantidade * parseFloat(item.preco_venda)).toFixed(2)}
        </Text>
        <TouchableOpacity onPress={onRemove} style={ci.removeBtn}>
          <Text style={ci.removeTxt}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────
const ci = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: spacing.md, marginBottom: spacing.xs,
    borderRadius: radius.md, padding: spacing.sm, ...shadow.sm,
  },
  indexBadge: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary + '18',
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  indexTxt:  { fontSize: fontSize.xs, fontWeight: '700', color: colors.primary },
  info:      { flex: 1, marginRight: spacing.xs },
  name:      { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  price:     { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  qtdArea:   { flexDirection: 'row', alignItems: 'center', marginRight: spacing.xs },
  qtdBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  qtdBtnTxt: { color: colors.white, fontSize: 18, fontWeight: '700', lineHeight: 22 },
  qtdValue:  { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginHorizontal: 10, minWidth: 24, textAlign: 'center' },
  qtdInput:  { fontSize: fontSize.md, fontWeight: '700', color: colors.text, marginHorizontal: 4, minWidth: 36, borderBottomWidth: 1, borderColor: colors.primary, textAlign: 'center' },
  totalArea: { alignItems: 'flex-end', minWidth: 72 },
  total:     { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  removeBtn: { padding: 4 },
  removeTxt: { fontSize: 16 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },

  // header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.white },
  headerSub:   { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.65)' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerBtnTxt: { fontSize: 20 },
  cartBadge:    { position: 'relative', padding: 8 },
  cartIcon:     { fontSize: 26 },
  cartCount: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: colors.accent, borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  cartCountTxt: { fontSize: 11, color: colors.white, fontWeight: '800' },

  // scan bar
  scanBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, margin: spacing.md,
    borderRadius: radius.md, ...shadow.md, paddingRight: spacing.sm,
  },
  cameraBtn: {
    width: 52, height: 52, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.md,
  },
  cameraBtnTxt: { fontSize: 24 },
  barcodeInput: { flex: 1, height: 52, paddingHorizontal: spacing.sm, fontSize: fontSize.md, color: colors.text },
  hint: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xs },

  // search dropdown
  searchDropdown: {
    backgroundColor: colors.white, marginHorizontal: spacing.md,
    borderRadius: radius.md, ...shadow.md, marginBottom: spacing.xs, overflow: 'hidden',
  },
  searchItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.sm, borderBottomWidth: 1, borderColor: colors.border,
  },
  searchItemName:  { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  searchItemRef:   { fontSize: fontSize.xs, color: colors.textSecondary },
  searchItemPrice: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },

  cartArea: { flex: 1 },

  // footer
  footer: {
    backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, ...shadow.lg,
  },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  totalLabel:  { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '500' },
  totalValue:  { fontSize: fontSize.xxl, fontWeight: '800', color: colors.primary },
  finalizarBtn: { backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  finalizarTxt: { color: colors.white, fontSize: fontSize.lg, fontWeight: '800' },

  // overlay genérico (fundo escuro dos modais)
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },

  // card centralizado (abrir/fechar caixa)
  centeredCard: { width: '100%', maxWidth: 380, alignItems: 'center' },
  modalIcon:  { fontSize: 56, marginBottom: spacing.sm },
  modalTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  modalSub:   { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xs },

  // diferença caixa
  diffBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm,
  },
  diffLabel: { fontSize: fontSize.sm, fontWeight: '700' },
  diffValue: { fontSize: fontSize.lg, fontWeight: '800' },

  // bottom sheet (finalizar venda)
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    maxHeight: '92%', ...shadow.lg,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginTop: spacing.sm, marginBottom: spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },

  // itens do resumo
  finalizarItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, borderBottomWidth: 1, borderColor: colors.border + '44',
  },
  finalizarItemNome:  { flex: 1, fontSize: fontSize.sm, color: colors.text },
  finalizarItemQtd:   { fontSize: fontSize.sm, color: colors.textSecondary, marginHorizontal: spacing.sm },
  finalizarItemTotal: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary, minWidth: 72, textAlign: 'right' },

  // total box
  totalBox: {
    backgroundColor: colors.primary + '12', borderRadius: radius.md, padding: spacing.md,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md,
  },
  totalBoxLabel: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  totalBoxValue: { fontSize: fontSize.xxl, color: colors.primary, fontWeight: '800' },

  // formas de pagamento
  payLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  payGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  payOption: {
    flex: 1, minWidth: '45%', alignItems: 'center', padding: spacing.sm,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  payOptionActive:      { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  payOptionIcon:        { fontSize: 26, marginBottom: 4 },
  payOptionLabel:       { fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary },
  payOptionLabelActive: { color: colors.primary },

  // troco
  trocoBox: {
    backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.sm,
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm,
  },
  trocoLabel: { fontSize: fontSize.md, color: colors.success, fontWeight: '600' },
  trocoValue: { fontSize: fontSize.xl, color: colors.success, fontWeight: '800' },
});
