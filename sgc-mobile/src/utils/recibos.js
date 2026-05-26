// src/utils/recibos.js

// Comandos básicos
const ESC = '\x1B';
const INIT = ESC + '@';                  // Inicializa
const CENTER = ESC + 'a' + '\x01';       // Centraliza
const LEFT = ESC + 'a' + '\x00';         // Alinha à esquerda
const CUT_PAPER = ESC + 'm';             // Corta papel (depende do modelo)
const BOLD_ON = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';

function fmt(valor) {
  const v = parseFloat(valor);
  return (isNaN(v) ? 0 : v).toFixed(2).replace('.', ',');
}

/**
 * Gera o cabeçalho da empresa
 */
function gerarCabecalhoEmpresa(empresa) {
  if (!empresa) return '';
  let h = '';
  h += CENTER + BOLD_ON + `${empresa.razao_social || empresa.nome_fantasia || 'EMPRESA'}\n` + BOLD_OFF;
  if (empresa.endereco) h += `${empresa.endereco}\n`;
  if (empresa.cnpj) h += `CNPJ: ${empresa.cnpj}\n`;
  if (empresa.inscricao_estadual) h += `IE: ${empresa.inscricao_estadual}\n`;
  h += '-----------------------------\n';
  return h;
}

/**
 * Rodapé padrão do sistema
 */
const FOOTER_SGC = '\n' + CENTER + 'SGC\nSISTEMA DE GESTÃO COMERCIAL\n' + CUT_PAPER;

// Recibo para o cliente – PDV (venda avulsa)
export function reciboPDV(empresa, venda, carrinho) {
  let recibo = INIT;
  recibo += gerarCabecalhoEmpresa(empresa);

  recibo += LEFT;
  recibo += `Venda: #${venda?.id || '---'}\n`;
  recibo += `Data: ${new Date().toLocaleString('pt-BR')}\n`;

  // Cliente
  const cliNome = venda?.cliente_nome_manual || venda?.cliente_nome || 'Consumidor Final';
  const cliDoc = venda?.cliente_cpf_manual || venda?.cliente_cpf || '';
  recibo += `Cli: ${cliNome.substring(0, 25)}\n`;
  if (cliDoc) recibo += `CPF/CNPJ: ${cliDoc}\n`;
  
  recibo += '-----------------------------\n';
  recibo += `* | COD | NOME | QTD | TOTAL\n`;
  recibo += '-----------------------------\n';

  if (carrinho && Array.isArray(carrinho)) {
    carrinho.forEach((item, i) => {
      const nome = (item.nome || 'Produto').substring(0, 15);
      const cod = String(item.referencia || item.id || '').substring(0, 5);
      const qtd = parseFloat(item.quantidade || 0);
      const preco = parseFloat(item.preco_venda || 0);

      recibo += `${i + 1} | ${cod} | ${nome} | ${qtd} | ${fmt(qtd * preco)}\n`;
    });
  }

  recibo += '-----------------------------\n';
  recibo += BOLD_ON + `TOTAL: R$ ${fmt(venda?.total || 0)}\n` + BOLD_OFF;
  recibo += `Forma: ${venda?.forma_pagamento || '---'}\n`;
  if (parseFloat(venda?.desconto || 0) > 0) {
    recibo += `Desconto: R$ ${fmt(venda.desconto)}\n`;
  }
  
  recibo += FOOTER_SGC;
  return recibo;
}

