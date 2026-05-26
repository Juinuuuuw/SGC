// js/suppliers.js

import * as state from './state.js';
// CORRIGIDO AQUI: O nome da função importada agora está correto.
import { renderProductsTable } from './products.js'; 

// --- Seletores de Elementos ---
const supplierForm = document.getElementById('supplierForm');
const supplierTableBody = document.getElementById('supplierTableBody');
const cancelarEdicaoFornecedorBtn = document.getElementById('cancelarEdicaoFornecedor');
const contentArea = document.querySelector('.content-area');
let editandoFornecedorId = null;

// --- Funções de Renderização Exportadas ---
export function renderSuppliers() {
    supplierTableBody.innerHTML = '';
    state.fornecedores.forEach(f => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${f.id}</td>
            <td>${f.cnpj}</td>
            <td>${f.razaoSocial}</td>
            <td>${f.nomeFantasia || ''}</td>
            <td>${f.telefone || ''}</td>
            <td>
                <button onclick="suppliers.edit(${f.id})">Editar</button>
                <button class="delete-btn" onclick="suppliers.remove(${f.id})">Excluir</button>
            </td>
        `;
        supplierTableBody.appendChild(row);
    });
}

// --- Funções de Lógica ---
function editSupplier(id) {
    const fornecedor = state.fornecedores.find(f => f.id === id);
    if (!fornecedor) return;
    for (const key in fornecedor) {
        if (supplierForm.elements[key]) {
            supplierForm.elements[key].value = fornecedor[key];
        }
    }
    editandoFornecedorId = id;
    supplierForm.querySelector('button[type="submit"]').textContent = 'Salvar Alterações';
    cancelarEdicaoFornecedorBtn.style.display = 'inline-block';
    contentArea.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeSupplier(id) {
    if (confirm('Tem certeza que deseja excluir este fornecedor? Esta ação não pode ser desfeita.')) {
        // CORRIGIDO AQUI: Usando a função 'setFornecedores' do state.js para garantir a reatividade.
        state.setFornecedores(state.fornecedores.filter(f => f.id !== id));
        renderSuppliers();
    }
}

function resetSupplierForm() {
    supplierForm.reset();
    editandoFornecedorId = null;
    supplierForm.querySelector('button[type="submit"]').textContent = 'Cadastrar Fornecedor';
    cancelarEdicaoFornecedorBtn.style.display = 'none';
}

// --- Inicializador do Módulo ---
export function initSuppliers() {
    supplierForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(supplierForm);
        const fornecedorData = Object.fromEntries(formData.entries());

        if (editandoFornecedorId !== null) {
            const index = state.fornecedores.findIndex(f => f.id === editandoFornecedorId);
            state.fornecedores[index] = { ...state.fornecedores[index], ...fornecedorData };
        } else {
            fornecedorData.id = state.contadorFornecedorId;
            state.fornecedores.push(fornecedorData);
            state.incrementFornecedorId();
        }
        resetSupplierForm();
        renderSuppliers();
    });
    
    cancelarEdicaoFornecedorBtn.addEventListener('click', resetSupplierForm);

    window.suppliers = {
        edit: editSupplier,
        remove: removeSupplier
    };

    renderSuppliers();
}