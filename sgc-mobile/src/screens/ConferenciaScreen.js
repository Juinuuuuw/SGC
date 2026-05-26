// src/screens/ConferenciaScreen.js
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, Modal, ScrollView, TextInput, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { XMLParser } from 'fast-xml-parser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BarcodeScanner from '../components/BarcodeScanner';
import { Button, Card, EmptyState, Input } from '../components/ui';
import { 
  getFornecedores, 
  salvarConferencia, 
  getProdutoByBarcode,
  getCompras,
  getCompraItens,
} from '../services/api';
import { colors, spacing, radius, fontSize, shadow } from '../utils/theme';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
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
  const [comprasPendentes, setComprasPendentes] = useState([]);
  const [currentCompraId, setCurrentCompraId] = useState(null);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState(null);
  const [numeroNota, setNumeroNota] = useState('');
  const [itensConferencia, setItensConferencia] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [resumoModal, setResumoModal] = useState(false);
  const [fornecedorModal, setFornecedorModal] = useState(false);
  const [searchForn, setSearchForn] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const barcodeRef = useRef(null);

  useFocusEffect(useCallback(() => {
    fetchData();
  }, []));

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([carregarFornecedores(), carregarCompras()]);
    setLoading(false);
  };

  const carregarFornecedores = async () => {
    try {
      const data = await getFornecedores();
      setFornecedores(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log('Erro ao carregar fornecedores:', e);
    }
  };

  const carregarCompras = async () => {
    try {
      console.log('--- DEBUG CONFERÊNCIA ---');
      const data = await getCompras();
      console.log('Total de notas recebidas do servidor:', Array.isArray(data) ? data.length : 'ERRO (não é array)');
      
      if (Array.isArray(data)) {
        // Log para ver os status reais das notas
        data.forEach((c, i) => {
          if (i < 5) console.log(`Nota #${c.numero_nota}: Status="${c.status}", EmpresaID=${c.id_empresa}`);
        });

        // Filtra para exibir apenas notas que não foram totalmente processadas ainda
        const filtradas = data.filter(c => {
          const s = (c.status || '').toUpperCase();
          // Tratamos vazio ou nulo como PENDENTE por segurança
          return s === 'PENDENTE' || s === 'CONFERIDA' || s === '';
        });
        console.log(`Filtradas para o App (PENDENTE/CONFERIDA/EMPTY): ${filtradas.length}`);
        setComprasPendentes(filtradas);
      } else {
        setComprasPendentes([]);
      }
      console.log('------------------------');
    } catch (e) {
      console.error('Erro ao carregar compras:', e);
      setComprasPendentes([]);
    }
  };

  // ── XML Import ──────────────────────────────────────────
  const importarXML = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      
      if (result.canceled || !result.assets?.length) return;
      
      const asset = result.assets[0];

      console.log('Arquivo selecionado:', asset.name, 'Tamanho:', asset.size);

      if (!asset.name.toLowerCase().endsWith('.xml')) {
        Alert.alert('Formato inválido', 'Por favor, selecione um arquivo XML da Nota Fiscal.');
        return;
      }

      setLoading(true);
      
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'utf8'
      });
      
      console.log('XML lido, tamanho:', content.length, 'caracteres');
      console.log('Primeiros 200 caracteres:', content.substring(0, 200));
      
      processarXML(content);
      
    } catch (e) {
      console.error('Erro ao importar XML:', e);
      Alert.alert('Erro', 'Não foi possível ler o arquivo XML.\n' + (e.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const processarXML = async (xmlContent) => {
    try {
      console.log('Iniciando processamento do XML...');
      
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        parseTagValue: false,
        trimValues: true,
        ignoreDeclaration: true,
        removeNSPrefix: true,
        isArray: (name) => name === 'det',
      });
      
      let json;
      try {
        json = parser.parse(xmlContent);
      } catch (parseError) {
        const cleaned = xmlContent.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\?xml[^>]*\?>/gi, '').trim();
        json = parser.parse(cleaned);
      }

      const findInfNFe = (obj, depth = 0) => {
        if (!obj || typeof obj !== 'object' || depth > 15) return null;
        if (obj.infNFe) return obj.infNFe;
        if (obj.NFe?.infNFe) return obj.NFe.infNFe;
        if (obj.nfeProc?.NFe?.infNFe) return obj.nfeProc.NFe.infNFe;
        for (const key of Object.keys(obj)) {
          const result = findInfNFe(obj[key], depth + 1);
          if (result) return result;
        }
        return null;
      };

      const nfe = findInfNFe(json);
      if (!nfe) throw new Error('Estrutura <infNFe> não encontrada no XML.');

      // Monta objeto para o Backend (compras.php)
      const emit = nfe.emit || {};
      const dest = nfe.dest || {};
      const ide  = nfe.ide  || {};
      const total = nfe.total?.ICMSTot || {};

      let dets = nfe.det || [];
      if (!Array.isArray(dets)) dets = [dets];

      const xmlData = {
        fornecedor: {
          cnpj: String(emit.CNPJ || emit.cnpj || '').replace(/\D/g, ''),
          razao_social: emit.xNome || emit.xnome || 'Fornecedor',
          nome_fantasia: emit.xFant || emit.xfant || emit.xNome || emit.xnome || '',
          inscricao_estadual: emit.IE || emit.ie || '',
          logradouro: emit.enderEmit?.xLgr || '',
          numero: emit.enderEmit?.nro || '',
          bairro: emit.enderEmit?.xBairro || '',
          cidade: emit.enderEmit?.xMun || '',
          uf: emit.enderEmit?.UF || '',
          cep: emit.enderEmit?.CEP || '',
        },
        dados_nota: {
          numero: String(ide.nNF || ide.nnf || ''),
          serie: String(ide.serie || ''),
          data_emissao: ide.dhEmi || ide.dEmi || new Date().toISOString(),
          valor_total: parseFloat(total.vNF || 0),
          chave_acesso: nfe['@_Id']?.replace('NFe', '') || '',
        },
        itens: dets.map(det => {
          const p = det.prod || {};
          return {
            ean: String(p.cEAN || ''),
            nome: String(p.xProd || ''),
            unidade_xml: String(p.uCom || ''),
            quantidade_xml: parseFloat(p.qCom || 0),
            preco_custo_xml: parseFloat(p.vUnCom || 0),
            valor_total_xml: parseFloat(p.vProd || 0),
            ncm: String(p.NCM || ''),
            cfop: String(p.CFOP || ''),
            codigo_fornecedor: String(p.cProd || ''),
          };
        })
      };

      // Envia para o servidor para criar como PENDENTE
      const res = await salvarConferencia({ xml_data: xmlData });
      if (res.success) {
        Alert.alert('Sucesso', 'Nota fiscal importada como PENDENTE. Você já pode iniciar a conferência.');
        fetchData(); // recarrega lista
      } else {
        Alert.alert('Erro', res.message || 'Falha ao importar XML no servidor.');
      }
      
    } catch (e) {
      console.error('Erro ao processar XML:', e);
      Alert.alert('Erro', e.message || 'Erro ao processar arquivo.');
    }
  };

  const iniciarConferenciaExistente = async (compra) => {
    setLoading(true);
    try {
      const itensDB = await getCompraItens(compra.id);
      if (Array.isArray(itensDB)) {
        const itens = itensDB.map(i => ({
          id_item: i.id,
          id_produto: i.id_produto,
          nome: i.descricao || i.produto_nome,
          cProd: i.codigo_fornecedor,
          cEAN: i.referencia,
          qtdNota: parseFloat(i.quantidade_comercial),
          qtdConferida: i.quantidade_conferida !== null ? parseFloat(i.quantidade_conferida) : 0,
          precoUnitario: parseFloat(i.valor_unitario),
          unidade: i.unidade_comercial,
          status: i.quantidade_conferida === null ? 'PENDENTE' : 
                  Math.abs(parseFloat(i.quantidade_conferida) - parseFloat(i.quantidade_comercial)) < 0.01 ? 'OK' : 'DIVERGENCIA'
        }));
        
        setCurrentCompraId(compra.id);
        setNumeroNota(compra.numero_nota);
        setFornecedorSelecionado({ id: compra.id_fornecedor, razao_social: compra.fornecedor_nome });
        setItensConferencia(itens);
        setModo(MODOS.CONFERINDO);
      }
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível carregar os itens desta nota.');
    } finally {
      setLoading(false);
    }
  };

  // ── Manual ──────────────────────────────────────────────
  const iniciarManual = () => {
    setModo(MODOS.MANUAL);
  };

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

  // ── Barcode scan ────────────────────────────────────────
  const onBarcodeScanned = async (data) => {
    setScannerOpen(false);
    const codigo = String(data).trim();
    
    const idx = itensConferencia.findIndex(
      i => String(i.cEAN).trim() === codigo || String(i.cProd).trim() === codigo
    );
    
    if (idx >= 0) {
      confirmarItemPorIndex(idx, 1);
    } else {
      try {
        const produto = await getProdutoByBarcode(codigo);
        if (produto && produto.id) {
          Alert.alert(
            'Produto encontrado',
            `${produto.nome}\nRef: ${produto.referencia}\n\nEste produto não está na nota. Deseja adicioná-lo?`,
            [
              { text: 'Não', style: 'cancel' },
              { 
                text: 'Adicionar', 
                onPress: () => adicionarProdutoAvulso(produto, codigo)
              }
            ]
          );
        } else {
          Alert.alert('Não encontrado', `Código "${codigo}" não localizado no sistema.`);
        }
      } catch (e) {
        Alert.alert('Erro', 'Falha ao buscar produto no servidor.');
      }
    }
  };

  const adicionarProdutoAvulso = (produto, codigo) => {
    setItensConferencia(prev => [
      ...prev,
      {
        _id: Date.now(),
        cProd: produto.referencia || codigo,
        cEAN: produto.referencia || codigo,
        nome: produto.nome,
        ncm: produto.ncm || '',
        unidade: produto.unidade_venda || 'UN',
        qtdNota: 1,
        precoUnitario: parseFloat(produto.preco_custo || produto.preco_venda || 0),
        qtdConferida: 1,
        status: 'OK',
        id_produto: produto.id,
      }
    ]);
  };

  const onBarcodeInputSubmit = async () => {
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
      try {
        const produto = await getProdutoByBarcode(val);
        if (produto && produto.id) {
          Alert.alert(
            'Produto encontrado',
            `${produto.nome}\nAdicionar à conferência?`,
            [
              { text: 'Não', style: 'cancel', onPress: () => setBarcodeInput('') },
              { 
                text: 'Adicionar', 
                onPress: () => {
                  adicionarProdutoAvulso(produto, val);
                  setBarcodeInput('');
                }
              }
            ]
          );
        } else {
          Alert.alert('Não encontrado', `"${val}" não localizado.`);
          setBarcodeInput('');
        }
      } catch (e) {
        Alert.alert('Não encontrado', `"${val}" não localizado.`);
        setBarcodeInput('');
      }
    }
  };

  const confirmarItemPorIndex = (idx, delta) => {
    setItensConferencia(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const novaQtd = Math.max(0, item.qtdConferida + delta);
      const status =
        novaQtd === 0 ? 'PENDENTE'
        : Math.abs(novaQtd - item.qtdNota) < 0.001 ? 'OK'
        : 'DIVERGENCIA';
      return { ...item, qtdConferida: novaQtd, status };
    }));
  };

  const updateItemField = (idx, field, value) => {
    setItensConferencia(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'qtdConferida' || field === 'qtdNota') {
        const qtdConf = field === 'qtdConferida' ? parseFloat(value) || 0 : item.qtdConferida;
        const qtdNota = field === 'qtdNota' ? parseFloat(value) || 0 : item.qtdNota;
        updated.qtdConferida = qtdConf;
        updated.qtdNota = qtdNota;
        updated.status = qtdConf === 0 ? 'PENDENTE' : Math.abs(qtdConf - qtdNota) < 0.001 ? 'OK' : 'DIVERGENCIA';
      }
      return updated;
    }));
  };

  const removerItem = (index) => {
    Alert.alert(
      'Remover item',
      'Deseja remover este item da conferência?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Remover', 
          style: 'destructive',
          onPress: () => {
            setItensConferencia(prev => prev.filter((_, i) => i !== index));
          }
        }
      ]
    );
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
        id_compra: currentCompraId,
        id_fornecedor: fornecedorSelecionado?.id || null,
        numero_nota: numeroNota,
        itens: itensConferencia.map(i => ({
          id_item: i.id_item || null,
          id_produto: i.id_produto || null,
          nome: i.nome,
          referencia: i.cProd || i.cEAN,
          ean: i.cEAN,
          quantidade: i.qtdNota,
          quantidade_conferida: i.qtdConferida,
          preco_unitario: i.precoUnitario,
          ncm: i.ncm,
        })),
        valor_total: itensConferencia.reduce((a, i) => a + i.qtdConferida * i.precoUnitario, 0),
      };
      
      const resultado = await salvarConferencia(dados);
      
      Alert.alert(
        'Sucesso', 
        resultado.message || 'Conferência salva com sucesso!',
        [{ text: 'OK', onPress: resetar }]
      );
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar a conferência.\n' + (e.message || ''));
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
    setCurrentCompraId(null);
    fetchData();
  };

  // ── Stats ──────────────────────────────────────────────
  const totalItens = itensConferencia.length;
  const ok = itensConferencia.filter(i => i.status === 'OK').length;
  const divergencias = itensConferencia.filter(i => i.status === 'DIVERGENCIA').length;
  const pendentes = itensConferencia.filter(i => i.status === 'PENDENTE').length;
  const progresso = totalItens > 0 ? (ok + divergencias) / totalItens : 0;

  const filteredForn = fornecedores.filter(f =>
    f.razao_social?.toLowerCase().includes(searchForn.toLowerCase()) ||
    f.nome_fantasia?.toLowerCase().includes(searchForn.toLowerCase())
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {(modo !== MODOS.INICIO) && (
          <TouchableOpacity style={styles.backBtn} onPress={resetar}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Conferência</Text>
          <Text style={styles.headerSub}>
            {modo === MODOS.INICIO 
              ? 'Recebimento de mercadorias' 
              : `${ok + divergencias}/${totalItens} conferidos`
            }
          </Text>
        </View>
        {modo === MODOS.CONFERINDO && totalItens > 0 && (
          <TouchableOpacity style={styles.resumoBtn} onPress={() => setResumoModal(true)}>
            <Ionicons name="stats-chart" size={20} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>
{/* TELA INICIAL */}
{modo === MODOS.INICIO && (
  <ScrollView 
    contentContainerStyle={styles.inicioScroll}
    refreshControl={
      <RefreshControl
        refreshing={refreshing}
        onRefresh={fetchData}
        colors={[colors.primary]}
      />
    }
  >
    <Text style={styles.sectionTitle}>Novo lançamento</Text>

    <TouchableOpacity 
      style={[styles.opcaoCard, { borderColor: colors.primary }]} 
      onPress={importarXML}
      disabled={loading}
    >
      <View style={[styles.opcaoIconCircle, { backgroundColor: colors.primary + '15' }]}>
        <Ionicons name="document-text-outline" size={28} color={colors.primary} />
      </View>
      <View style={styles.opcaoInfo}>
        <Text style={styles.opcaoTitle}>Importar XML (NF-e)</Text>
        <Text style={styles.opcaoSub}>
          Carrega automaticamente fornecedor, itens, quantidades e preços
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
      )}
    </TouchableOpacity>

    <TouchableOpacity 
      style={[styles.opcaoCard, { borderColor: colors.accent }]}
      onPress={iniciarManual}
    >
      <View style={[styles.opcaoIconCircle, { backgroundColor: colors.accent + '15' }]}>
        <Ionicons name="create-outline" size={28} color={colors.accentDark} />
      </View>
      <View style={styles.opcaoInfo}>
        <Text style={styles.opcaoTitle}>Entrada manual</Text>
        <Text style={styles.opcaoSub}>
          Adicione itens manualmente lendo código de barras ou digitando
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
    </TouchableOpacity>

    <View style={styles.dica}>
      <Ionicons name="bulb-outline" size={18} color={colors.info} style={{ marginRight: 8 }} />
      <Text style={styles.dicaTxt}>
        Com o XML, a conferência é automática — basta bater os itens físicos com os da nota
      </Text>
    </View>

    {comprasPendentes.length > 0 ? (
      <View style={{ marginTop: spacing.md, paddingBottom: 40 }}>
        <Text style={styles.sectionTitle}>Notas aguardando conferência</Text>
        {comprasPendentes.map((c) => (
          <TouchableOpacity 
            key={c.id} 
            style={styles.pendingCard}
            onPress={() => iniciarConferenciaExistente(c)}
          >
            <View style={[styles.pendingIconBox, { backgroundColor: c.status === 'CONFERIDA' ? colors.successLight : colors.warningLight }]}>
              <Ionicons 
                name={c.status === 'CONFERIDA' ? "checkmark-circle" : "time"} 
                size={20} 
                color={c.status === 'CONFERIDA' ? colors.success : colors.warning} 
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingNota}>NF-e #{c.numero_nota}</Text>
              <Text style={styles.pendingForn} numberOfLines={1}>{c.fornecedor_nome}</Text>
              <Text style={styles.pendingData}>
                {new Date(c.data_emissao).toLocaleDateString('pt-BR')} • {c.status}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    ) : (
      <View style={{ marginTop: spacing.xl, alignItems: 'center', opacity: 0.5 }}>
        <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, marginTop: 8 }}>Nenhuma nota pendente para conferir</Text>
      </View>
    )}
  </ScrollView>
)}
      {/* TELA MANUAL */}
      {modo === MODOS.MANUAL && (
        <View style={styles.manualContainer}>
          <MaterialCommunityIcons name="pencil-box-outline" size={56} color={colors.textMuted} />
          <Text style={styles.manualTitle}>Entrada Manual</Text>
          <Text style={styles.manualSub}>
            Adicione itens manualmente ou escaneie códigos de barras
          </Text>
          
          <TouchableOpacity style={styles.manualBtn} onPress={adicionarItemManual}>
            <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
            <Text style={styles.manualBtnText}>Adicionar Primeiro Item</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.manualBtn} onPress={() => setScannerOpen(true)}>
            <Ionicons name="qr-code-outline" size={24} color={colors.primary} />
            <Text style={styles.manualBtnText}>Escanear Código de Barras</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TELA DE CONFERÊNCIA */}
      {modo === MODOS.CONFERINDO && (
        <>
          <View style={styles.progressBar}>
            <View style={[
              styles.progressFill, 
              { 
                width: `${progresso * 100}%`, 
                backgroundColor: divergencias > 0 ? colors.warning : colors.success 
              }
            ]} />
          </View>

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
            <TouchableOpacity 
              style={[styles.statBox, { backgroundColor: '#f5f5f5' }]}
              onPress={adicionarItemManual}
            >
              <Ionicons name="add" size={24} color={colors.primary} />
              <Text style={styles.statLabel}>Adicionar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.scanBar}>
            <TouchableOpacity style={styles.cameraBtn} onPress={() => setScannerOpen(true)}>
              <Ionicons name="qr-code-outline" size={24} color={colors.white} />
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

          <View style={styles.notaInfo}>
            <TouchableOpacity onPress={() => setFornecedorModal(true)} style={styles.fornBtn}>
              <Ionicons name="business-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.fornLabel} numberOfLines={1}>
                {fornecedorSelecionado 
                  ? (fornecedorSelecionado.nome_fantasia || fornecedorSelecionado.razao_social || 'Fornecedor')
                  : 'Fornecedor'
                }
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
                onRemover={() => removerItem(index)}
              />
            )}
            ListEmptyComponent={
              <EmptyState 
                icon={<Ionicons name="clipboard-outline" size={48} color={colors.textMuted} />}
                title="Nenhum item" 
                subtitle="Adicione itens ou importe um XML" 
              />
            }
          />

          <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
            <Button 
              title={saving ? "Salvando..." : "Salvar conferência"} 
              icon={<Ionicons name="save-outline" size={18} color={colors.white} />}
              onPress={salvar} 
              loading={saving}
              disabled={saving || itensConferencia.length === 0}
            />
          </View>
        </>
      )}

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
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: spacing.md }}>
              <Input
                placeholder="Buscar fornecedor..."
                value={searchForn}
                onChangeText={setSearchForn}
                icon={<Ionicons name="search" size={18} color={colors.textMuted} />}
              />
            </View>
            <FlatList
              data={filteredForn}
              keyExtractor={f => String(f.id)}
              renderItem={({ item: f }) => (
                <TouchableOpacity
                  style={styles.fItem}
                  onPress={() => { 
                    setFornecedorSelecionado(f); 
                    setFornecedorModal(false); 
                  }}
                >
                  <Text style={styles.fItemName}>{f.razao_social}</Text>
                  <Text style={styles.fItemCnpj}>{f.cnpj}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <EmptyState 
                  icon={<Ionicons name="business-outline" size={48} color={colors.textMuted} />}
                  title="Nenhum fornecedor encontrado" 
                />
              }
            />
          </View>
        </View>
      </Modal>

      {/* Modal: Resumo */}
      <Modal visible={resumoModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.resumoCard}>
            <Text style={styles.resumoTitle}>Resumo da Conferência</Text>
            
            <View style={styles.resumoStats}>
              <View style={styles.resumoStat}>
                <Ionicons name="checkmark-circle" size={28} color={colors.success} />
                <Text style={[styles.resumoStatNum, { color: colors.success }]}>{ok}</Text>
                <Text style={styles.resumoStatLabel}>Itens OK</Text>
              </View>
              <View style={styles.resumoStat}>
                <Ionicons name="warning" size={28} color={colors.warning} />
                <Text style={[styles.resumoStatNum, { color: colors.warning }]}>{divergencias}</Text>
                <Text style={styles.resumoStatLabel}>Divergências</Text>
              </View>
              <View style={styles.resumoStat}>
                <Ionicons name="time-outline" size={28} color={colors.info} />
                <Text style={[styles.resumoStatNum, { color: colors.info }]}>{pendentes}</Text>
                <Text style={styles.resumoStatLabel}>Pendentes</Text>
              </View>
            </View>
            
            {divergencias > 0 && (
              <View style={styles.divergenciasList}>
                <Text style={styles.divergenciasTitle}>Itens com divergência:</Text>
                {itensConferencia
                  .filter(i => i.status === 'DIVERGENCIA')
                  .map((item, i) => (
                    <Text key={i} style={styles.divergenciaItem}>
                      • {item.nome}: nota {item.qtdNota} / conferido {item.qtdConferida}
                    </Text>
                  ))
                }
              </View>
            )}
            
            <Button 
              title="Fechar" 
              onPress={() => setResumoModal(false)} 
              variant="outline" 
              style={{ marginTop: spacing.md }} 
            />
          </Card>
        </View>
      </Modal>
    </View>
  );
}

