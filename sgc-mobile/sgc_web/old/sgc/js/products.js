// js/products.js
import * as state from './state.js';

const productForm = document.getElementById("productForm");
const productTableBody = document.getElementById("productTableBody");
const contentArea = document.querySelector('.content-area');
const submitBtn = productForm.querySelector("button[type='submit']");
const cancelarBtn = document.getElementById("cancelarEdicao");
let editandoId = null;
let userTyped = { margem: false, venda: false };

const { codigo, referencia, nome, unidadeVenda, descricao, estoque, preco_custo, margem, preco_venda } = productForm;

function calcularPrecoVenda() {
    const custo = parseFloat(preco_custo.value);
    const mrg = parseFloat(margem.value);
    if (!isNaN(custo) && !isNaN(mrg)) {
        preco_venda.value = (custo * (1 + mrg / 100)).toFixed(2);
    }
}

function calcularMargem() {
    const custo = parseFloat(preco_custo.value);
    const venda = parseFloat(preco_venda.value);
    if (!isNaN(custo) && !isNaN(venda) && custo > 0) {
        margem.value = (((venda - custo) / custo) * 100).toFixed(2);
    }
}

function resetProductForm() {
    productForm.reset();
    editandoId = null;
    userTyped = { margem: false, venda: false };
    submitBtn.textContent = "Cadastrar Produto";
    cancelarBtn.style.display = "none";
}

export function renderProductsTable() {
    productTableBody.innerHTML = "";
    state.produtos.forEach(prod => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${prod.codigo}</td><td>${prod.referencia}</td><td>${prod.nome}</td><td>${prod.unidadeVenda || 'N/A'}</td><td>${prod.estoque}</td><td>R$ ${prod.preco_custo}</td><td>${prod.margem}%</td><td>R$ ${prod.preco_venda}</td><td><button onclick="products.edit(${prod.codigo})">Editar</button></td>`;
        productTableBody.appendChild(row);
    });
}

function editProduct(id) {
    const produto = state.produtos.find(p => p.codigo === id);
    if (!produto) return;
    Object.keys(produto).forEach(key => {
        if (productForm.elements[key]) productForm.elements[key].value = produto[key];
    });
    editandoId = id;
    submitBtn.textContent = "Salvar Alterações";
    cancelarBtn.style.display = "inline-block";
    userTyped = { margem: true, venda: false };
    contentArea.scrollTo({ top: 0, behavior: "smooth" });
}

export function initProducts() {
    margem.addEventListener("input", () => { userTyped.margem = true; userTyped.venda = false; calcularPrecoVenda(); });
    preco_venda.addEventListener("input", () => { userTyped.venda = true; userTyped.margem = false; calcularMargem(); });
    preco_custo.addEventListener("input", () => { userTyped.margem ? calcularPrecoVenda() : calcularMargem(); });
    
    productForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const produto = {
            codigo: editandoId ?? state.contadorId,
            referencia: referencia.value, nome: nome.value, unidadeVenda: unidadeVenda.value,
            descricao: descricao.value, estoque: parseFloat(estoque.value || 0),
            preco_custo: parseFloat(preco_custo.value || 0).toFixed(2),
            margem: parseFloat(margem.value || 0).toFixed(2),
            preco_venda: parseFloat(preco_venda.value || 0).toFixed(2),
        };
        if (editandoId !== null) {
            const index = state.produtos.findIndex(p => p.codigo === editandoId);
            state.produtos[index] = produto;
        } else {
            state.produtos.push(produto);
            state.incrementContadorId();
        }
        resetProductForm();
        renderProductsTable();
    });

    cancelarBtn.addEventListener("click", resetProductForm);

    window.products = { edit: editProduct };
    renderProductsTable();
}