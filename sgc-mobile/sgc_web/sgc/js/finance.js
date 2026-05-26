// js/finance.js
import * as state from './state.js';

const financeTabBtns = document.querySelectorAll('.finance-tab-btn');
const financeTabPanes = document.querySelectorAll('.finance-tab-pane');
const accountForm = document.getElementById('accountForm');
const accountsTableBody = document.getElementById('accountsTableBody');
const categoryForm = document.getElementById('categoryForm');
const categoriesTableBody = document.getElementById('categoriesTableBody');
const transactionForm = document.getElementById('transactionForm');
const transactionsTableBody = document.getElementById('transactionsTableBody');
const transactionCategorySelect = document.getElementById('transactionCategorySelect');
const transactionAccountSelect = document.getElementById('transactionAccountSelect');

function renderContasCaixas() {
    accountsTableBody.innerHTML = '';
    transactionAccountSelect.innerHTML = '<option value="">Selecione a Conta</option>';
    state.contasCaixas.forEach(conta => {
        accountsTableBody.innerHTML += `<tr><td>${conta.id}</td><td>${conta.name}</td><td>R$ ${conta.balance.toFixed(2)}</td><td><button class="delete-btn" onclick="finance.removeAccount(${conta.id})">Excluir</button></td></tr>`;
        transactionAccountSelect.innerHTML += `<option value="${conta.id}">${conta.name}</option>`;
    });
}

function renderPlanoDeContas() {
    categoriesTableBody.innerHTML = '';
    transactionCategorySelect.innerHTML = '<option value="">Selecione a Categoria</option>';
    state.planoDeContas.forEach(cat => {
        categoriesTableBody.innerHTML += `<tr><td>${cat.id}</td><td>${cat.name}</td><td>${cat.type}</td><td><button class="delete-btn" onclick="finance.removeCategory(${cat.id})">Excluir</button></td></tr>`;
        transactionCategorySelect.innerHTML += `<option value="${cat.id}">${cat.name} (${cat.type})</option>`;
    });
}

function renderLancamentos() {
    transactionsTableBody.innerHTML = '';
    state.lancamentosFinanceiros.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate)).forEach(lanc => {
        const categoria = state.planoDeContas.find(c => c.id === lanc.categoryId)?.name || 'N/A';
        const valorClasse = lanc.type === 'receita' ? 'valor-receita' : 'valor-despesa';
        transactionsTableBody.innerHTML += `
            <tr>
                <td>${new Date(lanc.dueDate + 'T03:00:00Z').toLocaleDateString('pt-BR')}</td>
                <td>${lanc.description}</td><td>${categoria}</td>
                <td class="${valorClasse}">${lanc.type === 'receita' ? '+' : '-'} R$ ${lanc.value.toFixed(2)}</td>
                <td>${lanc.status}</td>
                <td><button class="delete-btn" onclick="finance.removeTransaction(${lanc.id})">Excluir</button></td>
            </tr>`;
    });
}

export function initFinance() {
    financeTabBtns.forEach(btn => btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        financeTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        financeTabPanes.forEach(pane => pane.classList.toggle('active', pane.id === `tab-${tabId}`));
    }));

    accountForm.addEventListener('submit', (e) => {
        e.preventDefault();
        state.contasCaixas.push({
            id: state.contadorContaId,
            name: e.target.elements.name.value,
            balance: parseFloat(e.target.elements.initialBalance.value) || 0
        });
        state.incrementContaId();
        accountForm.reset(); renderContasCaixas();
    });

    categoryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        state.planoDeContas.push({
            id: state.contadorCategoriaId,
            name: e.target.elements.name.value,
            type: e.target.elements.type.value
        });
        state.incrementCategoriaId();
        categoryForm.reset(); renderPlanoDeContas();
    });

    transactionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(transactionForm).entries());
        state.lancamentosFinanceiros.push({
            id: state.contadorLancamentoId, type: data.type, description: data.description,
            value: parseFloat(data.value), dueDate: data.dueDate,
            categoryId: parseInt(data.categoryId), accountId: parseInt(data.accountId), status: data.status
        });
        state.incrementLancamentoId();
        transactionForm.reset(); renderLancamentos();
    });

    window.finance = {
        removeAccount: (id) => { if(confirm('Deseja excluir?')) { state.contasCaixas = state.contasCaixas.filter(c => c.id !== id); renderContasCaixas(); }},
        removeCategory: (id) => { if(confirm('Deseja excluir?')) { state.planoDeContas = state.planoDeContas.filter(c => c.id !== id); renderPlanoDeContas(); }},
        removeTransaction: (id) => { if(confirm('Deseja excluir?')) { state.lancamentosFinanceiros = state.lancamentosFinanceiros.filter(l => l.id !== id); renderLancamentos(); }},
    };

    renderContasCaixas(); renderPlanoDeContas(); renderLancamentos();
}