// ── ConferenciaItem ───────────────────────────────────────
function ConferenciaItem({ item, index, onConfirmar, onUpdateField, onRemover }) {
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

  const statusIconName = { 
    OK: 'checkmark-circle', 
    DIVERGENCIA: 'warning', 
    PENDENTE: 'time-outline' 
  }[item.status] || 'help-circle-outline';

  const statusBg = {
    OK: colors.successLight,
    DIVERGENCIA: colors.warningLight,
    PENDENTE: '#f9f9f9',
  }[item.status] || '#f9f9f9';

  return (
    <View style={[ci2.card, { borderLeftWidth: 4, borderLeftColor: statusColor }]}>
      <TouchableOpacity 
        style={ci2.row} 
        onPress={() => setExpanded(!expanded)} 
        activeOpacity={0.85}
        onLongPress={onRemover}
      >
        <Ionicons name={statusIconName} size={22} color={statusColor} style={{ marginRight: spacing.xs }} />
        
        <View style={{ flex: 1, marginHorizontal: spacing.xs }}>
          <Text style={ci2.nome} numberOfLines={1}>
            {item.nome || 'Item ' + (index + 1)}
          </Text>
          <Text style={ci2.ref}>
            {item.cProd || item.cEAN 
              ? `Ref: ${item.cProd || item.cEAN}` 
              : 'Sem referência'
            }
          </Text>
        </View>
        
        <View style={ci2.qtdArea}>
          <TouchableOpacity style={ci2.qtdBtn} onPress={() => onConfirmar(-1)}>
            <Ionicons name="remove" size={16} color={colors.white} />
          </TouchableOpacity>
          <View style={[ci2.qtdBadge, { borderColor: statusColor, backgroundColor: statusBg }]}>
            <Text style={[ci2.qtdValue, { color: statusColor }]}>
              {item.qtdConferida}
            </Text>
            <Text style={ci2.qtdNota}>/{item.qtdNota}</Text>
          </View>
          <TouchableOpacity 
            style={[ci2.qtdBtn, { backgroundColor: colors.success }]} 
            onPress={() => onConfirmar(1)}
          >
            <Ionicons name="add" size={16} color={colors.white} />
          </TouchableOpacity>
        </View>
        
        <Ionicons 
          name={expanded ? 'chevron-up' : 'chevron-down'} 
          size={16} 
          color={colors.textMuted} 
          style={{ marginLeft: 4 }}
        />
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
              onChangeText={(val) => {
                setEditQtdConf(val);
                onUpdateField('qtdConferida', val);
              }}
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
          <View style={ci2.expandRow}>
            <Text style={ci2.expandLabel}>Código:</Text>
            <TextInput
              style={[ci2.expandInput, { color: colors.textMuted }]}
              value={item.cProd || item.cEAN || ''}
              editable={false}
            />
          </View>
          {item.ncm ? (
            <Text style={ci2.ncm}>
              NCM: {item.ncm} · Unid: {item.unidade}
            </Text>
          ) : null}
          
          <TouchableOpacity style={ci2.removeBtn} onPress={onRemover}>
            <Ionicons name="trash-outline" size={14} color="#c62828" />
            <Text style={ci2.removeBtnText}>Remover item</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────
const ci2 = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.md, 
    marginBottom: spacing.xs,
    borderRadius: radius.md, 
    ...shadow.sm, 
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm },
  nome: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  ref: { fontSize: fontSize.xs, color: colors.textSecondary },
  qtdArea: { flexDirection: 'row', alignItems: 'center' },
  qtdBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
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
  removeBtn: {
    marginTop: spacing.sm, paddingVertical: spacing.xs,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#fff5f5', borderRadius: radius.sm,
    borderWidth: 1, borderColor: '#ffcdd2',
  },
  removeBtnText: { color: '#c62828', fontSize: fontSize.xs, fontWeight: '600' },
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
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.white },
  headerSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.7)' },
  resumoBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  
  inicioScroll: { flexGrow: 1, padding: spacing.lg, gap: spacing.md, paddingBottom: 100 },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  pendingCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.xs,
    ...shadow.sm,
  },
  pendingIconBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.warningLight,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  pendingNota: { fontSize: fontSize.md, fontWeight: '800', color: colors.text },
  pendingForn: { fontSize: fontSize.sm, color: colors.textSecondary },
  pendingData: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  inicioTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  opcaoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 2, ...shadow.sm,
  },
  opcaoIconCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  opcaoInfo: { flex: 1 },
  opcaoTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  opcaoSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  dica: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.infoLight, borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.sm,
  },
  dicaTxt: { fontSize: fontSize.sm, color: colors.info, flex: 1 },
  
  manualContainer: {
    flex: 1, padding: spacing.lg,
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  manualTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  manualSub: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  manualBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, width: '100%',
    ...shadow.sm, gap: spacing.md,
  },
  manualBtnText: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  
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
  barcodeInput: {
    flex: 1, height: 48, paddingHorizontal: spacing.sm,
    fontSize: fontSize.md, color: colors.text,
  },
  notaInfo: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.md, marginBottom: spacing.xs,
  },
  fornBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, height: 40, ...shadow.sm,
  },
  fornLabel: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '600', flex: 1 },
  notaInput: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.md,
    paddingHorizontal: spacing.sm, height: 40, fontSize: fontSize.sm, 
    color: colors.text, ...shadow.sm,
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
  resumoStat: { flex: 1, alignItems: 'center', gap: 4 },
  resumoStatNum: { fontSize: fontSize.xxxl, fontWeight: '800' },
  resumoStatLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  divergenciasList: {
    backgroundColor: colors.warningLight, borderRadius: radius.md, padding: spacing.sm,
  },
  divergenciasTitle: { 
    fontSize: fontSize.sm, fontWeight: '700', color: colors.warning, marginBottom: spacing.xs 
  },
  divergenciaItem: { fontSize: fontSize.xs, color: colors.text, marginBottom: 2 },
});