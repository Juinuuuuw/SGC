// js/state.js

// Arrays de dados principais da aplicação
export let produtos = [];
export let fornecedores = [];
export let carrinho = [];
export let historicoCompras = [];
export let historicoMovimentacoes = [];
export let planoDeContas = [
  { id: 1, name: 'Receita de Vendas', type: 'receita' },
  { id: 2, name: 'Despesa com Fornecedores', type: 'despesa' },
  { id: 3, name: 'Aluguel', type: 'despesa' },
];
export let contasCaixas = [
  { id: 1, name: 'Caixa da Loja', balance: 150.75 },
  { id: 2, name: 'Conta Corrente BB', balance: 2500.00 },
];
export let lancamentosFinanceiros = [];

// Arrays de dados para operações em andamento
export let etiquetasParaImprimir = [];
export let itensMovimentacaoAtual = [];

// Contadores para IDs únicos
export let contadorId = 1;
export let contadorFornecedorId = 1;
export let contadorCompraId = 1;
export let contadorMovimentacaoId = 1;
export let contadorCategoriaId = 4;
export let contadorContaId = 3;
export let contadorLancamentoId = 1;

// --- FUNÇÕES ADICIONADAS PARA MODIFICAR O ESTADO ---
export const setProdutos = (newProdutos) => { produtos = newProdutos; };
export const setFornecedores = (newFornecedores) => { fornecedores = newFornecedores; };
export const setCarrinho = (newCarrinho) => { carrinho = newCarrinho; };
export const setItensMovimentacaoAtual = (newItens) => { itensMovimentacaoAtual = newItens; };
export const setEtiquetasParaImprimir = (newEtiquetas) => { etiquetasParaImprimir = newEtiquetas; };

// Funções para incrementar contadores
export const incrementContadorId = () => { contadorId++; };
export const incrementFornecedorId = () => { contadorFornecedorId++; };
export const incrementCompraId = () => { contadorCompraId++; };
export const incrementMovimentacaoId = () => { contadorMovimentacaoId++; };
export const incrementCategoriaId = () => { contadorCategoriaId++; };
export const incrementContaId = () => { contadorContaId++; };
export const incrementLancamentoId = () => { contadorLancamentoId++; };