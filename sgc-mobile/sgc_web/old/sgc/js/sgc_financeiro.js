// js/sgc_financeiro.js
// Substitui o módulo financeiro de estado local do script.js pela versão conectada à API.
// Usa cloneNode para remover os listeners antigos e assume controle dos formulários.

(function () {
  'use strict';

  function notify(msg, titulo) {
    const titleEl = document.getElementById('notificationTitle');
    const msgEl = document.getElementById('notificationMessage');
    const modalEl = document.getElementById('notificationModal');
    
    if (titleEl) titleEl.textContent = titulo || 'Aviso';
    if (msgEl) msgEl.textContent = msg;
    if (modalEl) modalEl.style.display = 'flex';
  }

  function fmt(v) {
    return parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Reaplica listeners removendo os do script.js (cloneNode) ─
  function replaceListeners(id, newHandler) {
    const el = document.getElementById(id);
    if (!el) return null;
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    const fresh = document.getElementById(id);
    fresh.addEventListener('submit', newHandler);
    return fresh;
  }

  // ════════════════════════════════════════════════════════════
  //  PLANO DE CONTAS
  // ════════════════════════════════════════════════════════════
  async function carregarCategorias() {
    const tbody = document.getElementById('categoriesTableBody');
    const sel   = document.getElementById('transactionCategorySelect');
    if (!tbody) return;
    try {
      const response = await fetch('api/plano_contas.php');
      const data = await response.json();
      tbody.innerHTML = '';
      if (sel) sel.innerHTML = '<option value="">Selecione a Categoria</option>';
      if (Array.isArray(data)) {
        data.forEach(cat => {
          tbody.innerHTML += `
            <tr>
              <td>${cat.id}</td>
              <td>${cat.nome}</td>
              <td><span class="badge-${cat.tipo}">${cat.tipo}</span></td>
              <td>
                <button class="delete-btn" onclick="sgcFinanceiro.deletarCategoria(${cat.id})">Excluir</button>
              </td>
            </tr>`;
          if (sel) sel.innerHTML += `<option value="${cat.id}">${cat.nome} (${cat.tipo})</option>`;
        });
      }
    } catch (e) { console.error('Erro ao carregar categorias:', e); }
  }

  async function salvarCategoria(e) {
    e.preventDefault();
    const form   = document.getElementById('categoryForm');
    const data   = { nome: form.elements['name'].value, tipo: form.elements['type'].value };
    try {
      const res  = await fetch('api/plano_contas.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => r.json());
      notify(res.message || 'Categoria salva!', res.success ? 'Sucesso' : 'Erro');
      if (res.success) { form.reset(); carregarCategorias(); }
    } catch (er) { notify('Erro de conexão.', 'Erro'); }
  }

  window.sgcFinanceiro = window.sgcFinanceiro || {};
  window.sgcFinanceiro.deletarCategoria = async function(id) {
    if (!confirm('Excluir esta categoria?')) return;
    const res = await fetch(`api/plano_contas.php?id=${id}`, { method: 'DELETE' }).then(r => r.json());
    notify(res.message, res.success ? 'Sucesso' : 'Erro');
    if (res.success) carregarCategorias();
  };

  // ════════════════════════════════════════════════════════════
  //  CONTAS / CAIXAS FINANCEIROS
  // ════════════════════════════════════════════════════════════
  async function carregarContas() {
    const tbody = document.getElementById('accountsTableBody');
    const sel   = document.getElementById('transactionAccountSelect');
    if (!tbody) return;
    try {
      const response = await fetch('api/contas_financeiras.php');
      const data = await response.json();
      tbody.innerHTML = '';
      if (sel) sel.innerHTML = '<option value="">Selecione a Conta/Caixa</option>';

      if (Array.isArray(data)) {
          data.forEach(c => {
            tbody.innerHTML += `
              <tr>
                <td>${c.id}</td>
                <td>${c.nome}</td>
                <td><strong>R$ ${fmt(c.saldo_atual)}</strong></td>
                <td>
                  <button class="delete-btn" onclick="sgcFinanceiro.deletarConta(${c.id})">Excluir</button>
                </td>
              </tr>`;
            if (sel) sel.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
          });
      }    
    } catch (e) { console.error('Erro ao carregar contas:', e); }
  }

  async function salvarConta(e) {
    e.preventDefault();
    const form = document.getElementById('accountForm');
    const data = { name: form.elements['name'].value, initialBalance: form.elements['initialBalance'].value };
    try {
      const res = await fetch('api/contas_financeiras.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => r.json());
      notify(res.message || 'Conta salva!', res.success ? 'Sucesso' : 'Erro');
      if (res.success) { form.reset(); carregarContas(); }
    } catch (er) { notify('Erro de conexão.', 'Erro'); }
  }

  window.sgcFinanceiro.deletarConta = async function(id) {
    if (!confirm('Excluir esta conta? Isso não pode ser desfeito.')) return;
    const res = await fetch(`api/contas_financeiras.php?id=${id}`, { method: 'DELETE' }).then(r => r.json());
    notify(res.message, res.success ? 'Sucesso' : 'Erro');
    if (res.success) carregarContas();
  };

  // ════════════════════════════════════════════════════════════
  //  LANÇAMENTOS
  // ════════════════════════════════════════════════════════════
  async function carregarLancamentos() {
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;
    try {
      const response = await fetch('api/lancamentos.php');
      const data = await response.json();
      let totalReceitas = 0, totalDespesas = 0;
      tbody.innerHTML = '';
      
      if (Array.isArray(data)) {
        data.forEach(l => {
          const classe = l.tipo === 'receita' ? 'valor-receita' : 'valor-despesa';
          const sinal  = l.tipo === 'receita' ? '+' : '−';
          if (l.tipo === 'receita') totalReceitas += parseFloat(l.valor);
          else totalDespesas += parseFloat(l.valor);

          tbody.innerHTML += `
            <tr>
              <td>${new Date(l.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
              <td>${l.descricao}</td>
              <td>${l.categoria_nome || '—'}</td>
              <td>${l.conta_nome || '—'}</td>
              <td class="${classe}">${sinal} R$ ${fmt(l.valor)}</td>
              <td>
                <span class="badge-status badge-${l.status.toLowerCase()}">${l.status}</span>
                ${l.status === 'Pendente'
                  ? `<button class="pay-btn" onclick="sgcFinanceiro.baixarLancamento(${l.id})">Baixar</button>`
                  : ''}
                <button class="delete-btn" onclick="sgcFinanceiro.deletarLancamento(${l.id})">Excluir</button>
              </td>
            </tr>`;
        });
      }

      // Atualiza a visão geral financeira (tab-dashboard dentro do finance)
      const el = document.getElementById('fin-resumo-resultado');
      if (el) {
        const saldo = totalReceitas - totalDespesas;
        el.innerHTML = `
          <div class="kpi-fin-row">
            <div class="kpi-fin receitas"><span>Receitas (mês)</span><strong class="valor-receita">R$ ${fmt(totalReceitas)}</strong></div>
            <div class="kpi-fin despesas"><span>Despesas (mês)</span><strong class="valor-despesa">R$ ${fmt(totalDespesas)}</strong></div>
            <div class="kpi-fin saldo"><span>Resultado</span><strong class="${saldo >= 0 ? 'valor-receita' : 'valor-despesa'}">R$ ${fmt(Math.abs(saldo))} ${saldo >= 0 ? '↑' : '↓'}</strong></div>
          </div>`;
      }
    } catch (e) { console.error('Erro ao carregar lançamentos:', e); }
  }

  async function salvarLancamento(e) {
    e.preventDefault();
    const form = document.getElementById('transactionForm');
    const data = {
      type:        form.elements['type'].value,
      description: form.elements['description'].value,
      value:       form.elements['value'].value,
      dueDate:     form.elements['dueDate'].value,
      categoryId:  form.elements['categoryId'].value,
      accountId:   form.elements['accountId'].value,
      status:      form.elements['status'].value,
    };
    try {
      const res = await fetch('api/lancamentos.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => r.json());
      notify(res.message || 'Lançamento salvo!', res.success ? 'Sucesso' : 'Erro');
      if (res.success) { form.reset(); carregarLancamentos(); }
    } catch (er) { notify('Erro de conexão.', 'Erro'); }
  }

  window.sgcFinanceiro.marcarPago = async function(id) {
    const hoje = new Date().toISOString().split('T')[0];
    const res  = await fetch(`api/lancamentos.php?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Pago', data_pagamento: hoje })
    }).then(r => r.json());
    notify(res.message, res.success ? 'Sucesso' : 'Erro');
    if (res.success) carregarLancamentos();
  };

  window.sgcFinanceiro.deletarLancamento = async function(id) {
    if (!confirm('Excluir este lançamento?')) return;
    const res = await fetch(`api/lancamentos.php?id=${id}`, { method: 'DELETE' }).then(r => r.json());
    notify(res.message, res.success ? 'Sucesso' : 'Erro');
    if (res.success) carregarLancamentos();
  };

  // ════════════════════════════════════════════════════════════
  //  INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════
  const init = () => {
    // Remove handlers antigos do script.js e assume controle
    replaceListeners('categoryForm',    salvarCategoria);
    replaceListeners('accountForm',     salvarConta);
    replaceListeners('transactionForm', salvarLancamento);

    // Carga inicial
    carregarCategorias();
    carregarContas();
    carregarLancamentos();

    // Recarrega ao entrar na seção
    document.querySelectorAll('[data-section="finance"]').forEach(item => {
      item.addEventListener('click', () => {
        carregarCategorias();
        carregarContas();
        carregarLancamentos();
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
