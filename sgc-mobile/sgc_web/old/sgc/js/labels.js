// js/labels.js
import * as state from './state.js';
import { showNotificationModal } from './modals.js';

const labelProductSearch = document.getElementById('labelProductSearch');
const labelSearchResults = document.getElementById('labelSearchResults');
const labelQueue = document.getElementById('labelQueue');
const generateLabelsBtn = document.getElementById('generateLabelsBtn');
const printLabelsBtn = document.getElementById('printLabelsBtn');
const printPreviewArea = document.getElementById('print-preview-area');

function renderEtiquetasQueue() {
    labelQueue.innerHTML = '';
    if (state.etiquetasParaImprimir.length === 0) {
        labelQueue.innerHTML = '<li class="empty">Nenhum produto selecionado.</li>';
        return;
    }
    state.etiquetasParaImprimir.forEach(produto => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${produto.nome}</span><button onclick="labels.remove(${produto.codigo})">&times;</button>`;
        labelQueue.appendChild(li);
    });
}

function removerProdutoDaFila(produtoId) {
    state.setEtiquetasParaImprimir(state.etiquetasParaImprimir.filter(p => p.codigo !== produtoId));
    renderEtiquetasQueue();
}

export function initLabels() {
    labelProductSearch.addEventListener('input', () => {
        const searchTerm = labelProductSearch.value.toLowerCase();
        labelSearchResults.innerHTML = '';
        if (searchTerm.length < 2) { labelSearchResults.style.display = 'none'; return; }
        
        const resultados = state.produtos.filter(p => p.nome.toLowerCase().includes(searchTerm) || String(p.codigo).includes(searchTerm));
        if (resultados.length > 0) {
            labelSearchResults.style.display = 'block';
            resultados.forEach(p => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "search-result-item";
                itemDiv.innerHTML = `${p.nome} <span>Ref: ${p.referencia || 'N/A'} | R$ ${p.preco_venda}</span>`;
                itemDiv.onclick = () => {
                    if (!state.etiquetasParaImprimir.find(prod => prod.codigo === p.codigo)) {
                        state.etiquetasParaImprimir.push(p);
                        renderEtiquetasQueue();
                    }
                    labelProductSearch.value = '';
                    labelSearchResults.style.display = 'none';
                    labelProductSearch.focus();
                };
                labelSearchResults.appendChild(itemDiv);
            });
        }
    });

    generateLabelsBtn.addEventListener('click', () => {
        printPreviewArea.innerHTML = '';
        if (state.etiquetasParaImprimir.length === 0) { showNotificationModal('Adicione produtos à fila.', 'Aviso'); return; }
        state.etiquetasParaImprimir.forEach(produto => {
            const [inteiro, centavos] = parseFloat(produto.preco_venda).toFixed(2).split('.');
            const etiquetaDiv = document.createElement('div');
            etiquetaDiv.className = 'price-tag';
            etiquetaDiv.innerHTML = `
                <div class="product-name">${produto.nome}</div>
                <div class="bottom-row">
                    <div class="barcode-area">
                        <div class="barcode-simulation"></div>
                        <div class="product-ref">${produto.referencia || produto.codigo}</div>
                    </div>
                    <div class="price-area">
                        <span class="price-currency">R$</span>
                        <span class="price-value">${inteiro},<small>${centavos}</small></span>
                    </div>
                </div>`;
            printPreviewArea.appendChild(etiquetaDiv);
        });
    });

    printLabelsBtn.addEventListener('click', () => {
        if (printPreviewArea.innerHTML.trim() === '') { showNotificationModal('Gere as etiquetas antes de imprimir.', 'Aviso'); return; }
        window.print();
    });

    window.labels = { remove: removerProdutoDaFila };
}