// Recibo para o cliente – Fechamento de Mesa
export function reciboFechamentoMesa(empresa, mesa, venda, desconto, formaManual = null) {
  const totalOriginal = parseFloat(venda?.total || 0);
  const totalComDesconto = Math.max(0, totalOriginal - desconto);
  const forma = formaManual || venda?.forma_pagamento || '---';

  let recibo = INIT;
  recibo += gerarCabecalhoEmpresa(empresa);

  recibo += LEFT;
  recibo += `Mesa ${mesa.numero} - ${mesa.nome || ''}\n`;
  recibo += `Conta: #${venda?.id || '---'}\n`;
  recibo += `Data: ${new Date().toLocaleString('pt-BR')}\n`;

  // Cliente
  const cliNome = venda?.cliente_nome_manual || venda?.cliente_nome || 'Consumidor Final';
  const cliDoc = venda?.cliente_cpf_manual || venda?.cliente_cpf || '';
  recibo += `Cli: ${cliNome.substring(0, 25)}\n`;
  if (cliDoc) recibo += `CPF/CNPJ: ${cliDoc}\n`;

  recibo += '-----------------------------\n';
  recibo += `* | COD | NOME | QTD | TOTAL\n`;
  recibo += '-----------------------------\n';

  if (venda?.itens && Array.isArray(venda.itens)) {
    venda.itens.forEach((item, i) => {
      const nome = (item.produto_nome || 'Produto').substring(0, 15);
      const cod = String(item.referencia || item.id_produto || '').substring(0, 5);
      const qtd = parseFloat(item.quantidade || 0);
      const sub = parseFloat(item.subtotal || 0);

      recibo += `${i + 1} | ${cod} | ${nome} | ${qtd} | ${fmt(sub)}\n`;
    });
  }

  recibo += '-----------------------------\n';
  recibo += BOLD_ON + `TOTAL: R$ ${fmt(totalComDesconto)}\n` + BOLD_OFF;
  recibo += `Forma: ${forma}\n`;
  if (desconto > 0) {
    recibo += `Desconto: R$ ${fmt(desconto)}\n`;
  }
  
  recibo += FOOTER_SGC;
  return recibo;
}

// Extrato da conta para conferência (prévia)
export function extratoConta(empresa, mesa, venda, desconto = 0) {
  const totalOriginal = parseFloat(venda?.total || 0);
  const totalComDesconto = Math.max(0, totalOriginal - desconto);

  let recibo = INIT;
  recibo += gerarCabecalhoEmpresa(empresa);

  recibo += CENTER + BOLD_ON + '=== EXTRATO DE CONTA ===\n' + BOLD_OFF + LEFT;
  recibo += `Mesa ${mesa.numero} - ${mesa.nome || ''}\n`;
  recibo += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
  
  // Cliente
  const cliNome = venda?.cliente_nome_manual || venda?.cliente_nome || 'Consumidor Final';
  const cliDoc = venda?.cliente_cpf_manual || venda?.cliente_cpf || '';
  recibo += `Cli: ${cliNome.substring(0, 25)}\n`;
  if (cliDoc) recibo += `CPF/CNPJ: ${cliDoc}\n`;

  recibo += '-----------------------------\n';
  recibo += `* | COD | NOME | QTD | TOTAL\n`;
  recibo += '-----------------------------\n';

  if (venda?.itens && Array.isArray(venda.itens)) {
    venda.itens.forEach((item, i) => {
      const nome = (item.produto_nome || 'Produto').substring(0, 15);
      const cod = String(item.referencia || item.id_produto || '').substring(0, 5);
      const qtd = parseFloat(item.quantidade || 0);
      const sub = parseFloat(item.subtotal || 0);

      recibo += `${i + 1} | ${cod} | ${nome} | ${qtd} | ${fmt(sub)}\n`;
    });
  }

  recibo += '-----------------------------\n';
  if (desconto > 0) {
    recibo += `Subtotal: R$ ${fmt(totalOriginal)}\n`;
    recibo += `Desconto: R$ ${fmt(desconto)}\n`;
  }
  recibo += BOLD_ON + `TOTAL PARCIAL: R$ ${fmt(totalComDesconto)}\n` + BOLD_OFF;
  
  recibo += FOOTER_SGC;
  return recibo;
}

// Comanda para a cozinha (itens pendentes de preparo)
export function comandaCozinha(mesa, itens) {
  let recibo = INIT;
  recibo += CENTER + BOLD_ON + '=== COMANDA COZINHA ===\n' + BOLD_OFF;
  recibo += `MESA ${mesa.numero} - ${mesa.nome || ''}\n`;
  recibo += `Data: ${new Date().toLocaleTimeString('pt-BR')}\n`;
  recibo += '-----------------------------\n' + LEFT;
  itens.forEach((item, i) => {
    recibo += `${i+1}. ${item.produto_nome.substring(0, 22)}\n`;
    recibo += `   Qtd: ${item.quantidade}\n`;
    if (item.observacao) {
      recibo += `   Obs: ${item.observacao.substring(0, 25)}\n`;
    }
  });
  recibo += '-----------------------------\n';
  recibo += '\n\n\n' + CUT_PAPER;
  return recibo;
}