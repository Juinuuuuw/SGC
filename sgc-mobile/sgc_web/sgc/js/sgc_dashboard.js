// js/sgc_dashboard.js
// Dashboard com dados reais do banco. Carregado após script.js.

(function () {
  'use strict';

  // ── Helper: modal de notificação (usa o HTML do sistema) ────
  function notify(msg, titulo) {
    document.getElementById('notificationTitle').textContent = titulo || 'Aviso';
    document.getElementById('notificationMessage').textContent = msg;
    document.getElementById('notificationModal').style.display = 'flex';
  }

  function fmt(valor) {
    return 'R$ ' + parseFloat(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Carrega KPIs do servidor ────────────────────────────────
  async function carregarDashboard() {
    const kpiGrid = document.getElementById('kpi-grid');
    if (!kpiGrid) return;

    // Estado de carregamento
    kpiGrid.querySelectorAll('.kpi-value').forEach(el => { el.textContent = '...'; });

    try {
      const res  = await fetch('api/dashboard.php');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      // ── KPI Cards ──────────────────────────────────────────
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

      set('kpi-val-vendas-hoje',   fmt(data.vendas_hoje?.valor));
      set('kpi-sub-vendas-hoje',   `${data.vendas_hoje?.qtd || 0} venda(s)`);

      set('kpi-val-vendas-mes',    fmt(data.vendas_mes?.valor));
      set('kpi-sub-vendas-mes',    `${data.vendas_mes?.qtd || 0} venda(s)`);

      set('kpi-val-compras-mes',   fmt(data.compras_mes?.valor));
      set('kpi-sub-compras-mes',   `${data.compras_mes?.qtd || 0} nota(s)`);

      set('kpi-val-estoque',       fmt(data.estoque?.valor_estoque));
      set('kpi-sub-estoque',       `${data.estoque?.total_produtos || 0} produto(s)`);

      set('kpi-val-baixo-estoque', data.estoque?.produtos_baixo_estoque || 0);
      set('kpi-sub-baixo-estoque', `${data.estoque?.produtos_sem_estoque || 0} zerado(s)`);

      set('kpi-val-fin-resultado',
        fmt((data.financeiro?.receitas_mes || 0) - (data.financeiro?.despesas_mes || 0)));
      set('kpi-sub-fin-resultado',
        `R: ${fmt(data.financeiro?.receitas_mes)} | D: ${fmt(data.financeiro?.despesas_mes)}`);

      // ── Gráfico de barras (HTML puro) ─────────────────────
      renderGrafico(data.grafico_vendas || []);

      // ── Lista de estoque baixo ────────────────────────────
      renderBaixoEstoque(data.lista_baixo_estoque || []);

      // ── Últimas vendas ────────────────────────────────────
      renderUltimasVendas(data.ultimas_vendas || []);

    } catch (e) {
      console.error('Dashboard error:', e);
    }
  }

  function renderGrafico(dados) {
    const container = document.getElementById('grafico-barras');
    if (!container) return;

    if (!dados.length) {
      container.innerHTML = '<p class="dash-empty">Nenhuma venda no período.</p>';
      return;
    }

    const max = Math.max(...dados.map(d => parseFloat(d.valor)), 1);
    container.innerHTML = dados.map(d => {
      const pct = Math.max((parseFloat(d.valor) / max) * 100, 2).toFixed(1);
      return `
        <div class="grafico-barra-item">
          <div class="grafico-barra-wrap">
            <div class="grafico-barra" style="height:${pct}%" title="${fmt(d.valor)}">
              <span class="grafico-barra-val">${fmt(d.valor)}</span>
            </div>
          </div>
          <span class="grafico-barra-label">${d.label}</span>
        </div>`;
    }).join('');
  }

  function renderBaixoEstoque(lista) {
    const container = document.getElementById('lista-baixo-estoque');
    if (!container) return;

    if (!lista.length) {
      container.innerHTML = '<p class="dash-empty"><i data-lucide="check-circle" style="color:#2e7d32;vertical-align:middle;margin-right:8px;width:18px;height:18px"></i> Todos os produtos com estoque adequado!</p>';
      if (window.lucide) lucide.createIcons();
      return;
    }
    container.innerHTML = `<table class="dash-table">
      <thead><tr><th>Produto</th><th>Un.</th><th>Estoque</th><th>Preço</th></tr></thead>
      <tbody>
        ${lista.map(p => `
          <tr class="${p.estoque == 0 ? 'row-danger' : 'row-warning'}">
            <td>${p.nome}</td>
            <td>${p.unidade_venda || 'UN'}</td>
            <td><strong>${p.estoque}</strong></td>
            <td>${fmt(p.preco_venda)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  }

  function renderUltimasVendas(vendas) {
    const tbody = document.getElementById('ultimas-vendas-tbody');
    if (!tbody) return;

    if (!vendas.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Nenhuma venda registrada.</td></tr>';
      return;
    }
    tbody.innerHTML = vendas.map(v => `
      <tr>
        <td>#${v.id}</td>
        <td>${new Date(v.data_venda).toLocaleString('pt-BR')}</td>
        <td>${v.operador || '—'}</td>
        <td>${v.forma_pagamento || '—'}</td>
        <td><strong>${fmt(v.total)}</strong></td>
      </tr>`).join('');
  }

  // ── Registra listener: recarrega ao entrar na seção Home ───
  document.addEventListener('DOMContentLoaded', () => {
    // Carga inicial
    carregarDashboard().then(() => {
        if (window.lucide) lucide.createIcons();
    });

    // Recarrega ao clicar no menu "Início"
    document.querySelectorAll('[data-section="home"]').forEach(item => {
      item.addEventListener('click', () => {
        carregarDashboard().then(() => {
            if (window.lucide) lucide.createIcons();
        });
      });
    });
  });

})();
