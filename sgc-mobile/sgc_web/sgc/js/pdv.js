// js/pdv.js
import * as state from './state.js';
import { showNotificationModal, showProductSelectionModal, hideProductSelectionModal } from './modals.js';
import { renderProductsTable } from './products.js';

const pdvProductInput = document.getElementById('pdv-product-input');
const pdvQuantityInput = document.getElementById('pdv-quantity-input');
const pdvItemsTbody = document.getElementById('pdv-items-tbody');
const pdvTotalValue = document.getElementById('pdv-total-value');
const modalProductSearch = document.getElementById('modalProductSearch');
const modalProductList = document.getElementById('modalProductList');

function calcularTotalPdv() {
    const total = state.carrinho.reduce((acc, item) => acc + (parseFloat(item.preco_venda) * item.quantidade), 0);
    pdvTotalValue.textContent = `R$ ${total.toFixed(2)}`;
}

function renderizarCarrinhoPdv() {
    pdvItemsTbody.innerHTML = '';
    if (state.carrinho.length === 0) {
        pdvItemsTbody.innerHTML = `<tr class="empty-cart-message"><td colspan="5">CAIXA LIVRE</td></tr>`;
    } else {
        state.carrinho.forEach((item, index) => {
            const row = document.createElement('tr');
            const valorTotalItem = (item.quantidade * parseFloat(item.preco_venda)).toFixed(2);
            row.innerHTML = `
                <td>${index + 1}</td><td>${item.nome}</td>
                <td>${item.quantidade}</td><td style="text-align: right;">R$ ${parseFloat(item.preco_venda).toFixed(2)}</td>
                <td style="text-align: right;">R$ ${valorTotalItem}</td>`;
            pdvItemsTbody.appendChild(row);
        });
    }
    calcularTotalPdv();
}

function adicionarAoCarrinhoPdv(produtoId, quantidade = 1) {
    const produto = state.produtos.find(p => p.codigo === produtoId);
    if (!produto) { showNotificationModal('Produto não encontrado!', 'Erro'); return; }
    if (produto.estoque < quantidade) { showNotificationModal(`Estoque insuficiente. Apenas ${produto.estoque} em estoque.`, 'Erro'); return; }

    const itemNoCarrinho = state.carrinho.find(item => item.codigo === produtoId);
    if (itemNoCarrinho) {
        itemNoCarrinho.quantidade += quantidade;
    } else {
        state.carrinho.push({ ...produto, quantidade: quantidade });
    }
    pdvProductInput.value = ""; pdvQuantityInput.value = "1"; pdvProductInput.focus();
    renderizarCarrinhoPdv();
}

function finalizarVendaPdv() {
    if (state.carrinho.length === 0) { showNotificationModal("O caixa está livre.", "Aviso"); return; }
    state.carrinho.forEach(itemVendido => {
        const produtoOriginal = state.produtos.find(p => p.codigo === itemVendido.codigo);
        if (produtoOriginal) produtoOriginal.estoque -= itemVendido.quantidade;
    });
    showNotificationModal(`Venda finalizada! Total: ${pdvTotalValue.textContent}`, "Venda Concluída");
    state.setCarrinho([]);
    renderizarCarrinhoPdv();
    renderProductsTable();
}

function renderProductSelectionList(searchTerm = '') {
    modalProductList.innerHTML = '';
    const term = searchTerm.toLowerCase();
    const resultados = state.produtos.filter(p => p.nome.toLowerCase().includes(term) || (p.referencia && p.referencia.toLowerCase().includes(term)) || String(p.codigo).includes(term));

    if (resultados.length === 0) {
        modalProductList.innerHTML = '<p style="text-align: center; padding: 20px;">Nenhum produto encontrado.</p>'; return;
    }
    resultados.forEach(p => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "modal-product-item";
        itemDiv.innerHTML = `<div class="info"><strong>${p.nome}</strong><div class="ref">Ref: ${p.referencia || 'N/A'}</div></div><div class="stock">Estoque: ${p.estoque}</div><div class="price">R$ ${p.preco_venda}</div>`;
        itemDiv.onclick = () => { adicionarAoCarrinhoPdv(p.codigo, 1); hideProductSelectionModal(); };
        modalProductList.appendChild(itemDiv);
    });
}

export function initPdv() {
    pdvProductInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const valorInput = pdvProductInput.value.trim();
        if (!valorInput) return;

        let quantidade = parseInt(pdvQuantityInput.value, 10) || 1;
        let identificador = valorInput.toLowerCase();

        if (valorInput.includes('*')) {
            const parts = valorInput.split('*');
            const possivelQtd = parseInt(parts[0].trim(), 10);
            if (!isNaN(possivelQtd) && parts.length > 1) {
                quantidade = possivelQtd;
                identificador = parts[1].trim().toLowerCase();
            }
        }
        const produtoEncontrado = state.produtos.find(p => String(p.codigo) === identificador || (p.referencia && p.referencia.toLowerCase() === identificador) || p.nome.toLowerCase().includes(identificador));
        if (produtoEncontrado) {
            adicionarAoCarrinhoPdv(produtoEncontrado.codigo, quantidade);
        } else {
            showNotificationModal(`Produto "${identificador}" não encontrado.`, 'Erro');
        }
    });

    modalProductSearch.addEventListener('input', () => renderProductSelectionList(modalProductSearch.value));

    document.addEventListener('keydown', (event) => {
        const pdvSection = document.getElementById('pdv-online');
        if (!pdvSection.classList.contains('active')) return;
        if (event.key === 'F5') {
            event.preventDefault();
            renderProductSelectionList();
            modalProductSearch.value = '';
            showProductSelectionModal();
            modalProductSearch.focus();
        }
        if (event.key === 'F8') {
            event.preventDefault();
            finalizarVendaPdv();
        }
    });
}