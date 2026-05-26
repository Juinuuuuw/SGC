// js/purchaseImport.js
import * as state from './state.js';
import { showNotificationModal, showConfirmationModal, showPurchaseDetailModal } from './modals.js';
import { renderProductsTable } from './products.js';
import { renderSuppliers } from './suppliers.js';

const xmlFileInput = document.getElementById('xmlFileInput');
const purchaseImportContainer = document.getElementById('purchaseImportContainer');
const supplierNameDisplay = document.getElementById('supplierNameDisplay');
const purchaseItemsTableBody = document.getElementById('purchaseItemsTableBody');
const confirmPurchaseBtn = document.getElementById('confirmPurchaseBtn');
const purchaseHistoryTableBody = document.getElementById('purchaseHistoryTableBody');
const initialImportPrompt = document.getElementById('initial-import-prompt');
const cancelPurchaseImportBtn = document.getElementById('cancelPurchaseImportBtn');
let compraAtual = {};
const unitOptions = ['UN', 'CX', 'PC', 'PCT', 'KG', 'G', 'L', 'ML', 'M', 'M2'];

function createUnitSelectHTML(className, selectedValue = 'UN') {
    const normalized = unitOptions.includes(selectedValue.toUpperCase()) ? selectedValue.toUpperCase() : 'UN';
    const optionsHTML = unitOptions.map(u => `<option value="${u}" ${u === normalized ? 'selected' : ''}>${u}</option>`).join('');
    return `<select class="${className}">${optionsHTML}</select>`;
}

