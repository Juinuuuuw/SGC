document.addEventListener("DOMContentLoaded", async () => {
  console.log("Iniciando Verificação de Sessão...");

  // =============================================================
  // 1. VARIÁVEIS GLOBAIS E DOM
  // =============================================================
  let dadosUsuarioLogado = JSON.parse(localStorage.getItem('sgc_user_data')) || {};
  let produtos = [];
  let fornecedores = [];
  let carrinho = [];

  // Elementos do Layout
  const allMenuItems = document.querySelectorAll(".sidebar nav ul li");
  const sections = document.querySelectorAll(".section");
  const contentArea = document.querySelector('.content-area');
  const breadcrumbNav = document.getElementById('breadcrumb-nav');
  const sidebar = document.querySelector('.sidebar');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');

  // Elementos de UI / Modais
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
  const accountsTableBody = document.getElementById('accountsTableBody');
  const categoriesTableBody = document.getElementById('categoriesTableBody');
  const transactionsTableBody = document.getElementById('transactionsTableBody');
  const movementHistoryTableBody = document.getElementById('movementHistoryTableBody');

  // Formulários
  const productForm = document.getElementById("productForm");
  const supplierForm = document.getElementById('supplierForm');

  let editandoId = null;
  let confirmCallback = null;

  // =============================================================
  // 2. FUNÇÕES DE SUPORTE
  // =============================================================
  
  function showNotificationModal(message, title = 'Aviso', duration = 3000) {
    if (notificationTitle) notificationTitle.textContent = title;
    if (notificationMessage) notificationMessage.textContent = message;
    if (notificationModal) notificationModal.style.display = 'flex';
    if (duration > 0) {
      setTimeout(() => {
        if (notificationModal && notificationModal.style.display === 'flex') hideNotificationModal();
      }, duration);
    }
  }

  function hideNotificationModal() {
    if (notificationModal) notificationModal.style.display = 'none';
  }

  function showConfirmationModal(message, onConfirm) {
    if (confirmationMessage) confirmationMessage.textContent = message;
    confirmCallback = onConfirm;
    if (confirmationModal) confirmationModal.style.display = 'flex';
  }

  function hideConfirmationModal() {
    if (confirmationModal) confirmationModal.style.display = 'none';
    confirmCallback = null;
  }

  function fmt(v) {
    return parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function showSection(sectionId) {
    sections.forEach(section => {
      section.classList.remove("active");
      if (section.id === sectionId) section.classList.add("active");
    });
    // Se for sub-seção de relatório, mostra a seção pai
    if (sectionId.startsWith('rep-')) {
        sections.forEach(s => { if(s.id === 'reports') s.classList.add('active'); });
    }
    updateBreadcrumbs(sectionId);
    window.dispatchEvent(new CustomEvent('sgcSectionChange', { detail: { section: sectionId } }));
  }

  // =============================================================
  // 3. NAVEGAÇÃO E BREADCRUMBS
  // =============================================================
  const breadcrumbMap = {
    'home': ['Início'],
    'suppliers': ['Compras e Estoque', 'Fornecedor'],
    'products': ['Compras e Estoque', 'Produtos'],
    'grupos': ['Compras e Estoque', 'Grupos de Produtos'],
    'purchases': ['Compras e Estoque', 'Compras'],
    'movements': ['Compras e Estoque', 'Movimentações'],
    'pdv-online': ['Vendas', 'PDV Online'],
    'finance': ['Financeiro'],
    'rep-estoque': ['Relatórios', 'Estoque'],
    'rep-vendas': ['Relatórios', 'Vendas'],
    'rep-financeiro': ['Relatórios', 'Financeiro'],
    'company-data': ['Gestão da Empresa', 'Dados da Empresa'],
    'users': ['Gestão da Empresa', 'Usuários e Perfis']
  };

  function updateBreadcrumbs(sectionId) {
    if (!breadcrumbNav) return;
    breadcrumbNav.innerHTML = '';
    const path = breadcrumbMap[sectionId] || ['Início'];
    path.forEach((item, index) => {
      const span = document.createElement('span');
      span.textContent = item;
      breadcrumbNav.appendChild(span);
      if (index < path.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'separator';
        sep.textContent = ' / ';
        breadcrumbNav.appendChild(sep);
      }
    });
  }

  allMenuItems.forEach(item => {
    const isSubmenuParent = item.classList.contains('has-submenu');
    const trigger = isSubmenuParent ? item.querySelector('span') : item;

    if (trigger) {
      trigger.addEventListener("click", (e) => {
        if (item.parentElement.classList.contains('submenu')) e.stopPropagation();
        
        if (isSubmenuParent && !item.hasAttribute('data-section')) {
            item.classList.toggle('open');
        } else if (item.hasAttribute('data-section')) {
            const target = item.dataset.section;
            document.querySelectorAll('.sidebar nav li').forEach(i => i.classList.remove("active"));
            item.classList.add("active");
            
            const parent = item.closest('.has-submenu');
            if (parent) parent.classList.add('active');

            showSection(target);
            if (window.innerWidth <= 992 && sidebar) sidebar.classList.remove('active');
        }
      });
    }
  });

  if (toggleSidebarBtn) {
    toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('sidebar-minimized');
    });
  }

  // =============================================================
  // 4. APIS E RENDERIZAÇÃO
  // =============================================================

  // --- PRODUTOS ---
  async function buscarProdutosDoServidor() {
    try {
      const r = await fetch("api/produtos.php");
      const data = await r.json();
      if (Array.isArray(data)) { produtos = data; renderTabelaProdutos(); }
    } catch (e) { console.error("Erro Produtos:", e); }
  }

  function renderTabelaProdutos() {
    if (!productTableBody) return;
    productTableBody.innerHTML = produtos.length ? "" : '<tr><td colspan="10" style="text-align: center;">Nenhum produto.</td></tr>';
    produtos.forEach(p => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${p.id}</td>
        <td>${p.referencia || "—"}</td>
        <td>${p.nome}</td>
        <td><span class="badge-grupo">${p.grupo_nome || "—"}</span></td>
        <td>${p.unidade_venda || "UN"}</td>
        <td>${p.estoque}</td>
        <td>R$ ${fmt(p.preco_custo)}</td>
        <td>${fmt(p.margem)}%</td>
        <td>R$ ${fmt(p.preco_venda)}</td>
        <td style="white-space: nowrap; display: flex; gap: 4px;">
          <button class="small-btn" onclick="editarProduto(${p.id})">Editar</button>
          <button class="small-btn delete-btn" onclick="excluirProduto(${p.id})">Excluir</button>
        </td>`;
      productTableBody.appendChild(row);
    });
  }

  // --- FORNECEDORES ---
  async function buscarFornecedoresDoServidor() {
    try {
      const r = await fetch("api/fornecedores.php");
      const data = await r.json();
      if (Array.isArray(data)) { fornecedores = data; renderTabelaFornecedores(); }
    } catch (e) { console.error("Erro Fornecedores:", e); }
  }

  function renderTabelaFornecedores() {
    if (!supplierTableBody) return;
    supplierTableBody.innerHTML = fornecedores.length ? "" : '<tr><td colspan="6" style="text-align: center;">Nenhum fornecedor.</td></tr>';
    fornecedores.forEach(f => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${f.id}</td>
        <td>${f.cnpj}</td>
        <td>${f.razao_social}</td>
        <td>${f.nome_fantasia || ''}</td>
        <td>${f.telefone || ''}</td>
        <td style="white-space: nowrap; display: flex; gap: 4px;">
          <button class="small-btn" onclick="editarFornecedor(${f.id})">Editar</button>
          <button class="small-btn delete-btn" onclick="excluirFornecedor(${f.id})">Excluir</button>
        </td>`;
      supplierTableBody.appendChild(row);
    });
  }

  // --- COMPRAS ---
  async function buscarComprasDoServidor() {
    try {
      const r = await fetch("api/compras.php");
      const data = await r.json();
      if (Array.isArray(data)) renderTabelaCompras(data);
    } catch (e) { console.error("Erro Compras:", e); }
  }

  function renderTabelaCompras(compras) {
    if (!purchaseHistoryTableBody) return;
    purchaseHistoryTableBody.innerHTML = compras.length ? "" : '<tr><td colspan="8" style="text-align:center;">Nenhuma compra.</td></tr>';
    compras.forEach(c => {
      const status = c.status || 'PENDENTE';
      const badge = status === 'PROCESSADA' ? 'badge-success' : (status === 'CONFERIDA' ? 'badge-warning' : 'badge-info');
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${c.id}</td>
        <td>${new Date(c.data_emissao).toLocaleDateString('pt-BR')}</td>
        <td>${c.fornecedor_nome}</td>
        <td>${c.quantidade_itens || 0}</td>
        <td>R$ ${fmt(c.valor_total)}</td>
        <td><span class="badge ${badge}">${status}</span></td>
        <td style="white-space: nowrap; display: flex; gap: 4px;">
            <button onclick="visualizarCompra(${c.id})" class="small-btn">Ver</button>
            ${status !== 'PROCESSADA' ? `<button onclick="abrirModalProcessamento(${c.id})" class="small-btn success-btn">Processar</button>` : ''}
            <button onclick="reprocessarCompra(${c.id})" class="small-btn secondary-btn">Ajustar</button>
        </td>`;
      purchaseHistoryTableBody.appendChild(row);
    });
  }

  // --- MOVIMENTAÇÕES ---
  async function buscarMovimentacoesDoServidor() {
    try {
      const r = await fetch("api/movimentacoes.php");
      const data = await r.json();
      if (Array.isArray(data)) renderTabelaMovimentacoes(data);
    } catch (e) { console.error("Erro Movimentações:", e); }
  }

  function renderTabelaMovimentacoes(movs) {
    if (!movementHistoryTableBody) return;
    movementHistoryTableBody.innerHTML = movs.length ? "" : '<tr><td colspan="6" style="text-align:center;">Nenhuma movimentação.</td></tr>';
    movs.forEach(m => {
        row.innerHTML = `<td>${m.id}</td><td>${new Date(m.data_movimentacao).toLocaleString('pt-BR')}</td><td>${m.tipo}</td><td>${m.itens}</td><td>${m.motivo}</td><td><button onclick="visualizarMovimentacao(${m.id})">Ver</button></td>`;
        movementHistoryTableBody.appendChild(row);
    });
  }

  // =============================================================
  // 5. INICIALIZAÇÃO E SESSÃO
  // =============================================================
  async function inicializarDashboard() {
    try {
      const response = await fetch('api/sessao.php');
      if (response.ok) {
        dadosUsuarioLogado = await response.json();
        localStorage.setItem('sgc_user_data', JSON.stringify(dadosUsuarioLogado));
      } else if (response.status === 401) {
        window.location.href = 'login.html';
        return;
      }

      configurarInterfaceComDadosDoUsuario();
      await carregarDadosIniciais();

    } catch (error) {
      console.error("Falha ao iniciar:", error);
      if (!dadosUsuarioLogado.usuario_nome) window.location.href = 'login.html';
      else configurarInterfaceComDadosDoUsuario();
    }
  }

  function configurarInterfaceComDadosDoUsuario() {
    const nameEl = document.getElementById('userProfileName');
    if (nameEl) nameEl.textContent = dadosUsuarioLogado.usuario_nome || 'Usuário';
    
    const permissoes = dadosUsuarioLogado.permissoes || {};
    document.querySelectorAll('[data-permissao]').forEach(item => {
      const p = item.getAttribute('data-permissao');
      if (permissoes[p]) {
        item.style.display = '';
        const parent = item.closest('.has-submenu');
        if (parent) parent.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });

    if (window.lucide) lucide.createIcons();
  }

  async function carregarDadosIniciais() {
    await Promise.all([
        buscarProdutosDoServidor(),
        buscarFornecedoresDoServidor(),
        buscarComprasDoServidor(),
        buscarMovimentacoesDoServidor()
    ]);
    showSection('home');
  }

  // Eventos de clique nas seções para atualizar
  document.querySelectorAll('[data-section="products"]').forEach(i => i.addEventListener("click", buscarProdutosDoServidor));
  document.querySelectorAll('[data-section="suppliers"]').forEach(i => i.addEventListener("click", buscarFornecedoresDoServidor));
  document.querySelectorAll('[data-section="purchases"]').forEach(i => i.addEventListener("click", buscarComprasDoServidor));
  document.querySelectorAll('[data-section="movements"]').forEach(i => i.addEventListener("click", buscarMovimentacoesDoServidor));

  if (notificationCloseBtn) notificationCloseBtn.addEventListener('click', hideNotificationModal);
  if (confirmActionBtn) confirmActionBtn.addEventListener('click', () => { if (confirmCallback) confirmCallback(); hideConfirmationModal(); });
  if (cancelActionBtn) cancelActionBtn.addEventListener('click', hideConfirmationModal);
  
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.removeItem('sgc_user_data'); window.location.href = 'api/logout.php'; });

  await inicializarDashboard();

});
