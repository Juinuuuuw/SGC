// js/sgc_relatorios.js
// Sistema de Relatórios Profissionais — A4 Google Docs Style

(function () {
  'use strict';

  let relatorioSelecionado = null;
  const a4Page = document.getElementById('report-a4-page');

  function fmt(v) {
    return parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getEmpresa() {
    try {
      return JSON.parse(localStorage.getItem('sgc_empresa_dados') || '{}');
    } catch (e) {
      return {};
    }
  }

  // ════════════════════════════════════════════════════════════
  //  TEMPLATE BASE (A4)
  // ════════════════════════════════════════════════════════════
  function gerarTemplateA4(titulo, resumoHtml, tabelaHtml) {
    const empresa = getEmpresa();
    const agora = new Date().toLocaleString('pt-BR');
    
    const deVal = document.getElementById('rep-filtro-de')?.value || '';
    const ateVal = document.getElementById('rep-filtro-ate')?.value || '';
    const deFmt = deVal ? deVal.split('-').reverse().join('/') : '--/--/----';
    const ateFmt = ateVal ? ateVal.split('-').reverse().join('/') : '--/--/----';
    
    return `
      <div class="rep-header">
        <div class="rep-header-top">
          <div class="rep-company-info">
            <h1>${empresa.razao_social || 'SGC - Sistema de Gestão'}</h1>
            <p>${empresa.endereco || ''}</p>
            <p>CNPJ: ${empresa.cnpj || '---'} | IE: ${empresa.inscricao_estadual || '---'}</p>
          </div>
          <div style="text-align:right">
            <p style="font-size:10px;color:#888">Emitido em: ${agora}</p>
          </div>
        </div>
        <div class="rep-title-box">
          <h2>${titulo}</h2>
          <p>Período: ${deFmt} até ${ateFmt}</p>
        </div>
      </div>

      <div class="rep-summary-grid">
        ${resumoHtml}
      </div>

      <div class="rep-table-container">
        <table class="rep-table">
          ${tabelaHtml}
        </table>
      </div>

      <div class="rep-footer">
        <span>SGC - SISTEMA DE GESTÃO COMERCIAL</span>
        <span>Página 1 de 1</span>
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════════
  //  GERADORES DE RELATÓRIO
  // ════════════════════════════════════════════════════════════
  
  async function carregarRelatorio() {
    if (!relatorioSelecionado) {
      alert("Selecione um tipo de relatório na barra lateral.");
      return;
    }

    const de = document.getElementById('rep-filtro-de')?.value || '';
    const ate = document.getElementById('rep-filtro-ate')?.value || '';

    if (a4Page) a4Page.innerHTML = '<div class="a4-content-placeholder"><p>⏳ Gerando relatório...</p></div>';

    try {
      let apiType = '';
      if (relatorioSelecionado.startsWith('estoque')) apiType = 'estoque';
      else if (relatorioSelecionado.startsWith('vendas')) apiType = 'vendas';
      else if (relatorioSelecionado.startsWith('fin')) apiType = 'financeiro';

      const response = await fetch(`api/relatorios.php?tipo=${apiType}&de=${de}&ate=${ate}`);
      if (response.status === 401) {
          window.location.href = 'login.html';
          return;
      }
      const data = await response.json();

      if (!data || !data.success) throw new Error(data?.message || 'Falha ao buscar dados');

      let html = '';
      switch (relatorioSelecionado) {
        case 'estoque-geral': html = gerarRelEstoqueGeral(data); break;
        case 'estoque-baixo': html = gerarRelEstoqueBaixo(data); break;
        case 'vendas-periodo': html = gerarRelVendasPeriodo(data); break;
        case 'vendas-produtos': html = gerarRelVendasProdutos(data); break;
        case 'fin-fluxo': html = gerarRelFinFluxo(data); break;
        default: 
            html = `<div class="a4-content-placeholder"><p>Relatório "${relatorioSelecionado}" em breve.</p></div>`;
      }

      if (a4Page) a4Page.innerHTML = html;
      if (window.lucide) lucide.createIcons();

    } catch (e) {
      console.error(e);
      if (a4Page) a4Page.innerHTML = `<div class="a4-content-placeholder" style="color:red"><p>Erro ao gerar relatório: ${e.message}</p></div>`;
    }
  }

  function gerarRelEstoqueGeral(data) {
    const lista = data.posicao || [];
    const totalCusto = lista.reduce((a, b) => a + parseFloat(b.valor_custo || 0), 0);
    const totalVenda = lista.reduce((a, b) => a + parseFloat(b.valor_venda || 0), 0);

    const resumo = `
      <div class="rep-summary-item"><span class="rep-summary-label">Itens</span><span class="rep-summary-val">${lista.length}</span></div>
      <div class="rep-summary-item"><span class="rep-summary-label">Vl. Custo Total</span><span class="rep-summary-val">R$ ${fmt(totalCusto)}</span></div>
      <div class="rep-summary-item"><span class="rep-summary-label">Vl. Venda Total</span><span class="rep-summary-val">R$ ${fmt(totalVenda)}</span></div>
      <div class="rep-summary-item"><span class="rep-summary-label">Margem Média</span><span class="rep-summary-val">${totalCusto > 0 ? fmt(((totalVenda/totalCusto)-1)*100) : '0,00'}%</span></div>
    `;

    const tabela = `
      <thead><tr><th>Produto</th><th>Ref.</th><th>Estoque</th><th>Custo Unit.</th><th>Subtotal Custo</th></tr></thead>
      <tbody>
        ${lista.map(p => `
          <tr>
            <td>${p.nome || 'Sem nome'}</td>
            <td>${p.referencia || '---'}</td>
            <td>${parseFloat(p.estoque || 0).toFixed(2)} ${p.unidade_venda || 'UN'}</td>
            <td>R$ ${fmt(p.preco_custo)}</td>
            <td>R$ ${fmt(p.valor_custo)}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    return gerarTemplateA4("Relatório de Posição de Estoque", resumo, tabela);
  }

  function gerarRelEstoqueBaixo(data) {
    const lista = (data.posicao || []).filter(p => parseFloat(p.estoque || 0) <= 5);
    const resumo = `
      <div class="rep-summary-item"><span class="rep-summary-label">Itens Críticos</span><span class="rep-summary-val" style="color:red">${lista.length}</span></div>
      <div class="rep-summary-item" style="grid-column: span 3"><span class="rep-summary-label">Observação</span><span class="rep-summary-val" style="font-size:12px">Produtos com estoque igual ou inferior a 5 unidades.</span></div>
    `;
    const tabela = `
      <thead><tr><th>Produto</th><th>Ref.</th><th>Estoque Atual</th><th>Preço Custo</th></tr></thead>
      <tbody>
        ${lista.map(p => `<tr><td>${p.nome}</td><td>${p.referencia || '---'}</td><td style="color:red;font-weight:700">${parseFloat(p.estoque).toFixed(2)}</td><td>R$ ${fmt(p.preco_custo)}</td></tr>`).join('')}
      </tbody>
    `;
    return gerarTemplateA4("Relatório de Estoque Crítico (Baixo)", resumo, tabela);
  }

  function gerarRelVendasPeriodo(data) {
    const lista = data.lista || [];
    const resumo = data.resumo || { total_vendas: 0, faturamento: 0, ticket_medio: 0 };
    
    const htmlResumo = `
      <div class="rep-summary-item"><span class="rep-summary-label">Qtd Vendas</span><span class="rep-summary-val">${resumo.total_vendas}</span></div>
      <div class="rep-summary-item"><span class="rep-summary-label">Faturamento</span><span class="rep-summary-val">R$ ${fmt(resumo.faturamento)}</span></div>
      <div class="rep-summary-item"><span class="rep-summary-label">Ticket Médio</span><span class="rep-summary-val">R$ ${fmt(resumo.ticket_medio)}</span></div>
      <div class="rep-summary-item"><span class="rep-summary-label">Lucro Est.</span><span class="rep-summary-val">R$ ${fmt(resumo.faturamento * 0.3)}</span></div>
    `;

    const htmlTabela = `
      <thead><tr><th>ID</th><th>Data/Hora</th><th>Cliente</th><th>Pagamento</th><th>Total</th></tr></thead>
      <tbody>
        ${lista.map(v => `
          <tr>
            <td>#${v.id}</td>
            <td>${new Date(v.data_venda).toLocaleString('pt-BR')}</td>
            <td>${v.cliente_nome_manual || v.cliente_nome || 'Consumidor'}</td>
            <td>${v.forma_pagamento || '---'}</td>
            <td style="font-weight:700">R$ ${fmt(v.total)}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    return gerarTemplateA4("Relatório de Vendas por Período", htmlResumo, htmlTabela);
  }

  function gerarRelVendasProdutos(data) {
    const top = data.top_produtos || [];
    const resumo = `
      <div class="rep-summary-item"><span class="rep-summary-label">Produto Top 1</span><span class="rep-summary-val">${top[0]?.nome || '---'}</span></div>
      <div class="rep-summary-item"><span class="rep-summary-label">Total Itens Vendidos</span><span class="rep-summary-val">${top.reduce((a,b) => a + parseFloat(b.qtd_total || 0), 0).toFixed(0)}</span></div>
      <div class="rep-summary-item" style="grid-column: span 2"><span class="rep-summary-label">Faturamento Total Bruto</span><span class="rep-summary-val">R$ ${fmt(top.reduce((a,b) => a + parseFloat(b.receita_total || 0), 0))}</span></div>
    `;
    const tabela = `
      <thead><tr><th>#</th><th>Produto</th><th>Qtd. Vendida</th><th>Ticket Médio</th><th>Receita Total</th></tr></thead>
      <tbody>
        ${top.map((p, i) => `<tr><td>${i+1}</td><td>${p.nome}</td><td>${parseFloat(p.qtd_total).toFixed(0)}</td><td>R$ ${p.qtd_total > 0 ? fmt(p.receita_total/p.qtd_total) : '0,00'}</td><td style="font-weight:700">R$ ${fmt(p.receita_total)}</td></tr>`).join('')}
      </tbody>
    `;
    return gerarTemplateA4("Curva de Vendas por Produto", resumo, tabela);
  }

  function gerarRelFinFluxo(data) {
    const faturamento = data.resumo?.faturamento || 0;
    const resumo = `
      <div class="rep-summary-item"><span class="rep-summary-label">Entradas</span><span class="rep-summary-val" style="color:green">R$ ${fmt(faturamento)}</span></div>
      <div class="rep-summary-item"><span class="rep-summary-label">Saídas</span><span class="rep-summary-val" style="color:red">R$ ${fmt(faturamento * 0.4)}</span></div>
      <div class="rep-summary-item"><span class="rep-summary-label">Saldo Operacional</span><span class="rep-summary-val">R$ ${fmt(faturamento * 0.6)}</span></div>
      <div class="rep-summary-item"><span class="rep-summary-label">Margem Liq.</span><span class="rep-summary-val">60%</span></div>
    `;
    const tabela = `
      <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead>
      <tbody>
        <tr><td>--/--/----</td><td style="color:green">RECEITA</td><td>Vendas do Período</td><td>R$ ${fmt(faturamento)}</td></tr>
      </tbody>
    `;
    return gerarTemplateA4("Relatório de Fluxo de Caixa", resumo, tabela);
  }

  // ════════════════════════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════════════════════════
  function initRelatorios() {
    const groupButtons = document.querySelectorAll('.report-type-btn');
    groupButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        groupButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        relatorioSelecionado = btn.dataset.type;
        if (a4Page) {
            a4Page.innerHTML = `
                <div class="a4-content-placeholder">
                <i data-lucide="play-circle" style="width:64px;height:64px;opacity:0.1"></i>
                <p>Clique em "Gerar Relatório" para visualizar o <strong>${btn.textContent}</strong></p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
      });
    });

    const btnGerar = document.getElementById('btn-gerar-relatorio');
    if (btnGerar) btnGerar.addEventListener('click', carregarRelatorio);

    const handlePrint = () => { if (relatorioSelecionado) window.print(); };
    const printBtn = document.getElementById('btn-print-report');
    const pdfBtn = document.getElementById('btn-pdf-report');
    if (printBtn) printBtn.addEventListener('click', handlePrint);
    if (pdfBtn) pdfBtn.addEventListener('click', handlePrint);

    // Datas iniciais
    const deInput = document.getElementById('rep-filtro-de');
    const ateInput = document.getElementById('rep-filtro-ate');
    if (deInput && ateInput) {
        const hoje = new Date();
        ateInput.value = hoje.toISOString().split('T')[0];
        hoje.setDate(1);
        deInput.value = hoje.toISOString().split('T')[0];
    }
  }

  window.addEventListener('sgcSectionChange', (e) => {
    const section = e.detail.section;
    if (section.startsWith('rep-')) {
        const type = section.replace('rep-', '');
        document.querySelectorAll('.report-group').forEach(group => {
            const label = group.querySelector('label')?.textContent.toLowerCase() || '';
            if (label.includes(type)) group.style.display = 'flex';
            else group.style.display = 'none';
        });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRelatorios);
  } else {
    initRelatorios();
  }

})();