function viewPurchase(compraId) {
    const compra = state.historicoCompras.find(c => c.id === compraId);
    if (!compra) { showNotificationModal('Registro da compra não encontrado!', 'Erro'); return; }
    document.getElementById('modalSupplierName').textContent = compra.fornecedorNome;
    document.getElementById('modalSupplierCnpj').textContent = compra.fornecedorCnpj;
    document.getElementById('modalPurchaseDate').textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(compra.dataLancamento));
    document.getElementById('modalPurchaseTotal').textContent = `R$ ${compra.valorTotalNota.toFixed(2)}`;
    
    const modalItemsTableBody = document.getElementById('modalItemsTableBody');
    modalItemsTableBody.innerHTML = '';
    compra.itens.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.codFornecedor}</td><td>${item.nome}</td><td>${(item.qtd || 0).toFixed(2)}</td>
            <td>R$ ${(item.precoCusto || 0).toFixed(2)}</td><td>R$ ${((item.qtd || 0) * (item.precoCusto || 0)).toFixed(2)}</td>`;
        modalItemsTableBody.appendChild(row);
    });
    showPurchaseDetailModal();
}

function cancelImport() {
    purchaseImportContainer.classList.remove('visible');
    initialImportPrompt.classList.remove('collapsed');
    xmlFileInput.value = '';
    compraAtual = {};
    setTimeout(() => { purchaseItemsTableBody.innerHTML = ''; }, 500);
}

function processXmlFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, "application/xml");
            if (xmlDoc.querySelector('parsererror') || !xmlDoc.querySelector('infNFe')) throw new Error('XML inválido');
            const fornecedor = processSupplier(xmlDoc);
            const itensNota = processItems(xmlDoc);
            compraAtual = { fornecedor, itens: itensNota, valorTotalNota: parseFloat(xmlDoc.querySelector('vNF')?.textContent || '0') };
            displayPurchaseData(fornecedor, itensNota);
        } catch (error) {
            showNotificationModal('Ocorreu um erro ao processar o arquivo XML.', 'Erro');
            console.error("Erro XML:", error);
        }
    };
    reader.readAsText(file);
}

function getText(el, tag) { return el.querySelector(tag)?.textContent || ''; }

function processSupplier(xmlDoc) {
    const emit = xmlDoc.querySelector('emit');
    const ender = xmlDoc.querySelector('enderEmit');
    const cnpj = getText(emit, 'CNPJ');
    let fornecedor = state.fornecedores.find(f => f.cnpj === cnpj);
    const fornecedorData = {
        cnpj, razaoSocial: getText(emit, 'xNome'), nomeFantasia: getText(emit, 'xFant'),
        telefone: getText(ender, 'fone'), logradouro: getText(ender, 'xLgr'),
    };
    if (fornecedor) {
        Object.assign(fornecedor, fornecedorData);
    } else {
        fornecedor = { id: state.contadorFornecedorId, ...fornecedorData };
        state.fornecedores.push(fornecedor);
        state.incrementFornecedorId();
    }
    return fornecedor;
}

function processItems(xmlDoc) {
    return Array.from(xmlDoc.querySelectorAll('det')).map(det => {
        const prod = det.querySelector('prod');
        return {
            codFornecedor: getText(prod, 'cProd'), nome: getText(prod, 'xProd'),
            ean: getText(prod, 'cEAN'), ncm: getText(prod, 'NCM'),
            qtd: parseFloat(getText(prod, 'qCom') || '0'),
            unidadeComercial: getText(prod, 'uCom'),
            precoCusto: parseFloat(getText(prod, 'vUnCom') || '0'),
        };
    });
}

function displayPurchaseData(fornecedor, itens) {
    purchaseImportContainer.classList.add('visible');
    initialImportPrompt.classList.add('collapsed');
    supplierNameDisplay.textContent = `${fornecedor.razaoSocial} (CNPJ: ${fornecedor.cnpj})`;
    purchaseItemsTableBody.innerHTML = '';
    itens.forEach((item) => {
        const produtoExistente = item.ean ? state.produtos.find(p => p.referencia === item.ean && p.referencia) : null;
        const selectedUnit = produtoExistente ? produtoExistente.unidadeVenda : item.unidadeComercial;
        const row = document.createElement('tr');
        row.dataset.itemData = JSON.stringify(item);
        row.innerHTML = `
            <td>${item.nome}</td><td>${item.qtd.toFixed(2)}</td><td>${item.unidadeComercial}</td>
            <td><input type="number" class="fator-conversao-input" value="1" step="any"></td>
            <td>${createUnitSelectHTML('unidade-venda-input', selectedUnit)}</td>
            <td class="quantidade-final-display">${item.qtd.toFixed(2)}</td>
            <td>R$ <span class="custo-unitario-final-display">${item.precoCusto.toFixed(2)}</span></td>
            <td><input type="number" class="margem-input" placeholder="0.00" step="0.01"></td>
            <td><input type="number" class="preco-venda-input" placeholder="0.00" step="0.01"></td>`;
        purchaseItemsTableBody.appendChild(row);
        
        row.querySelectorAll('input').forEach(input => input.addEventListener('input', () => recalculatePurchaseRow(row)));
        recalculatePurchaseRow(row);
    });
}

function recalculatePurchaseRow(row) {
    const itemData = JSON.parse(row.dataset.itemData);
    const fator = parseFloat(row.querySelector('.fator-conversao-input').value) || 1;
    const qtdFinal = itemData.qtd * fator;
    const custoFinal = fator > 0 ? itemData.precoCusto / fator : 0;

    row.querySelector('.quantidade-final-display').textContent = qtdFinal.toFixed(3);
    row.querySelector('.custo-unitario-final-display').textContent = custoFinal.toFixed(2);
    
    const margemInput = row.querySelector('.margem-input');
    const vendaInput = row.querySelector('.preco-venda-input');
    
    if (margemInput.value) {
        vendaInput.value = (custoFinal * (1 + parseFloat(margemInput.value) / 100)).toFixed(2);
    } else if (vendaInput.value) {
        if(custoFinal > 0) margemInput.value = (((parseFloat(vendaInput.value) - custoFinal) / custoFinal) * 100).toFixed(2);
    }
}

function renderPurchaseHistory() {
    purchaseHistoryTableBody.innerHTML = '';
    [...state.historicoCompras].reverse().forEach(compra => {
        const row = document.createElement('tr');
        const dataFormatada = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(compra.dataLancamento));
        row.innerHTML = `
            <td>${compra.id}</td><td>${dataFormatada}</td><td>${compra.fornecedorNome}</td>
            <td>${compra.fornecedorCnpj}</td><td>${compra.itens.length}</td>
            <td>R$ ${compra.valorTotalNota.toFixed(2)}</td><td><button onclick="purchaseImport.view(${compra.id})">Visualizar</button></td>`;
        purchaseHistoryTableBody.appendChild(row);
    });
}

export function initPurchaseImport() {
    xmlFileInput.addEventListener('change', processXmlFile);
    cancelPurchaseImportBtn.addEventListener('click', () => showConfirmationModal('Deseja cancelar a importação?', cancelImport));
    
    confirmPurchaseBtn.addEventListener('click', () => {
        let produtosNovos = 0, produtosAtualizados = 0;
        purchaseItemsTableBody.querySelectorAll('tr').forEach(row => {
            const itemData = JSON.parse(row.dataset.itemData);
            const fator = parseFloat(row.querySelector('.fator-conversao-input').value) || 1;
            const qtdFinal = itemData.qtd * fator;
            const custoFinal = fator > 0 ? itemData.precoCusto / fator : 0;
            const precoVenda = parseFloat(row.querySelector('.preco-venda-input').value) || custoFinal;
            const margem = custoFinal > 0 ? (((precoVenda - custoFinal) / custoFinal) * 100).toFixed(2) : '0.00';

            let produto = itemData.ean ? state.produtos.find(p => p.referencia === itemData.ean && p.referencia) : null;
            if (produto) {
                produto.estoque += qtdFinal;
                produto.preco_custo = custoFinal.toFixed(2);
                produto.preco_venda = precoVenda.toFixed(2);
                produto.margem = margem;
                produtosAtualizados++;
            } else {
                state.produtos.push({
                    codigo: state.contadorId, referencia: itemData.ean, nome: itemData.nome,
                    estoque: qtdFinal, preco_custo: custoFinal.toFixed(2),
                    preco_venda: precoVenda.toFixed(2), margem: margem
                });
                state.incrementContadorId();
                produtosNovos++;
            }
        });

        state.historicoCompras.push({
            id: state.contadorCompraId, dataLancamento: new Date(),
            fornecedorNome: compraAtual.fornecedor.razaoSocial, fornecedorCnpj: compraAtual.fornecedor.cnpj,
            valorTotalNota: compraAtual.valorTotalNota, itens: compraAtual.itens
        });
        state.incrementCompraId();
        
        renderPurchaseHistory();
        renderProductsTable();
        renderSuppliers();
        showNotificationModal(`${produtosNovos} produtos novos, ${produtosAtualizados} atualizados.`, 'Importação Concluída');
        cancelImport();
    });

    window.purchaseImport = { view: viewPurchase };
    renderPurchaseHistory();
}