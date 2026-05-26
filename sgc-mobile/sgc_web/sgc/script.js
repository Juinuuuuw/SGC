document.addEventListener("DOMContentLoaded", async () => {
  console.log("Iniciando Verificação de Sessão...");

  // =============================================================
  // 1. VARIÁVEIS GLOBAIS E DOM
  // =============================================================
  let dadosUsuarioLogado = JSON.parse(localStorage.getItem('sgc_user_data')) || {};
  let produtos = [];
  let fornecedores = [];

  // Elementos do Layout
  const allMenuItems = document.querySelectorAll(".sidebar nav ul li");
  const sections = document.querySelectorAll(".section");
  const contentArea = document.querySelector('.content-area');
  const breadcrumbNav = document.getElementById('breadcrumb-nav');
  const sidebar = document.querySelector('.sidebar');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');

  // Modais
  const notificationModal = document.getElementById('notificationModal');
  const notificationTitle = document.getElementById('notificationTitle');
  const notificationMessage = document.getElementById('notificationMessage');
  const notificationCloseBtn = document.getElementById('notificationCloseBtn');
  const confirmationModal = document.getElementById('confirmationModal');
  const confirmationMessage = document.getElementById('confirmationMessage');
  const confirmActionBtn = document.getElementById('confirmActionBtn');
  const cancelActionBtn = document.getElementById('cancelActionBtn');

  // Tabelas
  const productTableBody = document.getElementById("productTableBody");
  const supplierTableBody = document.getElementById('supplierTableBody');
  const purchaseHistoryTableBody = document.getElementById('purchaseHistoryTableBody');
  const movementHistoryTableBody = document.getElementById('movementHistoryTableBody');

  // Formulários
  const productForm = document.getElementById("productForm");
  const supplierForm = document.getElementById('supplierForm');

  let editandoId = null;
  let confirmCallback = null;

  // =============================================================
  // 2. UTILITÁRIOS
  // =============================================================
  
  function fmt(v) {
    return parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function showNotificationModal(msg, title = 'Aviso', dur = 3000) {
    if (notificationTitle) notificationTitle.textContent = title;
    if (notificationMessage) notificationMessage.textContent = msg;
    if (notificationModal) notificationModal.style.display = 'flex';
    if (dur > 0) setTimeout(() => { if (notificationModal) hideNotificationModal(); }, dur);
  }

  function hideNotificationModal() { if (notificationModal) notificationModal.style.display = 'none'; }
  
  function showConfirmationModal(msg, onConfirm) {
    if (confirmationMessage) confirmationMessage.textContent = msg;
    confirmCallback = onConfirm;
    if (confirmationModal) confirmationModal.style.display = 'flex';
  }

  function hideConfirmationModal() {
    if (confirmationModal) confirmationModal.style.display = 'none';
    confirmCallback = null;
  }

  function showSection(sectionId) {
    sections.forEach(s => {
      s.classList.toggle("active", s.id === sectionId || (sectionId.startsWith('rep-') && s.id === 'reports'));
    });
    updateBreadcrumbs(sectionId);
    window.dispatchEvent(new CustomEvent('sgcSectionChange', { detail: { section: sectionId } }));
  }

  // =============================================================
  // 3. NAVEGAÇÃO
  // =============================================================
  const breadcrumbMap = {
    'home': ['Início'],
    'suppliers': ['Compras e Estoque', 'Fornecedor'],
    'products': ['Compras e Estoque', 'Produtos'],
    'grupos': ['Compras e Estoque', 'Grupos'],
    'purchases': ['Compras e Estoque', 'Compras'],
    'movements': ['Compras e Estoque', 'Movimentações'],
    'pdv-online': ['Vendas', 'PDV Online'],
    'finance': ['Financeiro'],
    'rep-estoque': ['Relatórios', 'Estoque'],
    'rep-vendas': ['Relatórios', 'Vendas'],
    'rep-financeiro': ['Relatórios', 'Financeiro'],
    'company-data': ['Gestão', 'Empresa'],
    'users': ['Gestão', 'Usuários']
  };

  function updateBreadcrumbs(id) {
    if (!breadcrumbNav) return;
    breadcrumbNav.innerHTML = '';
    (breadcrumbMap[id] || ['Início']).forEach((txt, i, arr) => {
      const s = document.createElement('span'); s.textContent = txt; breadcrumbNav.appendChild(s);
      if (i < arr.length - 1) { const sep = document.createElement('span'); sep.className='separator'; sep.textContent=' / '; breadcrumbNav.appendChild(sep); }
    });
  }

  allMenuItems.forEach(item => {
    const trigger = item.classList.contains('has-submenu') ? item.querySelector('span') : item;
    if (trigger) {
      trigger.addEventListener("click", (e) => {
        if (item.parentElement.classList.contains('submenu')) e.stopPropagation();
        if (item.classList.contains('has-submenu') && !item.hasAttribute('data-section')) {
          item.classList.toggle('open');
        } else if (item.hasAttribute('data-section')) {
          document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
          item.classList.add('active');
          const parent = item.closest('.has-submenu');
          if (parent) parent.classList.add('active');
          showSection(item.dataset.section);
          if (window.innerWidth <= 992 && sidebar) sidebar.classList.remove('active');
        }
      });
    }
  });

  if (toggleSidebarBtn) toggleSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('sidebar-minimized'));

  // =============================================================
  // 4. AÇÕES TOTAIS (EXPOSIÇÃO GLOBAL)
  // =============================================================
  
  window.editarProduto = function(id) {
    const p = produtos.find(item => item.id == id);
    if (!p || !productForm) return;
    productForm.nome.value = p.nome;
    productForm.referencia.value = p.referencia || "";
    productForm.preco_custo.value = p.preco_custo;
    productForm.margem.value = p.margem;
    productForm.preco_venda.value = p.preco_venda;
    editandoId = p.id;
    productForm.querySelector('button[type="submit"]').textContent = "Salvar Alterações";
    contentArea.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.excluirProduto = function(id) {
    showConfirmationModal("Excluir este produto permanentemente?", async () => {
        try {
            const r = await fetch(`api/produtos.php?id=${id}`, { method: 'DELETE' });
            const res = await r.json();
            showNotificationModal(res.message, res.success ? "Sucesso" : "Erro");
            if (res.success) buscarProdutosDoServidor();
        } catch (e) { showNotificationModal("Erro de conexão"); }
    });
  };

  window.editarFornecedor = function(id) {
    const f = fornecedores.find(item => item.id == id);
    if (!f || !supplierForm) return;
    supplierForm.razaoSocial.value = f.razao_social;
    supplierForm.cnpj.value = f.cnpj;
    supplierForm.telefone.value = f.telefone || "";
    supplierForm.nomeFantasia.value = f.nome_fantasia || "";
    editandoId = f.id;
    supplierForm.querySelector('button[type="submit"]').textContent = "Salvar Alterações";
    contentArea.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.excluirFornecedor = function(id) {
    showConfirmationModal("Excluir este fornecedor?", async () => {
        try {
            const r = await fetch(`api/fornecedores.php?id=${id}`, { method: 'DELETE' });
            const res = await r.json();
            showNotificationModal(res.message, res.success ? "Sucesso" : "Erro");
            if (res.success) buscarFornecedoresDoServidor();
        } catch (e) { showNotificationModal("Erro de conexão"); }
    });
  };

  window.visualizarCompra = async function(id) {
    try {
        const r = await fetch(`api/compras.php?id=${id}`);
        const c = await r.json();
        const ri = await fetch(`api/compras.php?compra_id=${id}&itens=true`);
        const itens = await ri.json();
        const modal = document.getElementById('purchaseDetailModal');
        document.getElementById('modalSupplierName').textContent = c.fornecedor_nome;
        document.getElementById('modalSupplierCnpj').textContent = c.fornecedor_cnpj;
        document.getElementById('modalPurchaseDate').textContent = new Date(c.data_emissao).toLocaleString('pt-BR');
        document.getElementById('modalPurchaseTotal').textContent = "R$ " + fmt(c.valor_total);
        document.getElementById('modalItemsTableBody').innerHTML = itens.map(i => `<tr><td>${i.codigo_fornecedor || '---'}</td><td>${i.descricao}</td><td>${parseFloat(i.quantidade_comercial).toFixed(2)}</td><td>R$ ${fmt(i.valor_unitario)}</td><td>R$ ${fmt(i.valor_total)}</td></tr>`).join('');
        modal.style.display = 'flex';
    } catch (e) { showNotificationModal("Erro ao carregar detalhes"); }
  };

  window.abrirModalProcessamento = async function(compraId) {
    try {
        const response = await fetch(`api/compras.php?id=${compraId}`);
        const compra = await response.json();
        const itensResponse = await fetch(`api/compras.php?compra_id=${compraId}&itens=true`);
        const itens = await itensResponse.json();
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1100px;">
                <span class="modal-close" onclick="this.parentElement.parentElement.remove()">&times;</span>
                <h2>Finalizar Processamento — NF-e #${compra.numero_nota}</h2>
                <div class="modal-header-info" style="background:#f8f9fa;padding:15px;border-radius:8px;margin-bottom:20px;">
                    <p><strong>Fornecedor:</strong> ${compra.fornecedor_nome}</p>
                    <p><strong>Status:</strong> <span class="badge badge-warning">${compra.status}</span></p>
                    ${compra.usuario_conferencia_nome ? `<p style="color:#2e7d32"><strong>✅ Conferido por:</strong> ${compra.usuario_conferencia_nome}</p>` : '<p style="color:#666">⚠️ Nenhuma conferência pelo App.</p>'}
                </div>
                <div style="overflow-x:auto;"><table class="product-table">
                    <thead><tr><th>Produto</th><th>Qtd (Nota)</th><th>Qtd (Conf.)</th><th>Fator</th><th>Un.Venda</th><th>Qtd Final</th><th>Custo Final</th><th>Margem %</th><th>Preço Venda</th></tr></thead>
                    <tbody id="processamentoItensBody">
                        ${itens.map(item => {
                            const qtdConf = item.quantidade_conferida !== null ? parseFloat(item.quantidade_conferida) : parseFloat(item.quantidade_comercial);
                            return `<tr data-item-id="${item.id}" data-custo-orig="${item.valor_unitario}" data-qtd-orig="${item.quantidade_comercial}" data-qtd-conf="${item.quantidade_conferida || ''}">
                                <td>${item.descricao}</td><td>${parseFloat(item.quantidade_comercial).toFixed(2)}</td><td style="font-weight:700;color:${item.quantidade_conferida !== null ? '#2e7d32' : '#999'}">${item.quantidade_conferida !== null ? parseFloat(item.quantidade_conferida).toFixed(2) : '-'}</td>
                                <td><input type="number" class="table-input fator-input" value="1" style="width:60px"></td>
                                <td><select class="table-input unidade-venda-input" style="width:70px"><option value="UN" selected>UN</option><option value="KG">KG</option><option value="G">G</option><option value="M">M</option><option value="L">L</option></select></td>
                                <td class="qtd-final-display" style="font-weight:700">${qtdConf.toFixed(2)}</td><td>R$ <span class="custo-final-display">${fmt(item.valor_unitario)}</span></td>
                                <td><input type="number" class="table-input margem-input" value="30" style="width:70px"></td><td><input type="number" class="table-input venda-input" value="${(item.valor_unitario*1.3).toFixed(2)}" style="width:90px"></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table></div>
                <div class="modal-buttons" style="margin-top:25px;border-top:1px solid #eee;padding-top:15px;">
                    <button onclick="confirmarProcessamento(${compra.id})" class="btn-confirm" style="background:#2e7d32">✅ Finalizar e Atualizar Estoque</button>
                    <button onclick="this.closest('.modal').remove()" class="btn-cancel">Cancelar</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelectorAll('tr[data-item-id]').forEach(row => {
            const fatorIn = row.querySelector('.fator-input'), margemIn = row.querySelector('.margem-input'), vendaIn = row.querySelector('.venda-input');
            const recalcular = () => {
                const cOrig = parseFloat(row.dataset.custoOrig), qOrig = parseFloat(row.dataset.qtdOrig), qConf = row.dataset.qtdConf !== '' ? parseFloat(row.dataset.qtdConf) : qOrig, f = parseFloat(fatorIn.value) || 1;
                const qFinal = qConf * f, cFinal = f > 0 ? cOrig / f : 0;
                row.querySelector('.qtd-final-display').textContent = qFinal.toFixed(3);
                row.querySelector('.custo-final-display').textContent = cFinal.toFixed(2);
                vendaIn.value = (cFinal * (1 + parseFloat(margemIn.value)/100)).toFixed(2);
            };
            fatorIn.addEventListener('input', recalcular); margemIn.addEventListener('input', recalcular);
            vendaIn.addEventListener('input', () => { const cFinal = parseFloat(row.querySelector('.custo-final-display').textContent), v = parseFloat(vendaIn.value) || 0; if (cFinal > 0) margemIn.value = (((v - cFinal) / cFinal) * 100).toFixed(2); });
        });
    } catch (e) { showNotificationModal("Erro ao abrir processamento"); }
  };

  window.confirmarProcessamento = async function(compraId) {
    const rows = document.querySelectorAll('#processamentoItensBody tr'), itens = [];
    rows.forEach(r => { itens.push({ id_item: r.dataset.itemId, fator_conversao: parseFloat(r.querySelector('.fator-input').value) || 1, unidade_venda: r.querySelector('.unidade-venda-input').value, preco_custo: parseFloat(r.querySelector('.custo-final-display').textContent), margem: parseFloat(r.querySelector('.margem-input').value) || 0, preco_venda: parseFloat(r.querySelector('.venda-input').value) || 0 }); });
    try {
        const res = await fetch(`api/compras.php?id=${compraId}&acao=PROCESSAR`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens }) }).then(r=>r.json());
        if (res.success) { showNotificationModal(res.message, 'Sucesso'); document.querySelectorAll('.modal').forEach(m=>m.style.display='none'); buscarProdutosDoServidor(); buscarComprasDoServidor(); }
        else showNotificationModal(res.message, 'Erro');
    } catch (e) { showNotificationModal('Falha na comunicação.'); }
  };

  window.reprocessarCompra = async function(compraId) {
    try {
        const response = await fetch(`api/compras.php?id=${compraId}`);
        const compra = await response.json();
        const itensResponse = await fetch(`api/compras.php?compra_id=${compraId}&itens=true`);
        const itens = await itensResponse.json();
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1100px;">
                <span class="modal-close" onclick="this.parentElement.parentElement.remove()">&times;</span>
                <h2>Ajuste Manual — NF-e #${compra.numero_nota}</h2>
                <div class="modal-header-info" style="background:#fff3e0;padding:15px;border-radius:8px;margin-bottom:20px;border-left:4px solid #ffb300;">
                    <p><strong>Fornecedor:</strong> ${compra.fornecedor_nome}</p>
                    <p><strong>Aviso:</strong> Este ajuste irá sobrescrever os valores atuais de estoque e preços.</p>
                </div>
                <div style="overflow-x:auto;"><table class="product-table">
                    <thead><tr><th>Produto</th><th>Qtd. Ajustada</th><th>Custo</th><th>Margem %</th><th>Preço Venda</th></tr></thead>
                    <tbody id="reprocessamentoItensBody">
                        ${itens.map(item => `<tr data-produto-id="${item.id_produto}"><td>${item.descricao}</td><td><input type="number" class="table-input quantidade-input" value="${item.quantidade_comercial}" style="width:80px"></td><td><input type="number" class="table-input preco-custo-input" value="${item.valor_unitario}" style="width:100px"></td><td><input type="number" class="table-input margem-input" value="30" style="width:70px"></td><td><input type="number" class="table-input preco-venda-input" value="${(item.valor_unitario*1.3).toFixed(2)}" style="width:100px"></td></tr>`).join('')}
                    </tbody>
                </table></div>
                <div class="modal-buttons" style="margin-top:25px;border-top:1px solid #eee;padding-top:15px;"><button onclick="confirmarAjusteManual(${compra.id})" class="btn-confirm" style="background:#ffb300;color:#1a1a2e">💾 Salvar Alterações</button><button onclick="this.closest('.modal').remove()" class="btn-cancel">Cancelar</button></div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelectorAll('tr[data-produto-id]').forEach(row => {
            const custoIn = row.querySelector('.preco-custo-input'), margemIn = row.querySelector('.margem-input'), vendaIn = row.querySelector('.preco-venda-input');
            const recalcular = () => { const c = parseFloat(custoIn.value) || 0, m = parseFloat(margemIn.value) || 0; vendaIn.value = (c * (1 + m/100)).toFixed(2); };
            custoIn.addEventListener('input', recalcular); margemIn.addEventListener('input', recalcular);
            vendaIn.addEventListener('input', () => { const c = parseFloat(custoIn.value) || 0, v = parseFloat(vendaIn.value) || 0; if (c > 0) margemIn.value = (((v - c) / c) * 100).toFixed(2); });
        });
    } catch (e) { showNotificationModal("Erro ao abrir ajuste"); }
  };

  window.confirmarAjusteManual = async function(compraId) {
    const rows = document.querySelectorAll('#reprocessamentoItensBody tr'), itens_reprocessados = [];
    rows.forEach(r => { itens_reprocessados.push({ produto_id: r.dataset.produtoId, quantidade_final: parseFloat(r.querySelector('.quantidade-input').value) || 0, preco_custo: parseFloat(r.querySelector('.preco-custo-input').value) || 0, margem: parseFloat(r.querySelector('.margem-input').value) || 0, preco_venda: parseFloat(r.querySelector('.preco-venda-input').value) || 0 }); });
    try {
        const res = await fetch(`api/compras.php?id=${compraId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens_reprocessados }) }).then(r=>r.json());
        if (res.success) { showNotificationModal("Dados atualizados!", 'Sucesso'); document.querySelectorAll('.modal').forEach(m=>m.style.display='none'); buscarProdutosDoServidor(); }
        else showNotificationModal(res.message, 'Erro');
    } catch (e) { showNotificationModal('Erro ao salvar ajuste.'); }
  };

  window.visualizarMovimentacao = async function(id) { showNotificationModal("ID da Movimentação: " + id, "Detalhes"); };

  // =============================================================
  // 5. RENDERIZAÇÃO E APIS
  // =============================================================
  function renderTabelaProdutos() { if (!productTableBody) return; productTableBody.innerHTML = produtos.map(p => `<tr><td>${p.id}</td><td>${p.referencia || "—"}</td><td><strong>${p.nome}</strong></td><td><span class="badge-status">${p.grupo_nome || "—"}</span></td><td>${p.unidade_venda || "UN"}</td><td><strong>${p.estoque}</strong></td><td>R$ ${fmt(p.preco_custo)}</td><td>${fmt(p.margem)}%</td><td>R$ ${fmt(p.preco_venda)}</td><td style="display:flex;gap:4px"><button class="small-btn" onclick="editarProduto(${p.id})">Editar</button><button class="small-btn delete-btn" onclick="excluirProduto(${p.id})">Excluir</button></td></tr>`).join(''); }
  function renderTabelaFornecedores() { if (!supplierTableBody) return; supplierTableBody.innerHTML = fornecedores.map(f => `<tr><td>${f.id}</td><td>${f.cnpj}</td><td><strong>${f.razao_social}</strong></td><td>${f.nome_fantasia || ''}</td><td>${f.telefone || ''}</td><td><button class="small-btn" onclick="editarFornecedor(${f.id})">Editar</button><button class="small-btn delete-btn" onclick="excluirFornecedor(${f.id})">Excluir</button></td></tr>`).join(''); }
  function renderTabelaCompras(compras) { if (!purchaseHistoryTableBody) return; purchaseHistoryTableBody.innerHTML = compras.map(c => { const badge = c.status === 'PROCESSADA' ? 'badge-success' : (c.status === 'CONFERIDA' ? 'badge-warning' : 'badge-info'); return `<tr><td>${c.id}</td><td>${new Date(c.data_emissao).toLocaleDateString('pt-BR')}</td><td><strong>${c.fornecedor_nome}</strong></td><td>${c.quantidade_itens || 0}</td><td>R$ ${fmt(c.valor_total)}</td><td><span class="badge ${badge}">${c.status || 'PENDENTE'}</span></td><td style="display:flex;gap:4px"><button onclick="visualizarCompra(${c.id})" class="small-btn">Ver</button>${c.status !== 'PROCESSADA' ? `<button onclick="abrirModalProcessamento(${c.id})" class="small-btn success-btn">Processar</button>` : ''}<button onclick="reprocessarCompra(${c.id})" class="small-btn secondary-btn">Ajustar</button></td></tr>`; }).join(''); }
  function renderTabelaMovimentacoes(movs) { if (!movementHistoryTableBody) return; movementHistoryTableBody.innerHTML = movs.map(m => `<tr><td>${m.id}</td><td>${new Date(m.data_movimentacao).toLocaleDateString('pt-BR')}</td><td style="font-weight:700;color:${m.tipo==='entrada'?'green':'red'}">${m.tipo.toUpperCase()}</td><td style="font-size:11px">${m.itens || '---'}</td><td>${m.motivo || '---'}</td><td><button class="small-btn" onclick="visualizarMovimentacao(${m.id})">Ver</button></td></tr>`).join(''); }

  async function buscarProdutosDoServidor() { try { const r = await fetch("api/produtos.php"); const data = await r.json(); if (Array.isArray(data)) { produtos = data; renderTabelaProdutos(); } } catch (e) {} }
  async function buscarFornecedoresDoServidor() { try { const r = await fetch("api/fornecedores.php"); const data = await r.json(); if (Array.isArray(data)) { fornecedores = data; renderTabelaFornecedores(); } } catch (e) {} }
  async function buscarComprasDoServidor() { try { const r = await fetch("api/compras.php"); const data = await r.json(); if (Array.isArray(data)) renderTabelaCompras(data); } catch (e) {} }
  async function buscarMovimentacoesDoServidor() { try { const r = await fetch("api/movimentacoes.php"); const data = await r.json(); if (Array.isArray(data)) renderTabelaMovimentacoes(data); } catch (e) {} }

  // =============================================================
  // 6. INICIALIZAÇÃO E EVENTOS
  // =============================================================
  async function inicializarDashboard() {
    try {
      const response = await fetch('api/sessao.php');
      if (response.ok) { dadosUsuarioLogado = await response.json(); localStorage.setItem('sgc_user_data', JSON.stringify(dadosUsuarioLogado)); }
      else if (response.status === 401) { window.location.href = 'login.html'; return; }
      const nameEl = document.getElementById('userProfileName'); if (nameEl) nameEl.textContent = dadosUsuarioLogado.usuario_nome || 'Usuário';
      await Promise.all([buscarProdutosDoServidor(), buscarFornecedoresDoServidor(), buscarComprasDoServidor(), buscarMovimentacoesDoServidor()]);
      if (window.lucide) lucide.createIcons();
      showSection('home');
    } catch (error) { if (!dadosUsuarioLogado.usuario_nome) window.location.href = 'login.html'; }
  }

  document.querySelectorAll('[data-section]').forEach(i => i.addEventListener("click", () => {
    const s = i.dataset.section;
    if (s === 'products') buscarProdutosDoServidor();
    if (s === 'suppliers') buscarFornecedoresDoServidor();
    if (s === 'purchases') buscarComprasDoServidor();
    if (s === 'movements') buscarMovimentacoesDoServidor();
  }));

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-close') || e.target.classList.contains('modal-close-btn')) {
        const m = e.target.closest('.modal'); if (m) m.style.display = 'none';
    }
    if (e.target.classList.contains('modal')) e.target.style.display = 'none';
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.removeItem('sgc_user_data'); window.location.href = 'api/logout.php'; });

  await inicializarDashboard();
});
