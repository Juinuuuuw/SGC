// js/ui.js

// --- Seletores de Elementos ---
const menuItems = document.querySelectorAll(".sidebar nav ul li");
const sections = document.querySelectorAll(".section");
const breadcrumbNav = document.getElementById('breadcrumb-nav');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const sidebar = document.querySelector('.sidebar');
// --- LINHAS ADICIONADAS ---
const productTabBtns = document.querySelectorAll('.product-tab-btn');
const productTabPanes = document.querySelectorAll('.product-tab-pane');

const breadcrumbMap = {
    'home': ['Início'], 
    'suppliers': ['Compras e Estoque', 'Fornecedor'],
    'products': ['Compras e Estoque', 'Produtos'], 
    'purchases': ['Compras e Estoque', 'Compras'],
    'movements': ['Compras e Estoque', 'Movimentações'], 
    'labels': ['Compras e Estoque', 'Etiquetas'],
    'pdv-online': ['Vendas', 'PDV Online'], 
    'pdv-local': ['Vendas', 'PDV Local'],
    'finance': ['Financeiro'], 
    'reports': ['Relatórios']
};

function updateBreadcrumbs(sectionId) {
    breadcrumbNav.innerHTML = '';
    const path = breadcrumbMap[sectionId] || ['Início'];
    path.forEach((item, index) => {
        const itemEl = document.createElement('span');
        itemEl.textContent = item;
        breadcrumbNav.appendChild(itemEl);
        if (index < path.length - 1) {
            const separator = document.createElement('span');
            separator.className = 'separator';
            separator.textContent = ' / ';
            breadcrumbNav.appendChild(separator);
        }
    });
}

// --- FUNÇÃO ADICIONADA ---
function setupTabNavigation(tabButtons, tabPanes) {
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tabPanes.forEach(pane => {
                pane.classList.toggle('active', pane.id === `tab-${tabId}`);
            });
        });
    });
}

// --- FUNÇÃO CORRIGIDA PARA NAVEGAÇÃO DA SIDEBAR ---
function setupSidebarNavigation() {
    menuItems.forEach(item => {
        // Para itens clicáveis (que não são apenas headers)
        if (item.hasAttribute("data-section") || item.classList.contains("has-submenu")) {
            const clickableElement = item.classList.contains("has-submenu") ? item.querySelector('span') : item;
            
            if (clickableElement) {
                clickableElement.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Expandir sidebar se estiver minimizada
                    if (sidebar.classList.contains('sidebar-minimized')) {
                        sidebar.classList.remove('sidebar-minimized');
                    }
                    
                    // Se for submenu, apenas alternar abertura/fechamento
                    if (item.classList.contains("has-submenu")) {
                        item.classList.toggle("open");
                        return; // Não navegar para seção
                    }
                    
                    // Se for item de seção, navegar
                    if (item.hasAttribute("data-section")) {
                        const targetSectionId = item.getAttribute("data-section");
                        
                        // Remover classe active de todos os itens do menu
                        menuItems.forEach(menuItem => {
                            menuItem.classList.remove("active");
                        });
                        
                        // Adicionar classe active ao item clicado
                        item.classList.add("active");
                        
                        // Esconder todas as seções
                        sections.forEach(section => {
                            section.classList.remove("active");
                        });
                        
                        // Mostrar a seção alvo
                        const targetSection = document.getElementById(targetSectionId);
                        if (targetSection) {
                            targetSection.classList.add("active");
                            updateBreadcrumbs(targetSectionId);
                        } else {
                            console.warn(`Seção com ID '${targetSectionId}' não encontrada`);
                        }
                    }
                });
            }
        }
    });
}

export function initUI() {
    // Botão de toggle da sidebar
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('sidebar-minimized');
        });
    }
    
    // Configurar navegação da sidebar
    setupSidebarNavigation();
    
    // Configurar navegação por abas (se existirem)
    if (productTabBtns.length > 0 && productTabPanes.length > 0) {
        setupTabNavigation(productTabBtns, productTabPanes);
    }
    
    // Inicializar com a seção home ativa
    const homeSection = document.getElementById('home');
    if (homeSection) {
        homeSection.classList.add('active');
    }
    
    updateBreadcrumbs('home');
    
    // Adicionar classe active ao item do menu home
    menuItems.forEach(item => {
        if (item.getAttribute('data-section') === 'home') {
            item.classList.add('active');
        }
    });
}