// js/sgc_mesas.js — PDV de Restaurante: Grid de Mesas e Tela de Pedido

(function () {
  'use strict';

  function notify(msg, titulo) {
    document.getElementById('notificationTitle').textContent = titulo || 'Aviso';
    document.getElementById('notificationMessage').textContent = msg;
    document.getElementById('notificationModal').style.display = 'flex';
  }

  function fmt(v) {
    return parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Estado local ─────────────────────────────────────────────
  let mesaAtual    = null; // objeto da mesa selecionada
  let vendaAtual   = null; // venda em aberto da mesa
  let autoRefresh  = null; // timer de auto-atualização do grid
  let produtoSelecionado = null; // produto escolhido no autocomplete
  let formaPagamentoSelecionada = 'DINHEIRO';

  // ═══════════════════════════════════════════════════════════
  //  GRID DE MESAS
  // ═══════════════════════════════════════════════════════════
  async function carregarMesas() {
    const grid = document.getElementById('mesas-grid');
    if (!grid) return;
    try {
      const mesas = await fetch('api/mesas.php').then(r => r.json());
      grid.innerHTML = '';

      if (!mesas.length) {
        grid.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa">
            <p style="font-size:16px;margin-bottom:12px">Nenhuma mesa cadastrada.</p>
            <button onclick="sgcMesas.abrirConfigMesas()" style="padding:10px 20px;background:#4a148c;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700">
              + Adicionar Mesas
            </button>
          </div>`;
        return;
      }

      mesas.forEach(mesa => {
        const card = document.createElement('div');
        card.className = `mesa-card ${mesa.status}`;
        card.dataset.id = mesa.id;

        const tempoStr = mesa.aberta_em ? calcularTempo(mesa.aberta_em) : '';
        const totalStr = mesa.total_atual > 0 ? `R$ ${fmt(mesa.total_atual)}` : '';

        card.innerHTML = `
          <div class="mesa-numero">${mesa.numero}</div>
          <div class="mesa-nome">${mesa.nome || `Mesa ${mesa.numero}`}</div>
          <div class="mesa-status-badge">${traduzirStatus(mesa.status)}</div>
          <div class="mesa-info-row">
            <span class="mesa-tempo">${tempoStr}</span>
            <span class="mesa-total">${totalStr}</span>
          </div>
          <div class="mesa-capacidade">👤 ${mesa.capacidade}</div>`;

        card.addEventListener('click', () => cliqueMesa(mesa));
        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = '<p style="color:#c62828;padding:20px">Erro ao carregar mesas.</p>';
    }
  }

  function traduzirStatus(s) {
    return { livre: 'Livre', ocupada: 'Ocupada', conta: 'Conta' }[s] || s;
  }

  function calcularTempo(dataISO) {
    const diff = Date.now() - new Date(dataISO).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min`;
    return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
  }

  // ── Clique numa mesa ──────────────────────────────────────
  async function cliqueMesa(mesa) {
    if (mesa.status === 'livre') {
      // Perguntar se quer abrir
      const modal = document.getElementById('modal-abrir-mesa');
      if (modal) {
        document.getElementById('abrir-mesa-titulo').textContent = `Abrir ${mesa.nome || 'Mesa ' + mesa.numero}?`;
        document.getElementById('btn-confirmar-abrir-mesa').onclick = () => {
          modal.style.display = 'none';
          abrirMesa(mesa);
        };
        document.getElementById('btn-cancelar-abrir-mesa').onclick = () => {
          modal.style.display = 'none';
        };
        modal.style.display = 'flex';
      } else {
        if (confirm(`Abrir ${mesa.nome || 'Mesa ' + mesa.numero}?`)) abrirMesa(mesa);
      }
    } else {
      // Mesa ocupada ou conta → vai direto para a tela de pedido
      await abrirTelaPedido(mesa);
    }
  }

  // ── Abrir mesa (criar venda em aberto) ────────────────────
  async function abrirMesa(mesa) {
    try {
      const res = await fetch('api/mesas_pdv.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'ABRIR', id_mesa: mesa.id }),
      }).then(r => r.json());

      if (!res.success) { notify(res.message, 'Erro'); return; }
      await carregarMesas();
      // Vai para a tela de pedido
      mesa.status = 'ocupada';
      await abrirTelaPedido(mesa);
    } catch (e) {
      notify('Erro ao abrir mesa.', 'Erro');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  TELA DE PEDIDO
  // ═══════════════════════════════════════════════════════════
  async function abrirTelaPedido(mesa) {
    mesaAtual = mesa;

    // Busca a venda em aberto
    try {
      const res = await fetch(`api/mesas_pdv.php?id_mesa=${mesa.id}`).then(r => r.json());
      vendaAtual = res.venda;
    } catch (e) {
      notify('Erro ao carregar pedido da mesa.', 'Erro'); return;
    }

    // Mostra a tela de pedido e esconde o grid
    document.getElementById('mesas-grid-view').style.display = 'none';
    const pedidoView = document.getElementById('mesa-pedido-view');
    pedidoView.style.display = 'flex';
    pedidoView.classList.add('active');

    // Para o auto-refresh do grid durante o pedido
    clearInterval(autoRefresh);

    // Atualiza header
    document.getElementById('pedido-mesa-titulo').textContent =
      mesa.nome || `Mesa ${mesa.numero}`;

    renderPedidoItens();
  }

  function voltarParaGrid() {
    document.getElementById('mesa-pedido-view').style.display = 'none';
    document.getElementById('mesa-pedido-view').classList.remove('active');
    document.getElementById('mesas-grid-view').style.display = 'block';
    mesaAtual = null;
    vendaAtual = null;
    produtoSelecionado = null;
    document.getElementById('pedido-busca-input').value = '';
    ocultarAutocomplete();
    carregarMesas();
    iniciarAutoRefresh();
  }

  function renderPedidoItens() {
    const tbody    = document.getElementById('pedido-itens-tbody');
    const totalEl  = document.getElementById('pedido-total-valor');
    const headerTotalEl = document.getElementById('pedido-header-total-valor');

    if (!vendaAtual || !vendaAtual.itens || !vendaAtual.itens.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="pedido-vazio">🍽️ Nenhum item adicionado ainda.</td></tr>';
      if (totalEl) totalEl.textContent = 'R$ 0,00';
      if (headerTotalEl) headerTotalEl.textContent = 'R$ 0,00';
      return;
    }

    tbody.innerHTML = vendaAtual.itens.map(item => `
      <tr>
        <td class="item-nome">${item.produto_nome}</td>
        <td style="text-align:center">${parseFloat(item.quantidade).toFixed(0)} ${item.unidade_venda || ''}</td>
        <td style="text-align:right">R$ ${fmt(item.preco_unitario)}</td>
        <td style="text-align:right;font-weight:700">R$ ${fmt(item.subtotal)}</td>
        <td style="text-align:center">
          <button class="btn-remover-item" onclick="sgcMesas.removerItem(${item.id})" title="Remover">×</button>
        </td>
      </tr>`).join('');

    const total = vendaAtual.total || 0;
    if (totalEl)       totalEl.textContent       = `R$ ${fmt(total)}`;
    if (headerTotalEl) headerTotalEl.textContent = `R$ ${fmt(total)}`;
  }

  // ── Busca de produto (autocomplete) ──────────────────────
  async function buscarProdutos(termo) {
    if (termo.length < 2) { ocultarAutocomplete(); return; }
    try {
      const prods = await fetch(`api/produtos.php?search=${encodeURIComponent(termo)}`).then(r => r.json());
      mostrarAutocomplete(prods);
    } catch (e) { ocultarAutocomplete(); }
  }

  function mostrarAutocomplete(prods) {
    const list = document.getElementById('pedido-autocomplete-list');
    if (!prods.length) { ocultarAutocomplete(); return; }
    list.innerHTML = prods.map(p => `
      <div class="autocomplete-item" data-id="${p.id}" data-nome="${p.nome}" data-preco="${p.preco_venda}">
        <div>
          <div class="nome">${p.nome}</div>
          <div class="ref">Ref: ${p.referencia || 'N/A'} | Est: ${p.estoque}</div>
        </div>
        <div class="preco">R$ ${fmt(p.preco_venda)}</div>
      </div>`).join('');

    list.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('click', () => {
        produtoSelecionado = {
          id:    parseInt(el.dataset.id),
          nome:  el.dataset.nome,
          preco: parseFloat(el.dataset.preco),
        };
        document.getElementById('pedido-busca-input').value = el.dataset.nome;
        ocultarAutocomplete();
        document.getElementById('pedido-qtd-input').focus();
      });
    });

    list.classList.add('visible');
  }

  function ocultarAutocomplete() {
    const list = document.getElementById('pedido-autocomplete-list');
    if (list) { list.innerHTML = ''; list.classList.remove('visible'); }
  }

  // ── Adicionar item ao pedido ──────────────────────────────
  async function adicionarItemPedido() {
    if (!produtoSelecionado) {
      notify('Selecione um produto da lista.', 'Aviso'); return;
    }
    if (!vendaAtual) {
      notify('Mesa não está com conta em aberto.', 'Erro'); return;
    }

    const qtd = parseFloat(document.getElementById('pedido-qtd-input').value) || 1;
    try {
      const res = await fetch('api/mesas_pdv.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao:       'ADD_ITEM',
          id_venda:   vendaAtual.id,
          id_produto: produtoSelecionado.id,
          quantidade: qtd,
        }),
      }).then(r => r.json());

      if (!res.success) { notify(res.message, 'Erro'); return; }

      // Recarrega itens
      const updated = await fetch(`api/mesas_pdv.php?id_mesa=${mesaAtual.id}`).then(r => r.json());
      vendaAtual = updated.venda;

      // Limpa campos
      document.getElementById('pedido-busca-input').value = '';
      document.getElementById('pedido-qtd-input').value   = '1';
      produtoSelecionado = null;
      renderPedidoItens();
      document.getElementById('pedido-busca-input').focus();
    } catch (e) {
      notify('Erro ao adicionar item.', 'Erro');
    }
  }

  // ── Remover item ──────────────────────────────────────────
  window.sgcMesas = window.sgcMesas || {};
  window.sgcMesas.removerItem = async function(idItem) {
    if (!confirm('Remover este item?')) return;
    try {
      const res = await fetch('api/mesas_pdv.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'REMOVER_ITEM', id_item: idItem }),
      }).then(r => r.json());
      if (!res.success) { notify(res.message, 'Erro'); return; }
      const updated = await fetch(`api/mesas_pdv.php?id_mesa=${mesaAtual.id}`).then(r => r.json());
      vendaAtual = updated.venda;
      renderPedidoItens();
    } catch (e) { notify('Erro ao remover item.', 'Erro'); }
  };

  // ── Pedir conta ───────────────────────────────────────────
  async function pedirConta() {
    if (!mesaAtual) return;
    try {
      const res = await fetch('api/mesas_pdv.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'PEDIR_CONTA', id_mesa: mesaAtual.id }),
      }).then(r => r.json());
      notify(res.message, res.success ? 'Conta Solicitada' : 'Erro');
    } catch (e) { notify('Erro.', 'Erro'); }
  }

  // ═══════════════════════════════════════════════════════════
  //  MODAL FECHAR CONTA
  // ═══════════════════════════════════════════════════════════
  function abrirModalFecharConta() {
    if (!vendaAtual || !vendaAtual.itens?.length) {
      notify('Adicione pelo menos um item antes de fechar a conta.', 'Aviso'); return;
    }

    const modal = document.getElementById('modal-fechar-conta');
    formaPagamentoSelecionada = 'DINHEIRO';

    // Preenche resumo
    const resumo = document.getElementById('fechar-conta-itens');
    resumo.innerHTML = vendaAtual.itens.map(i =>
      `<div class="fechar-conta-summary-row">
         <span>${i.produto_nome} × ${parseFloat(i.quantidade).toFixed(0)}</span>
         <span>R$ ${fmt(i.subtotal)}</span>
       </div>`
    ).join('');
    document.getElementById('fechar-conta-subtotal').textContent = `R$ ${fmt(vendaAtual.total)}`;
    atualizarTotalFinal();

    // Seleciona DINHEIRO por padrão
    document.querySelectorAll('.forma-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.forma === 'DINHEIRO');
    });

    document.getElementById('fechar-desconto').value = '0';
    modal.style.display = 'flex';
  }

  function atualizarTotalFinal() {
    const desconto = parseFloat(document.getElementById('fechar-desconto')?.value || 0);
    const total    = Math.max(0, (vendaAtual?.total || 0) - desconto);
    const el = document.getElementById('fechar-conta-total');
    if (el) el.textContent = `R$ ${fmt(total)}`;
  }

  async function confirmarFecharConta() {
    if (!vendaAtual || !mesaAtual) return;
    const desconto = parseFloat(document.getElementById('fechar-desconto')?.value || 0);
    try {
      const res = await fetch('api/mesas_pdv.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao:            'FECHAR',
          id_venda:        vendaAtual.id,
          id_mesa:         mesaAtual.id,
          forma_pagamento: formaPagamentoSelecionada,
          desconto,
        }),
      }).then(r => r.json());

      document.getElementById('modal-fechar-conta').style.display = 'none';

      if (res.success) {
        notify(`✅ Conta fechada! Total: R$ ${fmt(res.total_final)}`, 'Venda Finalizada');
        voltarParaGrid();
      } else {
        notify(res.message, 'Erro');
      }
    } catch (e) { notify('Erro ao fechar conta.', 'Erro'); }
  }

  // ═══════════════════════════════════════════════════════════
  //  GESTÃO DE MESAS (configuração)
  // ═══════════════════════════════════════════════════════════
  async function carregarConfigMesas() {
    const container = document.getElementById('mesas-config-grid');
    if (!container) return;
    const mesas = await fetch('api/mesas.php').then(r => r.json()).catch(() => []);
    container.innerHTML = mesas.map(m => `
      <div class="mesa-config-card">
        <div class="mc-numero">Mesa ${m.numero}</div>
        <div class="mc-nome">${m.nome || ''}</div>
        <div class="mc-cap">👤 ${m.capacidade}</div>
        <div class="mesa-config-actions">
          <button onclick="sgcMesas.excluirMesa(${m.id})" style="background:#ffebee;color:#c62828">×</button>
        </div>
      </div>`).join('') + `
      <div class="mesa-config-card" style="border:2px dashed #ddd;cursor:pointer;align-items:center;justify-content:center;display:flex;flex-direction:column;gap:4px" onclick="sgcMesas.formNovaMesa()">
        <div style="font-size:28px;color:#aaa">+</div>
        <div style="font-size:13px;color:#aaa">Nova Mesa</div>
      </div>`;
  }

  window.sgcMesas.abrirConfigMesas = function() {
    const section = document.getElementById('mesas-config-section');
    if (section) section.style.display = section.style.display === 'none' ? 'block' : 'none';
    carregarConfigMesas();
  };

  window.sgcMesas.formNovaMesa = function() {
    const numero     = parseInt(prompt('Número da mesa:') || '0', 10);
    const nome       = prompt('Nome (ex: "Varanda 1") ou deixe vazio:') || '';
    const capacidade = parseInt(prompt('Capacidade (pessoas):') || '4', 10);
    if (!numero || isNaN(numero)) return;
    fetch('api/mesas.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero, nome, capacidade }),
    }).then(r => r.json()).then(res => {
      notify(res.message, res.success ? 'Sucesso' : 'Erro');
      if (res.success) { carregarConfigMesas(); carregarMesas(); }
    });
  };

  window.sgcMesas.excluirMesa = async function(id) {
    if (!confirm('Excluir esta mesa?')) return;
    const res = await fetch(`api/mesas.php?id=${id}`, { method: 'DELETE' }).then(r => r.json());
    notify(res.message, res.success ? 'Sucesso' : 'Erro');
    if (res.success) { carregarConfigMesas(); carregarMesas(); }
  };

  // ═══════════════════════════════════════════════════════════
  //  AUTO-REFRESH DO GRID
  // ═══════════════════════════════════════════════════════════
  function iniciarAutoRefresh() {
    clearInterval(autoRefresh);
    // Atualiza o grid a cada 30s para refletir mudanças de outros terminais
    autoRefresh = setInterval(() => {
      if (document.getElementById('mesas-grid-view')?.style.display !== 'none') {
        carregarMesas();
      }
    }, 30000);
  }

  // ═══════════════════════════════════════════════════════════
  //  MODO AVULSO (PDV padrão dentro do restaurante)
  // ═══════════════════════════════════════════════════════════
  function ativarModoAvulso() {
    document.getElementById('pdv-restaurante-view').classList.remove('active');
    document.getElementById('pdv-varejo-view').classList.add('active');
    const btnAvulso = document.getElementById('btn-modo-avulso');
    const btnMesas  = document.getElementById('btn-modo-mesas');
    if (btnAvulso) btnAvulso.classList.add('active');
    if (btnMesas)  btnMesas.classList.remove('active');
  }

  function ativarModoMesas() {
    document.getElementById('pdv-varejo-view').classList.remove('active');
    document.getElementById('pdv-restaurante-view').classList.add('active');
    const btnMesas  = document.getElementById('btn-modo-mesas');
    const btnAvulso = document.getElementById('btn-modo-avulso');
    if (btnMesas)  btnMesas.classList.add('active');
    if (btnAvulso) btnAvulso.classList.remove('active');
    carregarMesas();
  }

  // ═══════════════════════════════════════════════════════════
  //  INICIALIZAÇÃO
  // ═══════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    // Botões do switcher de modo
    const btnMesas  = document.getElementById('btn-modo-mesas');
    const btnAvulso = document.getElementById('btn-modo-avulso');
    if (btnMesas)  btnMesas.addEventListener('click', ativarModoMesas);
    if (btnAvulso) btnAvulso.addEventListener('click', ativarModoAvulso);

    // Botão voltar no pedido
    const btnVoltar = document.getElementById('pedido-btn-voltar');
    if (btnVoltar) btnVoltar.addEventListener('click', voltarParaGrid);

    // Busca de produto no pedido
    const buscaInput = document.getElementById('pedido-busca-input');
    if (buscaInput) {
      buscaInput.addEventListener('input', e => buscarProdutos(e.target.value));
      buscaInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); adicionarItemPedido(); }
      });
    }

    const qtdInput = document.getElementById('pedido-qtd-input');
    if (qtdInput) {
      qtdInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); adicionarItemPedido(); }
      });
    }

    const btnAddItem = document.getElementById('pedido-btn-add-item');
    if (btnAddItem) btnAddItem.addEventListener('click', adicionarItemPedido);

    // Fechar autocomplete ao clicar fora
    document.addEventListener('click', e => {
      if (!e.target.closest('#pedido-autocomplete-wrap')) ocultarAutocomplete();
    });

    // Pedir conta e fechar conta
    const btnPedirConta  = document.getElementById('pedido-btn-pedir-conta');
    const btnFecharConta = document.getElementById('pedido-btn-fechar-conta');
    if (btnPedirConta)  btnPedirConta.addEventListener('click',  pedirConta);
    if (btnFecharConta) btnFecharConta.addEventListener('click', abrirModalFecharConta);

    // Modal de fechar conta
    const descontoInput = document.getElementById('fechar-desconto');
    if (descontoInput) descontoInput.addEventListener('input', atualizarTotalFinal);

    document.querySelectorAll('.forma-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.forma-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        formaPagamentoSelecionada = btn.dataset.forma;
      });
    });

    const btnConfirmarFechamento = document.getElementById('btn-confirmar-fechamento');
    if (btnConfirmarFechamento) btnConfirmarFechamento.addEventListener('click', confirmarFecharConta);

    const btnCancelarFechamento = document.getElementById('btn-cancelar-fechamento');
    if (btnCancelarFechamento) btnCancelarFechamento.addEventListener('click', () => {
      document.getElementById('modal-fechar-conta').style.display = 'none';
    });

    // Modal de abrir mesa (fechar ao clicar fora)
    const modalAbrir = document.getElementById('modal-abrir-mesa');
    if (modalAbrir) modalAbrir.addEventListener('click', e => {
      if (e.target === modalAbrir) modalAbrir.style.display = 'none';
    });

    // Modal de fechar conta (fechar ao clicar fora)
    const modalFechar = document.getElementById('modal-fechar-conta');
    if (modalFechar) modalFechar.addEventListener('click', e => {
      if (e.target === modalFechar) modalFechar.style.display = 'none';
    });

    // Carrega mesas ao entrar na seção PDV
    document.querySelectorAll('[data-section="pdv-online"]').forEach(el => {
      el.addEventListener('click', () => {
        if ((window.SGC?.segmento || 'varejista') === 'restaurante') {
          carregarMesas();
          iniciarAutoRefresh();
        }
      });
    });

    // Botão de config de mesas
    const btnConfig = document.getElementById('btn-config-mesas');
    if (btnConfig) btnConfig.addEventListener('click', window.sgcMesas.abrirConfigMesas);

    // Botão de atualizar grid
    const btnAtualizar = document.getElementById('btn-atualizar-mesas');
    if (btnAtualizar) btnAtualizar.addEventListener('click', carregarMesas);
  });

})();
