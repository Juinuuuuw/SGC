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

// ── AUTH ──────────────────────────────────────────────────
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

// ── EMPRESA (segmento, dados) ─────────────────────────────
export const getEmpresa = async () => {
  const api = await createApiInstance();
  const res = await api.get('/empresa.php');
  return res.data; 
};

// ── PRODUTOS E GRUPOS ─────────────────────────────────────
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

export const getGrupos = async () => {
  const api = await createApiInstance();
  const res = await api.get('/grupos.php');
  return res.data;
};

// ── PDV / CAIXA ───────────────────────────────────────────
export const getCaixaAtivo = async () => {
  const api = await createApiInstance();
  const res = await api.get('/caixa.php');
  return res.data;
};

export const abrirCaixa = async (saldoInicial) => {
  const api = await createApiInstance();
  const res = await api.post('/caixa.php', { acao: 'ABRIR', saldo_inicial: saldoInicial });
  return res.data;
};

export const fecharCaixa = async (idCaixa, saldoFechamento, sangria, valorRestante, observacoes = '') => {
  const api = await createApiInstance();
  const res = await api.post('/caixa.php', {
    acao: 'FECHAR',
    id_caixa: idCaixa,
    saldo_fechamento: saldoFechamento,
    sangria: sangria,
    valor_restante: valorRestante,
    observacoes: observacoes,
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
  if (filtros.data)     params.append('data',     filtros.data);
  if (filtros.id_caixa) params.append('id_caixa', filtros.id_caixa);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.get(`/vendas.php${q}`);
  return res.data;
};

// ── CONFERÊNCIA / COMPRAS ─────────────────────────────────
export const getCompras       = async ()       => (await (await createApiInstance()).get('/compras.php')).data;
export const getCompraItens   = async (id)     => (await (await createApiInstance()).get(`/compras.php?compra_id=${id}&itens=1`)).data;
export const getFornecedores  = async ()       => (await (await createApiInstance()).get('/fornecedores.php')).data;
export const salvarConferencia= async (dados)  => (await (await createApiInstance()).post('/compras.php', dados)).data;

// ── MESAS (segmento Restaurante) ──────────────────────────
export const getMesas = async () => {
  const api = await createApiInstance();
  const res = await api.get('/mesas.php');
  return res.data; 
};

export const getMesaPedido = async (idMesa) => {
  const api = await createApiInstance();
  const res = await api.get(`/mesas_pdv.php?id_mesa=${idMesa}`);
  return res.data; 
};

export const mesaPdvAction = async (payload) => {
  const api = await createApiInstance();
  const res = await api.post('/mesas_pdv.php', payload);
  return res.data;
};

// ── CLIENTES ──────────────────────────────────────────────
export const getClientes = async (search = '') => {
  const api = await createApiInstance();
  const res = await api.get(`/clientes.php${search ? `?search=${encodeURIComponent(search)}` : ''}`);
  return res.data;
};

export const salvarCliente = async (cliente) => {
  const api = await createApiInstance();
  const res = await api.post('/clientes.php', cliente);
  return res.data;
};