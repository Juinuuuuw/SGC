// js/stockMovements.js
import * as state from './state.js';
import { showNotificationModal, showMovementDetailModal } from './modals.js';
import { renderProductsTable } from './products.js';

const movementForm = document.getElementById('movementForm');
const movementProductSearch = document.getElementById('movementProductSearch');
const movementSearchResults = document.getElementById('movementSearchResults');
const movementItemQuantity = document.getElementById('movementItemQuantity');
const addMovementItemBtn = document.getElementById('addMovementItemBtn');
const movementItemsTableBody = document.getElementById('movementItemsTableBody');
const movementHistoryTableBody = document.getElementById('movementHistoryTableBody');
let produtoSelecionadoMovimentacao = null;

function renderItensMovimentacao() {
    movementItemsTableBody.innerHTML = '';
    state.itensMovimentacaoAtual.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${item.codigo}</td><td>${item.referencia}</td><td>${item.nome}</td><td>${item.quantidade}</td><td><button class="delete-btn" onclick="stockMovements.removeItem(${item.codigo})">Remover</button></td>`;
        movementItemsTableBody.appendChild(row);
    });
}

function removeItemMovimentacao(codigoProduto) {
    state.setItensMovimentacaoAtual(state.itensMovimentacaoAtual.filter(item => item.codigo !== codigoProduto));
    renderItensMovimentacao();
}

function viewMovement(transacaoId) {
    const transacao = state.historicoMovimentacoes.find(t => t.id === transacaoId);
    if (!transacao) return;
    const detailsContainer = document.getElementById('movementModalDetails');
    detailsContainer.innerHTML = `<p><strong>ID:</strong> ${transacao.id}</p><p><strong>Data:</strong> ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(transacao.data)}</p><p><strong>Tipo:</strong> <span class="movement-type-${transacao.tipo}">${transacao.tipo}</p><p><strong>Motivo:</strong> ${transacao.motivo}</p>`;
    const itemsBody = document.getElementById('movementModalItemsTableBody');
    itemsBody.innerHTML = '';
    transacao.itens.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${item.codigo}</td><td>${item.referencia}</td><td>${item.nome}</td><td>${item.quantidade}</td>`;
        itemsBody.appendChild(row);
    });
    showMovementDetailModal();
}

function renderMovementHistory() {
    movementHistoryTableBody.innerHTML = '';
    [...state.historicoMovimentacoes].reverse().forEach(transacao => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${transacao.id}</td><td>${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(transacao.data)}</td>
            <td><span class="movement-type-${transacao.tipo}">${transacao.tipo}</span></td><td>${transacao.itens.length}</td>
            <td>${transacao.motivo}</td><td><button onclick="stockMovements.view(${transacao.id})">Visualizar</button></td>`;
        movementHistoryTableBody.appendChild(row);
    });
}

export function initStockMovements() {
    movementProductSearch.addEventListener('input', () => {
        const searchTerm = movementProductSearch.value.toLowerCase();
        produtoSelecionadoMovimentacao = null;
        if (searchTerm.length < 2) { movementSearchResults.style.display = 'none'; return; }
        const resultados = state.produtos.filter(p => p.nome.toLowerCase().includes(searchTerm) || String(p.codigo).includes(searchTerm));
        movementSearchResults.innerHTML = "";
        if (resultados.length > 0) {
            movementSearchResults.style.display = 'block';
            resultados.forEach(p => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "search-result-item";
                itemDiv.innerHTML = `${p.nome} <span>Cód: ${p.codigo} | Estoque: ${p.estoque}</span>`;
                itemDiv.onclick = () => {
                    produtoSelecionadoMovimentacao = p;
                    movementProductSearch.value = p.nome;
                    movementSearchResults.style.display = 'none';
                };
                movementSearchResults.appendChild(itemDiv);
            });
        }
    });

    addMovementItemBtn.addEventListener('click', () => {
        const quantidade = parseInt(movementItemQuantity.value, 10);
        if (!produtoSelecionadoMovimentacao) { showNotificationModal('Selecione um produto.', 'Aviso'); return; }
        if (isNaN(quantidade) || quantidade <= 0) { showNotificationModal('Insira uma quantidade válida.', 'Aviso'); return; }

        const itemExistente = state.itensMovimentacaoAtual.find(item => item.codigo === produtoSelecionadoMovimentacao.codigo);
        if (itemExistente) { itemExistente.quantidade += quantidade; }
        else { state.itensMovimentacaoAtual.push({ ...produtoSelecionadoMovimentacao, quantidade: quantidade }); }
        
        renderItensMovimentacao();
        produtoSelecionadoMovimentacao = null; movementProductSearch.value = ''; movementItemQuantity.value = ''; movementProductSearch.focus();
    });

    movementForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const tipo = document.getElementById('movementType').value;
        const motivo = document.getElementById('movementReason').value;

        if (state.itensMovimentacaoAtual.length === 0) { showNotificationModal('Adicione pelo menos um item.', 'Erro'); return; }
        if (!motivo.trim()) { showNotificationModal('O motivo é obrigatório.', 'Erro'); return; }

        if (tipo === 'saida') {
            for (const item of state.itensMovimentacaoAtual) {
                if (item.quantidade > state.produtos.find(p => p.codigo === item.codigo).estoque) {
                    showNotificationModal(`Estoque insuficiente para "${item.nome}".`, 'Erro'); return;
                }
            }
        }

        state.itensMovimentacaoAtual.forEach(item => {
            const produto = state.produtos.find(p => p.codigo === item.codigo);
            produto.estoque += (tipo === 'entrada' ? item.quantidade : -item.quantidade);
        });

        state.historicoMovimentacoes.push({
            id: state.contadorMovimentacaoId, data: new Date(), tipo, motivo, itens: [...state.itensMovimentacaoAtual]
        });
        state.incrementMovimentacaoId();
        
        renderMovementHistory(); renderProductsTable();
        showNotificationModal('Movimentação registrada com sucesso!', 'Sucesso');
        state.setItensMovimentacaoAtual([]);
        renderItensMovimentacao();
        movementForm.reset();
    });

    window.stockMovements = { removeItem: removeItemMovimentacao, view: viewMovement };
    renderMovementHistory();
}