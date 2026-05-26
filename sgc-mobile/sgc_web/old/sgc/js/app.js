// js/app.js

// Importa os inicializadores de cada módulo
import { initUI } from './ui.js';
import { initModals } from './modals.js';
import { initSuppliers } from './suppliers.js';
import { initProducts } from './products.js';
import { initPdv } from './pdv.js';
import { initPurchaseImport } from './purchaseImport.js';
import { initStockMovements } from './stockMovements.js';
import { initLabels } from './labels.js';
import { initFinance } from './finance.js';
import { initChatbot } from './chatbot.js';

// Aguarda o carregamento completo do DOM para iniciar a aplicação
document.addEventListener("DOMContentLoaded", () => {
    // A ordem de inicialização pode ser importante.
    // Módulos de UI e Modais primeiro, depois os de dados.
    initModals();
    initUI();
    initSuppliers();
    initProducts();
    initPdv();
    initPurchaseImport();
    initStockMovements();
    initLabels();
    initFinance();
    initChatbot();

    console.log("SGC - Sistema de Gestão Comercial inicializado com sucesso!");
});