// js/modals.js

let confirmCallback = null;

// --- Seletores de Elementos ---
const notificationModal = document.getElementById('notificationModal');
const notificationTitle = document.getElementById('notificationTitle');
const notificationMessage = document.getElementById('notificationMessage');
const notificationCloseBtn = document.getElementById('notificationCloseBtn');
const purchaseDetailModal = document.getElementById('purchaseDetailModal');
const movementDetailModal = document.getElementById('movementDetailModal');
const productSelectionModal = document.getElementById('productSelectionModal');
const confirmationModal = document.getElementById('confirmationModal');
const confirmationMessage = document.getElementById('confirmationMessage');
const confirmActionBtn = document.getElementById('confirmActionBtn');
const cancelActionBtn = document.getElementById('cancelActionBtn');

// --- Funções Exportadas ---
export function showNotificationModal(message, title = 'Aviso') {
  notificationTitle.textContent = title;
  notificationMessage.textContent = message;
  notificationModal.style.display = 'flex';
}

export function showConfirmationModal(message, onConfirm) {
    confirmationMessage.textContent = message;
    confirmCallback = onConfirm;
    confirmationModal.style.display = 'flex';
}

export function hideProductSelectionModal() {
     productSelectionModal.style.display = 'none';
}

// --- Funções Internas ---
function hideNotificationModal() {
  notificationModal.style.display = 'none';
}

function hideConfirmationModal() {
    confirmationModal.style.display = 'none';
    confirmCallback = null;
}

// --- Inicializador do Módulo ---
export function initModals() {
    notificationCloseBtn.addEventListener('click', hideNotificationModal);

    confirmActionBtn.addEventListener('click', () => {
        if (typeof confirmCallback === 'function') {
            confirmCallback();
        }
        hideConfirmationModal();
    });

    cancelActionBtn.addEventListener('click', hideConfirmationModal);

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            purchaseDetailModal.style.display = 'none';
            movementDetailModal.style.display = 'none';
            productSelectionModal.style.display = 'none';
            confirmationModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        const modals = [purchaseDetailModal, notificationModal, movementDetailModal, productSelectionModal, confirmationModal];
        if (modals.includes(event.target)) {
            modals.forEach(modal => modal.style.display = 'none');
            hideConfirmationModal();
        }
    });
}