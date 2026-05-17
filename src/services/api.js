// src/services/api.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL_KEY = '@sgc:base_url';
const DEFAULT_BASE_URL = 'http://192.168.1.100/sgc/api';

export const getBaseUrl = async () => {
  const saved = await AsyncStorage.getItem(BASE_URL_KEY);
  return saved || DEFAULT_BASE_URL;
};

export const setBaseUrl = async (url) => {
  await AsyncStorage.setItem(BASE_URL_KEY, url.replace(/\/$/, ''));
};

const createApiInstance = async () => {
  const baseURL = await getBaseUrl();
  return axios.create({
    baseURL,
    timeout: 10000,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
  });
};

// ── AUTH ─────────────────────────────────────────────────
export const login = async (email, senha) => {
  const api = await createApiInstance();
  const res = await api.post('/login.php', { email, senha });
  return res.data;
};

export const logout = async () => {
  const api = await createApiInstance();
  const res = await api.post('/logout.php');
  return res.data;
};

// ── PRODUTOS ─────────────────────────────────────────────
export const getProdutos = async (search = '') => {
  const api = await createApiInstance();
  const res = await api.get(`/produtos.php${search ? `?search=${encodeURIComponent(search)}` : ''}`);
  return res.data;
};

export const getProdutoByBarcode = async (barcode) => {
  const api = await createApiInstance();
  const res = await api.get(`/produtos.php?barcode=${encodeURIComponent(barcode)}`);
  return res.data;
};

// ── PDV / CAIXA ───────────────────────────────────────────
export const getCaixaAtivo = async () => {
  const api = await createApiInstance();
  const res = await api.get('/caixa.php?status=ABERTO');
  return res.data;
};

export const abrirCaixa = async (saldoInicial) => {
  const api = await createApiInstance();
  const res = await api.post('/caixa.php', { acao: 'ABRIR', saldo_inicial: saldoInicial });
  return res.data;
};

export const fecharCaixa = async (idCaixa, saldoFechamento, observacoes = '') => {
  const api = await createApiInstance();
  const res = await api.post('/caixa.php', {
    acao: 'FECHAR',
    id_caixa: idCaixa,
    saldo_fechamento: saldoFechamento,
    observacoes,
  });
  return res.data;
};

// ── VENDAS ────────────────────────────────────────────────
export const finalizarVenda = async (venda) => {
  const api = await createApiInstance();
  const res = await api.post('/vendas.php', venda);
  return res.data;
};

export const getVendas = async (filtros = {}) => {
  const api = await createApiInstance();
  const params = new URLSearchParams();
  if (filtros.data) params.append('data', filtros.data);
  if (filtros.id_caixa) params.append('id_caixa', filtros.id_caixa);
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await api.get(`/vendas.php${query}`);
  return res.data;
};

// ── CONFERÊNCIA / COMPRAS ─────────────────────────────────
export const getCompras = async () => {
  const api = await createApiInstance();
  const res = await api.get('/compras.php');
  return res.data;
};

export const getCompraItens = async (compraId) => {
  const api = await createApiInstance();
  const res = await api.get(`/compras.php?compra_id=${compraId}&itens=1`);
  return res.data;
};

export const getFornecedores = async () => {
  const api = await createApiInstance();
  const res = await api.get('/fornecedores.php');
  return res.data;
};

export const salvarConferencia = async (dados) => {
  const api = await createApiInstance();
  const res = await api.post('/compras.php', dados);
  return res.data;
};
