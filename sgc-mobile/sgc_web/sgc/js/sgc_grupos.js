// js/sgc_grupos.js
// Módulo de Grupos e Subgrupos de Produtos
// - Gestão da árvore (criar, editar, excluir)
// - Popula os selects cascateados no formulário de produto
// - Renderização em lista expansível

(function () {
  'use strict';

  function notify(msg, titulo) {
    const el = document.getElementById('notificationTitle');
    const em = document.getElementById('notificationMessage');
    const md = document.getElementById('notificationModal');
    if (el && em && md) { el.textContent = titulo || 'Aviso'; em.textContent = msg; md.style.display = 'flex'; }
    else alert(`${titulo || 'Aviso'}: ${msg}`);
  }

  let _gruposFlat  = [];
  let _gruposArvore= [];
  let _editandoId  = null;

  // ═══════════════════════ CARREGAMENTO ══════════════════════
  async function carregarGrupos(seed = false) {
    try {
      const url = seed ? 'api/grupos.php?auto_seed=1' : 'api/grupos.php';
      const res = await fetch(url).then(r => r.json());
      if (!res.success) return;

      _gruposFlat   = res.lista   || [];
      _gruposArvore = res.grupos  || [];

      renderArvore();
      preencherSelectsFormProduto();
    } catch (e) {
      console.error('[Grupos]', e);
    }
  }

  // ═════════════════════ RENDERIZAÇÃO ═══════════════════════
  function renderArvore() {
    const container = document.getElementById('grupos-lista');
    if (!container) return;

    if (!_gruposArvore.length) {
      container.innerHTML = '<p style="text-align:center;color:#aaa;padding:20px">Nenhum grupo cadastrado.</p>';
      return;
    }

    let html = '';
    _gruposArvore.forEach(grupo => {
      const icone = grupo.icone || '📁';
      const qtdProd = grupo.qtd_produtos || 0;
      const isPadrao = grupo.padrao == 1;
      const temSub = grupo.subgrupos && grupo.subgrupos.length > 0;

      html += `
        <div class="grupo-item" id="grupo-card-${grupo.id}">
          <div class="grupo-cabecalho" onclick="sgcGrupos.toggleSubgrupos(this, '${grupo.id}')">
            <span class="grupo-icone">${icone}</span>
            <div class="grupo-info">
              <span class="grupo-nome">${grupo.nome} ${isPadrao ? '<span class="badge-padrao">Padrão</span>' : ''}</span>
              <div class="grupo-meta">${qtdProd} produto(s) ${temSub ? ' · ' + grupo.subgrupos.length + ' subgrupo(s)' : ''}</div>
            </div>
            <div class="grupo-acoes" onclick="event.stopPropagation()">
              <button class="btn-editar" onclick="sgcGrupos.editarGrupo(${grupo.id})">Editar</button>
              <button class="btn-excluir" onclick="sgcGrupos.excluirGrupo(${grupo.id})">Excluir</button>
              <button class="btn-subgrupo" onclick="sgcGrupos.mostrarFormSubgrupo(${grupo.id}, '${grupo.nome.replace(/'/g, "\\'")}')">+ Subgrupo</button>
            </div>
            <span class="grupo-seta">▶</span>
          </div>`;

      if (temSub) {
        html += `<div class="subgrupos-container" id="sub-${grupo.id}">`;
        grupo.subgrupos.forEach(sub => {
          const subIcone = sub.icone || '📂';
          const subQtd = sub.qtd_produtos || 0;
          const subPadrao = sub.padrao == 1;
          html += `
            <div class="subgrupo-item" id="grupo-card-${sub.id}">
              <span class="subgrupo-icone">${subIcone}</span>
              <span class="subgrupo-nome">${sub.nome} ${subPadrao ? '<span class="badge-padrao">Padrão</span>' : ''}</span>
              <span class="subgrupo-meta">${subQtd} produto(s)</span>
              <div class="grupo-acoes" style="flex-shrink:0">
                <button class="btn-editar" onclick="sgcGrupos.editarGrupo(${sub.id})">Editar</button>
                <button class="btn-excluir" onclick="sgcGrupos.excluirGrupo(${sub.id})">Excluir</button>
              </div>
            </div>`;
        });
        html += `</div>`;
      }

      html += `</div>`;
    });

    container.innerHTML = html;
  }

  // ═══════════════ SELECTS NO FORM DE PRODUTO ════════════════
  function preencherSelectsFormProduto() {
    const selGrupo = document.getElementById('produto-grupo');
    if (!selGrupo) return;
    const valorAtual = selGrupo.value;
    selGrupo.innerHTML = '<option value="">Grupos</option>';
    _gruposArvore.forEach(g => {
      selGrupo.innerHTML += `<option value="${g.id}">${g.icone ? g.icone + ' ' : ''}${g.nome}</option>`;
    });
    if (valorAtual) selGrupo.value = valorAtual;
    atualizarSubgrupos(selGrupo.value);
  }

  function atualizarSubgrupos(idGrupo) {
    const selSubgrupo  = document.getElementById('produto-subgrupo');
    const wrapSubgrupo = document.getElementById('produto-subgrupo-wrap');
    if (!selSubgrupo || !wrapSubgrupo) return;

    if (!idGrupo) {
      selSubgrupo.innerHTML = '<option value="">Subgrupos</option>';
      wrapSubgrupo.style.display = 'none';
      return;
    }

    const grupo = _gruposArvore.find(g => g.id == idGrupo);
    const subs  = grupo?.subgrupos || [];

    if (!subs.length) {
      selSubgrupo.innerHTML = '<option value="">Subgrupos</option>';
      wrapSubgrupo.style.display = 'none';
    } else {
      selSubgrupo.innerHTML = '<option value="">Subgrupos</option>';
      subs.forEach(s => {
        selSubgrupo.innerHTML += `<option value="${s.id}">${s.icone ? s.icone + ' ' : ''}${s.nome}</option>`;
      });
      wrapSubgrupo.style.display = 'block';
    }
  }

  // ════════════════ CRIAÇÃO / EDIÇÃO ════════════════════════
  async function salvarGrupo(e) {
    e.preventDefault();
    const form  = document.getElementById('grupoForm');
    const nome  = form.elements['grupoNome'].value.trim();
    const icone = form.elements['grupoIcone'].value.trim();
    const idPai = form.elements['grupoIdPai'].value || null;

    if (!nome) { notify('Nome é obrigatório.', 'Aviso'); return; }

    const method = _editandoId ? 'PUT' : 'POST';
    const url    = _editandoId ? `api/grupos.php?id=${_editandoId}` : 'api/grupos.php';
    const body   = { nome, icone, id_pai: idPai ? parseInt(idPai) : null };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json());

      notify(res.message, res.success ? 'Sucesso' : 'Erro');
      if (res.success) {
        resetForm();
        carregarGrupos();
      }
    } catch { notify('Erro de conexão.', 'Erro'); }
  }

  function resetForm() {
    const form = document.getElementById('grupoForm');
    if (!form) return;
    form.reset();
    _editandoId = null;
    document.getElementById('grupoIdPai').value = '';
    document.getElementById('grupo-form-titulo').textContent = 'Novo Grupo ou Subgrupo';
    document.getElementById('grupo-pai-display').textContent = '';
    const btn = form.querySelector('[type="submit"]');
    if (btn) btn.textContent = 'Salvar Grupo';
    const cancelBtn = document.getElementById('btn-cancelar-grupo');
    if (cancelBtn) cancelBtn.style.display = 'none';
  }

  // ════════════════════ AÇÕES PÚBLICAS ══════════════════════
  window.sgcGrupos = {

    toggleSubgrupos(cabecalho, grupoId) {
      const container = document.getElementById('sub-' + grupoId);
      if (!container) return;
      const aberto = container.classList.toggle('aberto');
      cabecalho.classList.toggle('aberto', aberto);
    },

    editarGrupo(id) {
      const g = _gruposFlat.find(x => x.id == id);
      if (!g) return;
      _editandoId = id;
      const form = document.getElementById('grupoForm');
      form.elements['grupoNome'].value  = g.nome;
      form.elements['grupoIcone'].value = g.icone || '';
      form.elements['grupoIdPai'].value = g.id_pai || '';

      document.getElementById('grupo-form-titulo').textContent = `Editando: ${g.nome}`;
      const paiNome = g.id_pai ? (_gruposFlat.find(x => x.id == g.id_pai)?.nome || '') : '';
      document.getElementById('grupo-pai-display').textContent = paiNome ? `Subgrupo de: ${paiNome}` : 'Grupo principal';

      const btn = form.querySelector('[type="submit"]');
      if (btn) btn.textContent = 'Salvar Alterações';
      const cancelBtn = document.getElementById('btn-cancelar-grupo');
      if (cancelBtn) cancelBtn.style.display = 'inline-block';

      document.querySelector('.content-area')?.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async excluirGrupo(id) {
      const g = _gruposFlat.find(x => x.id == id);
      if (!g) return;
      if (!confirm(`Excluir "${g.nome}"?\n\nOs produtos vinculados ficarão sem categoria. Esta ação não pode ser desfeita.`)) return;

      try {
        const res = await fetch(`api/grupos.php?id=${id}`, { method: 'DELETE' }).then(r => r.json());
        notify(res.message, res.success ? 'Sucesso' : 'Erro');
        if (res.success) carregarGrupos();
      } catch { notify('Erro de conexão.', 'Erro'); }
    },

    mostrarFormSubgrupo(idPai, nomePai) {
      const form = document.getElementById('grupoForm');
      if (!form) return;
      _editandoId = null;
      form.reset();
      form.elements['grupoIdPai'].value = idPai;
      document.getElementById('grupo-form-titulo').textContent = `Novo Subgrupo de "${nomePai}"`;
      document.getElementById('grupo-pai-display').textContent = `Subgrupo de: ${nomePai}`;
      const cancelBtn = document.getElementById('btn-cancelar-grupo');
      if (cancelBtn) cancelBtn.style.display = 'inline-block';
      document.querySelector('.content-area')?.scrollTo({ top: 0, behavior: 'smooth' });
      form.elements['grupoNome'].focus();
    },

    // seed interno, sem botão visível
    async seedGruposPadrao() {
      if (!confirm('Isso criará os grupos padrão para o seu segmento. Continuar?')) return;
      try {
        const res = await fetch('api/grupos.php?seed=1').then(r => r.json());
        if (res.success) { notify('Grupos padrão criados!', 'Sucesso'); carregarGrupos(); }
        else notify(res.message, 'Erro');
      } catch { notify('Erro de conexão.', 'Erro'); }
    },

    onGrupoChange(idGrupo) { atualizarSubgrupos(idGrupo); },

    getNomeGrupo(idGrupo) {
      const g = _gruposFlat.find(x => x.id == idGrupo);
      return g ? `${g.icone ? g.icone + ' ' : ''}${g.nome}` : '—';
    },

    preencherParaProduto(idGrupo, idSubgrupo) {
      const selGrupo = document.getElementById('produto-grupo');
      if (selGrupo) { selGrupo.value = idGrupo || ''; atualizarSubgrupos(idGrupo); }
      const selSub = document.getElementById('produto-subgrupo');
      if (selSub && idSubgrupo) setTimeout(() => { selSub.value = idSubgrupo; }, 50);
    },
  };

  // ═══════════════════ INICIALIZAÇÃO ════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('grupoForm');
    if (form) form.addEventListener('submit', salvarGrupo);

    const cancelBtn = document.getElementById('btn-cancelar-grupo');
    if (cancelBtn) cancelBtn.addEventListener('click', resetForm);

    const selGrupo = document.getElementById('produto-grupo');
    if (selGrupo) selGrupo.addEventListener('change', e => atualizarSubgrupos(e.target.value));

    // Breadcrumb ao clicar no menu
    document.querySelectorAll('[data-section="grupos"]').forEach(el =>
      el.addEventListener('click', () => {
        carregarGrupos(true);
        const bc = document.getElementById('breadcrumb-nav');
        if (bc) {
          bc.innerHTML = `<span>Compras e Estoque</span><span class="separator">/</span><span>Grupos de Produtos</span>`;
        }
      })
    );

    document.querySelectorAll('[data-section="products"]').forEach(el =>
      el.addEventListener('click', () => carregarGrupos())
    );

    carregarGrupos(true);
  });

})();