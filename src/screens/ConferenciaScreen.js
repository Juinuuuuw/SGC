// src/screens/ConferenciaScreen.js
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, Modal, ScrollView, TextInput, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { XMLParser } from 'fast-xml-parser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BarcodeScanner from '../components/BarcodeScanner';
import { Button, Card, EmptyState, Badge, Input } from '../components/ui';
import { getFornecedores, salvarConferencia } from '../services/api';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import { useFocusEffect } from '@react-navigation/native';

const MODOS = {
  INICIO: 'INICIO',
  XML: 'XML',
  MANUAL: 'MANUAL',
  CONFERINDO: 'CONFERINDO',
};

export default function ConferenciaScreen() {
  const insets = useSafeAreaInsets();
  const [modo, setModo] = useState(MODOS.INICIO);
  const [fornecedores, setFornecedores] = useState([]);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState(null);
  const [numeroNota, setNumeroNota] = useState('');
  const [itensConferencia, setItensConferencia] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [resumoModal, setResumoModal] = useState(false);
  const [fornecedorModal, setFornecedorModal] = useState(false);
  const [searchForn, setSearchForn] = useState('');
  const barcodeRef = useRef(null);

  useFocusEffect(useCallback(() => {
    getFornecedores().then(data => setFornecedores(Array.isArray(data) ? data : [])).catch(() => {});
  }, []));

  // ── XML Import ──────────────────────────────────────────
  const importarXML = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/xml', copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      processarXML(content);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível ler o arquivo XML.');
    }
  };

  const processarXML = (xmlContent) => {
    try {
      // Bug 1 corrigido: parseTagValue:false impede que números virem number,
      // mantendo cEAN, cProd, NCM como string (evita falha nas comparações)
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseTagValue: false,       // ← tudo vira string, sem conversão automática
        trimValues: true,
      });
      const json = parser.parse(xmlContent);

      // Bug 2 corrigido: navegação robusta cobrindo NFe raiz, nfeProc e nfeProcResult
      // Estruturas possíveis:
      //   <NFe>         → json.NFe.infNFe
      //   <nfeProc>     → json.nfeProc.NFe.infNFe
      const nfe =
        json?.NFe?.infNFe ||           // <NFe><infNFe> (mais comum nos exemplos)
        json?.nfeProc?.NFe?.infNFe ||  // <nfeProc><NFe><infNFe>
        json?.nfeProcResult?.NFe?.infNFe;

      if (!nfe) throw new Error('Estrutura de NF-e não reconhecida.');

      // Fornecedor
      const emit    = nfe.emit || {};
      // Bug 3 corrigido: String() garante que valores numéricos virem string
      const cnpjForn = String(emit.CNPJ || '').replace(/\D/g, '');
      const nomeForn  = emit.xFant || emit.xNome || 'Fornecedor não identificado';
      const numNota   = String(nfe.ide?.nNF || '');

      setNumeroNota(numNota);

      const fornEncontrado = fornecedores.find(
        f => (f.cnpj || '').replace(/\D/g, '') === cnpjForn
      );
      setFornecedorSelecionado(
        fornEncontrado || { cnpj: cnpjForn, razao_social: String(nomeForn), id: null }
      );

      // Itens — det pode ser objeto único ou array
      const dets = Array.isArray(nfe.det) ? nfe.det : nfe.det ? [nfe.det] : [];

      if (dets.length === 0) throw new Error('Nenhum item encontrado na NF-e.');

      const itens = dets.map((det, i) => {
        const prod = det.prod || {};
        // Todos os campos convertidos para string antes de usar
        const cProd = String(prod.cProd || '').trim();
        const cEAN  = String(prod.cEAN  || '').trim();
        const ncm   = String(prod.NCM   || prod.ncm || '').trim();
        const nome  = String(prod.xProd || 'Produto').trim();
        const unid  = String(prod.uCom  || 'UN').trim();
        // Quantidades e preços: parseFloat de string agora (parseTagValue:false)
        const qtd   = parseFloat(prod.qCom   || '0') || 0;
        const preco = parseFloat(prod.vUnCom  || '0') || 0;

        return {
          _id:          i,
          cProd,
          cEAN,
          nome,
          ncm,
          unidade:      unid,
          qtdNota:      qtd,
          precoUnitario: preco,
          qtdConferida: 0,
          status:       'PENDENTE',
        };
      });

      setItensConferencia(itens);
      setModo(MODOS.CONFERINDO);
    } catch (e) {
      Alert.alert('XML inválido', 'Verifique se o arquivo é uma NF-e válida.\n\nDetalhe: ' + e.message);
    }
  };

  // ── Manual ──────────────────────────────────────────────
  const adicionarItemManual = () => {
    setItensConferencia(prev => [
      ...prev,
      {
        _id: Date.now(),
        cProd: '',
        cEAN: '',
        nome: '',
        ncm: '',
        unidade: 'UN',
        qtdNota: 0,
        precoUnitario: 0,
        qtdConferida: 0,
        status: 'PENDENTE',
      },
    ]);
    setModo(MODOS.CONFERINDO);
  };

  // ── Barcode scan na conferência ─────────────────────────
  const onBarcodeScanned = (data) => {
    setScannerOpen(false);
    const codigo = String(data).trim();
    // Compara como string dos dois lados — cProd e cEAN já são strings após a correção
    const idx = itensConferencia.findIndex(
      i => String(i.cEAN).trim() === codigo || String(i.cProd).trim() === codigo
    );
    if (idx >= 0) {
      confirmarItemPorIndex(idx, 1);
    } else {
      Alert.alert('Produto não encontrado', `Código: ${codigo}\nEsse produto não está na nota.`);
    }
  };

  const onBarcodeInputSubmit = () => {
    const val = barcodeInput.trim();
    if (!val) return;
    const idx = itensConferencia.findIndex(
      i =>
        String(i.cEAN).trim()  === val ||
        String(i.cProd).trim() === val ||
        i.nome.toLowerCase().includes(val.toLowerCase())
    );
    if (idx >= 0) {
      confirmarItemPorIndex(idx, 1);
      setBarcodeInput('');
    } else {
      Alert.alert('Não encontrado', `"${val}" não está na lista da nota.`);
      setBarcodeInput('');
    }
  };

  const confirmarItemPorIndex = (idx, delta) => {
    setItensConferencia(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const novaQtd = item.qtdConferida + delta;
      const status =
        novaQtd === 0 ? 'PENDENTE'
        : novaQtd === item.qtdNota ? 'OK'
        : 'DIVERGENCIA';
      return { ...item, qtdConferida: Math.max(0, novaQtd), status };
    }));
  };

  const updateItemField = (idx, field, value) => {
    setItensConferencia(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'qtdConferida') {
        const qtd = parseFloat(value) || 0;
        updated.qtdConferida = qtd;
        updated.status = qtd === 0 ? 'PENDENTE' : qtd === item.qtdNota ? 'OK' : 'DIVERGENCIA';
      }
      return updated;
    }));
  };

  // ── Salvar ──────────────────────────────────────────────
  const salvar = async () => {
    if (!numeroNota.trim()) {
      Alert.alert('Atenção', 'Informe o número da nota fiscal.');
      return;
    }
    setSaving(true);
    try {
      const dados = {
        id_fornecedor: fornecedorSelecionado?.id,
        numero_nota: numeroNota,
        itens: itensConferencia.map(i => ({
          id_produto: i.id_produto || null,
          nome: i.nome,
          referencia: i.cProd,
          quantidade: i.qtdConferida,
          preco_unitario: i.precoUnitario,
          ncm: i.ncm,
        })),
        valor_total: itensConferencia.reduce((a, i) => a + i.qtdConferida * i.precoUnitario, 0),
      };
      await salvarConferencia(dados);
      Alert.alert('✅ Sucesso', 'Conferência salva com sucesso!', [
        { text: 'OK', onPress: resetar },
      ]);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar a conferência.');
    } finally {
      setSaving(false);
    }
  };

  const resetar = () => {
    setModo(MODOS.INICIO);
    setItensConferencia([]);
    setFornecedorSelecionado(null);
    setNumeroNota('');
    setBarcodeInput('');
  };

  // ── Stats ──────────────────────────────────────────────
  const totalItens = itensConferencia.length;
  const ok = itensConferencia.filter(i => i.status === 'OK').length;
  const divergencias = itensConferencia.filter(i => i.status === 'DIVERGENCIA').length;
  const pendentes = itensConferencia.filter(i => i.status === 'PENDENTE').length;
  const progresso = totalItens > 0 ? ok / totalItens : 0;

  const filteredForn = fornecedores.filter(f =>
    f.razao_social?.toLowerCase().includes(searchForn.toLowerCase()) ||
    f.nome_fantasia?.toLowerCase().includes(searchForn.toLowerCase())
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {modo !== MODOS.INICIO && (
          <TouchableOpacity style={styles.backBtn} onPress={resetar}>
            <Text style={styles.backTxt}>←</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>📦 Conferência</Text>
          <Text style={styles.headerSub}>
            {modo === MODOS.INICIO ? 'Recebimento de mercadorias' : `${ok}/${totalItens} itens confirmados`}
          </Text>
        </View>
        {modo === MODOS.CONFERINDO && (
          <TouchableOpacity style={styles.resumoBtn} onPress={() => setResumoModal(true)}>
            <Text style={styles.resumoTxt}>📊</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* TELA INICIAL */}
      {modo === MODOS.INICIO && (
        <ScrollView contentContainerStyle={styles.inicioScroll}>
          <Text style={styles.inicioTitle}>Como deseja iniciar?</Text>

          <TouchableOpacity style={[styles.opcaoCard, { borderColor: colors.primary }]} onPress={importarXML}>
            <Text style={styles.opcaoIcon}>📄</Text>
            <View style={styles.opcaoInfo}>
              <Text style={styles.opcaoTitle}>Importar XML (NF-e)</Text>
              <Text style={styles.opcaoSub}>Carrega automaticamente fornecedor, itens, quantidades e preços</Text>
            </View>
            <Text style={styles.opcaoArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.opcaoCard, { borderColor: colors.accent }]}
            onPress={() => { setModo(MODOS.MANUAL); adicionarItemManual(); }}
          >
            <Text style={styles.opcaoIcon}>✏️</Text>
            <View style={styles.opcaoInfo}>
              <Text style={styles.opcaoTitle}>Entrada manual</Text>
              <Text style={styles.opcaoSub}>Adicione itens manualmente lendo código de barras ou digitando</Text>
            </View>
            <Text style={styles.opcaoArrow}>→</Text>
          </TouchableOpacity>

          <View style={styles.dica}>
            <Text style={styles.dicaTxt}>💡 Dica: Com o XML, a conferência é automática — basta bater os itens físicos com os da nota</Text>
          </View>
        </ScrollView>
      )}

      {/* TELA DE CONFERÊNCIA */}
      {modo === MODOS.CONFERINDO && (
        <>
          {/* Barra de progresso */}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progresso * 100}%`, backgroundColor: divergencias > 0 ? colors.warning : colors.success }]} />
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: colors.successLight }]}>
              <Text style={[styles.statNum, { color: colors.success }]}>{ok}</Text>
              <Text style={styles.statLabel}>OK</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.warningLight }]}>
              <Text style={[styles.statNum, { color: colors.warning }]}>{divergencias}</Text>
              <Text style={styles.statLabel}>Divergência</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.infoLight }]}>
              <Text style={[styles.statNum, { color: colors.info }]}>{pendentes}</Text>
              <Text style={styles.statLabel}>Pendente</Text>
            </View>
          </View>

          {/* Barra de scan */}
          <View style={styles.scanBar}>
            <TouchableOpacity style={styles.cameraBtn} onPress={() => setScannerOpen(true)}>
              <Text style={styles.cameraBtnTxt}>📷</Text>
            </TouchableOpacity>
            <TextInput
              ref={barcodeRef}
              style={styles.barcodeInput}
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              onSubmitEditing={onBarcodeInputSubmit}
              placeholder="Bip ou digite código..."
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Info nota */}
          <View style={styles.notaInfo}>
            <TouchableOpacity onPress={() => setFornecedorModal(true)} style={styles.fornBtn}>
              <Text style={styles.fornLabel}>
                {fornecedorSelecionado ? fornecedorSelecionado.razao_social?.substring(0, 24) + '...' : '+ Fornecedor'}
              </Text>
            </TouchableOpacity>
            <TextInput
              style={styles.notaInput}
              value={numeroNota}
              onChangeText={setNumeroNota}
              placeholder="Nº Nota"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />
          </View>

          {/* Lista de itens */}
          <FlatList
            data={itensConferencia}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ paddingBottom: 120, paddingTop: spacing.xs }}
            renderItem={({ item, index }) => (
              <ConferenciaItem
                item={item}
                index={index}
                onConfirmar={(delta) => confirmarItemPorIndex(index, delta)}
                onUpdateField={(field, val) => updateItemField(index, field, val)}
              />
            )}
          />

          {/* Footer */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
            <Button title="💾 Salvar conferência" onPress={salvar} loading={saving} />
          </View>
        </>
      )}

      {/* Scanner */}
      <BarcodeScanner
        visible={scannerOpen}
        onScan={onBarcodeScanned}
        onClose={() => setScannerOpen(false)}
        title="Aponte para o código do produto"
      />

      {/* Modal: Fornecedor */}
      <Modal visible={fornecedorModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.fModal}>
            <View style={styles.fModalHeader}>
              <Text style={styles.fModalTitle}>Selecionar Fornecedor</Text>
              <TouchableOpacity onPress={() => setFornecedorModal(false)}>
                <Text style={{ fontSize: 22, color: colors.textSecondary }}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: spacing.md }}>
              <Input
                placeholder="Buscar fornecedor..."
                value={searchForn}
                onChangeText={setSearchForn}
                icon="🔍"
              />
            </View>
            <FlatList
              data={filteredForn}
              keyExtractor={f => String(f.id)}
              renderItem={({ item: f }) => (
                <TouchableOpacity
                  style={styles.fItem}
                  onPress={() => { setFornecedorSelecionado(f); setFornecedorModal(false); }}
                >
                  <Text style={styles.fItemName}>{f.razao_social}</Text>
                  <Text style={styles.fItemCnpj}>{f.cnpj}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<EmptyState icon="🏭" title="Nenhum fornecedor" />}
            />
          </View>
        </View>
      </Modal>

      {/* Modal: Resumo */}
      <Modal visible={resumoModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.resumoCard}>
            <Text style={styles.resumoTitle}>📊 Resumo da Conferência</Text>
            <View style={styles.resumoStats}>
              <View style={styles.resumoStat}>
                <Text style={[styles.resumoStatNum, { color: colors.success }]}>{ok}</Text>
                <Text style={styles.resumoStatLabel}>Itens OK</Text>
              </View>
              <View style={styles.resumoStat}>
                <Text style={[styles.resumoStatNum, { color: colors.warning }]}>{divergencias}</Text>
                <Text style={styles.resumoStatLabel}>Divergências</Text>
              </View>
              <View style={styles.resumoStat}>
                <Text style={[styles.resumoStatNum, { color: colors.info }]}>{pendentes}</Text>
                <Text style={styles.resumoStatLabel}>Pendentes</Text>
              </View>
            </View>
            {divergencias > 0 && (
              <View style={styles.divergenciasList}>
                <Text style={styles.divergenciasTitle}>⚠️ Itens com divergência:</Text>
                {itensConferencia.filter(i => i.status === 'DIVERGENCIA').map((item, i) => (
                  <Text key={i} style={styles.divergenciaItem}>
                    • {item.nome}: nota {item.qtdNota} / conferido {item.qtdConferida}
                  </Text>
                ))}
              </View>
            )}
            <Button title="Fechar" onPress={() => setResumoModal(false)} variant="outline" style={{ marginTop: spacing.md }} />
          </Card>
        </View>
      </Modal>
    </View>
  );
}

// ── ConferenciaItem ──────────────────────────────────────
function ConferenciaItem({ item, index, onConfirmar, onUpdateField }) {
  const [expanded, setExpanded] = useState(false);
  const [editNome, setEditNome] = useState(item.nome);
  const [editQtdNota, setEditQtdNota] = useState(String(item.qtdNota));
  const [editQtdConf, setEditQtdConf] = useState(String(item.qtdConferida));
  const [editPreco, setEditPreco] = useState(String(item.precoUnitario));

  const statusColor = {
    OK: colors.success,
    DIVERGENCIA: colors.warning,
    PENDENTE: colors.textMuted,
  }[item.status] || colors.textMuted;

  const statusIcon = { OK: '✅', DIVERGENCIA: '⚠️', PENDENTE: '⏳' }[item.status] || '⏳';

  return (
    <View style={ci2.card}>
      <TouchableOpacity style={ci2.row} onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
        {/* Status */}
        <Text style={ci2.statusIcon}>{statusIcon}</Text>
        {/* Info */}
        <View style={{ flex: 1, marginHorizontal: spacing.xs }}>
          <Text style={ci2.nome} numberOfLines={1}>{item.nome || 'Item ' + (index + 1)}</Text>
          <Text style={ci2.ref}>
            {item.cProd || item.cEAN ? `${item.cProd} / ${item.cEAN}` : 'Sem referência'}
          </Text>
        </View>
        {/* Qtd */}
        <View style={ci2.qtdArea}>
          <TouchableOpacity style={ci2.qtdBtn} onPress={() => onConfirmar(-1)}>
            <Text style={ci2.qtdBtnTxt}>−</Text>
          </TouchableOpacity>
          <View style={[ci2.qtdBadge, { borderColor: statusColor }]}>
            <Text style={[ci2.qtdValue, { color: statusColor }]}>{item.qtdConferida}</Text>
            <Text style={ci2.qtdNota}>/{item.qtdNota}</Text>
          </View>
          <TouchableOpacity style={[ci2.qtdBtn, { backgroundColor: colors.success }]} onPress={() => onConfirmar(1)}>
            <Text style={ci2.qtdBtnTxt}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 4 }}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={ci2.expanded}>
          <View style={ci2.expandRow}>
            <Text style={ci2.expandLabel}>Nome:</Text>
            <TextInput
              style={ci2.expandInput}
              value={editNome}
              onChangeText={setEditNome}
              onBlur={() => onUpdateField('nome', editNome)}
            />
          </View>
          <View style={ci2.expandRow}>
            <Text style={ci2.expandLabel}>Qtd Nota:</Text>
            <TextInput
              style={ci2.expandInput}
              value={editQtdNota}
              onChangeText={setEditQtdNota}
              onBlur={() => onUpdateField('qtdNota', parseFloat(editQtdNota) || 0)}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={ci2.expandRow}>
            <Text style={ci2.expandLabel}>Qtd Conf.:</Text>
            <TextInput
              style={ci2.expandInput}
              value={editQtdConf}
              onChangeText={setEditQtdConf}
              onBlur={() => onUpdateField('qtdConferida', editQtdConf)}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={ci2.expandRow}>
            <Text style={ci2.expandLabel}>Preço unit.:</Text>
            <TextInput
              style={ci2.expandInput}
              value={editPreco}
              onChangeText={setEditPreco}
              onBlur={() => onUpdateField('precoUnitario', parseFloat(editPreco) || 0)}
              keyboardType="decimal-pad"
            />
          </View>
          <Text style={ci2.ncm}>NCM: {item.ncm || '—'} · Unid: {item.unidade}</Text>
        </View>
      )}
    </View>
  );
}

const ci2 = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.md, marginBottom: spacing.xs,
    borderRadius: radius.md, ...shadow.sm, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm },
  statusIcon: { fontSize: 22, marginRight: spacing.xs },
  nome: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  ref: { fontSize: fontSize.xs, color: colors.textSecondary },
  qtdArea: { flexDirection: 'row', alignItems: 'center' },
  qtdBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  qtdBtnTxt: { color: colors.white, fontSize: 16, fontWeight: '700' },
  qtdBadge: {
    flexDirection: 'row', alignItems: 'baseline',
    marginHorizontal: 6, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.sm, borderWidth: 1.5, minWidth: 52, justifyContent: 'center',
  },
  qtdValue: { fontSize: fontSize.md, fontWeight: '800' },
  qtdNota: { fontSize: fontSize.xs, color: colors.textMuted, marginLeft: 1 },
  expanded: {
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderTopWidth: 1, borderColor: colors.border,
  },
  expandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  expandLabel: { fontSize: fontSize.xs, color: colors.textSecondary, width: 80 },
  expandInput: {
    flex: 1, fontSize: fontSize.sm, color: colors.text,
    borderBottomWidth: 1, borderColor: colors.border,
    paddingVertical: 4, paddingHorizontal: 6,
  },
  ncm: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  backTxt: { color: colors.white, fontSize: 20, fontWeight: '700' },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.white },
  headerSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.7)' },
  resumoBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  resumoTxt: { fontSize: 22 },
  inicioScroll: { padding: spacing.lg, gap: spacing.md },
  inicioTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  opcaoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 2, ...shadow.sm,
  },
  opcaoIcon: { fontSize: 36, marginRight: spacing.md },
  opcaoInfo: { flex: 1 },
  opcaoTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  opcaoSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  opcaoArrow: { fontSize: 20, color: colors.textMuted, marginLeft: spacing.sm },
  dica: {
    backgroundColor: colors.infoLight, borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.sm,
  },
  dicaTxt: { fontSize: fontSize.sm, color: colors.info },
  progressBar: { height: 4, backgroundColor: colors.border },
  progressFill: { height: 4, borderRadius: 2 },
  statsRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  statBox: {
    flex: 1, alignItems: 'center', padding: spacing.sm, borderRadius: radius.md,
  },
  statNum: { fontSize: fontSize.xl, fontWeight: '800' },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  scanBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, marginHorizontal: spacing.md,
    borderRadius: radius.md, ...shadow.sm, marginBottom: spacing.xs,
  },
  cameraBtn: {
    width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.md,
  },
  cameraBtnTxt: { fontSize: 22 },
  barcodeInput: {
    flex: 1, height: 48, paddingHorizontal: spacing.sm,
    fontSize: fontSize.md, color: colors.text,
  },
  notaInfo: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.md, marginBottom: spacing.xs,
  },
  fornBtn: {
    flex: 2, backgroundColor: colors.white, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, height: 40, justifyContent: 'center', ...shadow.sm,
  },
  fornLabel: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' },
  notaInput: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, height: 40, fontSize: fontSize.sm, color: colors.text, ...shadow.sm,
  },
  footer: {
    backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.border,
    padding: spacing.md,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.md,
  },
  fModal: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    maxHeight: '80%',
  },
  fModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border,
  },
  fModalTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  fItem: { padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
  fItemName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  fItemCnpj: { fontSize: fontSize.xs, color: colors.textSecondary },
  resumoCard: { width: '100%', maxWidth: 380 },
  resumoTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  resumoStats: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  resumoStat: { flex: 1, alignItems: 'center' },
  resumoStatNum: { fontSize: fontSize.xxxl, fontWeight: '800' },
  resumoStatLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  divergenciasList: {
    backgroundColor: colors.warningLight, borderRadius: radius.md, padding: spacing.sm,
  },
  divergenciasTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.warning, marginBottom: spacing.xs },
  divergenciaItem: { fontSize: fontSize.xs, color: colors.text, marginBottom: 2 },
});
