# SGC Mobile 📱

Aplicativo mobile do **SGC (Sistema de Gestão Comercial)** desenvolvido em **React Native + Expo**.

---

## 📋 Módulos

### 🏪 PDV Mobile (Ponto de Venda)
- Leitura de código de barras via câmera
- Busca de produto por nome ou referência
- Carrinho com controle de quantidade (toque nos botões ou edite diretamente)
- Suporte ao formato `2*COD` (adiciona 2 unidades de uma vez)
- 4 formas de pagamento: Dinheiro, Débito, Crédito, Pix
- Cálculo de troco automático
- Desconto por venda
- Integração com abertura/fechamento de caixa
- Baixa automática de estoque no banco de dados

### 📦 Conferência de Mercadorias
- **Importação de XML NF-e** — carrega automaticamente fornecedor, itens, quantidades e preços
- **Entrada manual** — adiciona itens manualmente
- Leitura de código de barras para confirmar itens recebidos
- Controle de status por item: ✅ OK / ⚠️ Divergência / ⏳ Pendente
- Barra de progresso da conferência
- Resumo com listagem de divergências
- Edição de campos diretamente na lista (nome, qtd nota, qtd conferida, preço)
- Salvamento no banco de dados (tabela `compras` + `itens_compra`)

---

## 🚀 Como instalar e rodar

### Pré-requisitos
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go no celular (Android/iOS) ou emulador

### Instalação
```bash
cd sgc-mobile
npm install
npx expo start
```

Leia o QR Code com o Expo Go.

---

## ⚙️ Configuração do servidor

Na tela de **Login**, toque em **"Configurar servidor"** e informe a URL da API:

```
http://IP_DO_SERVIDOR/sgc/api
```

Exemplo: `http://192.168.1.100/sgc/api`

> O celular e o servidor precisam estar na mesma rede local, ou o servidor deve ter IP/domínio acessível externamente.

---

## 🗂️ Estrutura do projeto

```
sgc-mobile/
├── App.js                          # Entry point
├── app.json                        # Config Expo
├── babel.config.js
├── package.json
│
├── backend_api/                    # ⬅️ Copie esses arquivos para /api/ no servidor
│   ├── caixa.php                   # Abertura/fechamento de caixa
│   ├── vendas.php                  # Registro de vendas do PDV
│   └── produtos_patch.php          # Patch: busca por barcode e search
│
└── src/
    ├── context/
    │   ├── AuthContext.js           # Autenticação global
    │   └── CartContext.js           # Estado do carrinho PDV
    ├── navigation/
    │   └── AppNavigator.js          # Bottom tabs + Stack navigation
    ├── screens/
    │   ├── LoginScreen.js           # Tela de login + config servidor
    │   ├── HomeScreen.js            # Dashboard com atalhos
    │   ├── PDVScreen.js             # PDV completo
    │   └── ConferenciaScreen.js     # Conferência de mercadorias
    ├── components/
    │   ├── ui.js                    # Button, Card, Input, Badge, EmptyState
    │   └── BarcodeScanner.js        # Modal com câmera + animação de scan
    ├── services/
    │   └── api.js                   # Axios + todas as chamadas à API
    └── utils/
        └── theme.js                 # Cores, espaçamentos, sombras
```

---

## 🔌 APIs necessárias no servidor

O app consume os seguintes endpoints do SGC:

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/login.php` | POST | Autenticação |
| `/logout.php` | POST | Logout |
| `/produtos.php` | GET | Lista produtos (suporte a `?search=` e `?barcode=`) |
| `/caixa.php` | GET/POST | Gerencia caixa PDV *(novo)* |
| `/vendas.php` | GET/POST | Registra vendas *(novo)* |
| `/compras.php` | GET/POST | Conferência/compras |
| `/fornecedores.php` | GET | Lista fornecedores |

### Instalando os novos arquivos
Copie os arquivos da pasta `backend_api/` para a pasta `api/` do seu servidor SGC:
```bash
cp backend_api/caixa.php   /caminho/sgc/api/caixa.php
cp backend_api/vendas.php  /caminho/sgc/api/vendas.php
```

E integre o conteúdo de `produtos_patch.php` no início do `case 'GET'` do `api/produtos.php` existente.

---

## 📱 Fluxo de uso

### PDV
1. Abrir caixa → informar saldo inicial
2. Ler código de barras (câmera ou digitando)
3. Conferir itens no carrinho
4. Tocar em "Finalizar venda"
5. Selecionar forma de pagamento
6. Confirmar → estoque baixado automaticamente

### Conferência
1. Escolher "Importar XML" ou "Entrada manual"
2. Selecionar arquivo NF-e XML
3. Bater cada item físico com a câmera ou digitando o código
4. Verificar divergências no resumo
5. Salvar conferência

---

## 🛠️ Tecnologias

- **React Native 0.74** + **Expo 51**
- **expo-camera** — leitura de código de barras
- **expo-document-picker** — seleção de XML
- **fast-xml-parser** — parse de NF-e
- **@react-navigation** — navegação
- **axios** — chamadas HTTP
- **AsyncStorage** — persistência local (sessão, URL servidor)

---

## 🔒 Segurança

- Sessão PHP preservada (cookie) via `withCredentials: true`
- URL do servidor salva localmente no dispositivo
- Token de sessão não exposto

---

## 📞 Suporte

Dúvidas? Abra uma issue ou consulte o README do SGC principal.
