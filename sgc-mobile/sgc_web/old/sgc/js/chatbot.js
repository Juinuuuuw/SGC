// js/chatbot.js
const openChatbotBtn = document.getElementById('openChatbot');
const closeChatbotBtn = document.getElementById('closeChatbot');
const chatbotWindow = document.getElementById('chatbot-window');
const chatbotMessages = document.getElementById('chatbotMessages');
const chatbotInput = document.getElementById('chatbotInput');
const chatbotSendBtn = document.getElementById('chatbotSendBtn');

const knowledgeBase = [
    { keywords: ['xml', 'importar', 'nota'], response: 'Para importar uma NF-e, vá em "Compras e Estoque" > "Compras" e clique em "Selecionar XML da NF-e".' },
    { keywords: ['cadastrar produto', 'novo produto'], response: 'Vá em "Compras e Estoque" > "Produtos", preencha o formulário e clique em "Cadastrar Produto".' },
    { keywords: ['vender', 'venda', 'pdv'], response: 'Acesse "Vendas" > "PDV Online" para iniciar uma nova venda.' },
    { keywords: ['estoque', 'ajustar', 'movimentação'], response: 'Use "Compras e Estoque" > "Movimentações" para fazer ajustes manuais de entrada ou saída.' },
    { keywords: ['ajuda', 'socorro', 'oi', 'olá'], response: 'Olá! Sou seu assistente virtual. Como posso ajudar?' }
];

function getBotResponse(userInput) {
    const input = userInput.toLowerCase();
    const entry = knowledgeBase.find(k => k.keywords.some(key => input.includes(key)));
    return entry ? entry.response : 'Desculpe, não entendi. Poderia tentar de outra forma?';
}

function appendMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    messageDiv.textContent = text;
    chatbotMessages.appendChild(messageDiv);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function handleSendMessage() {
    const userInput = chatbotInput.value.trim();
    if (!userInput) return;
    appendMessage(userInput, 'user');
    chatbotInput.value = '';
    setTimeout(() => appendMessage(getBotResponse(userInput), 'bot'), 500);
}

export function initChatbot() {
    openChatbotBtn.addEventListener('click', () => {
        chatbotWindow.classList.toggle('visible');
        if (chatbotWindow.classList.contains('visible') && chatbotMessages.children.length === 0) {
            setTimeout(() => appendMessage('Olá! Como posso te ajudar hoje?', 'bot'), 300);
        }
    });
    closeChatbotBtn.addEventListener('click', () => chatbotWindow.classList.remove('visible'));
    chatbotSendBtn.addEventListener('click', handleSendMessage);
    chatbotInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSendMessage(); });
}