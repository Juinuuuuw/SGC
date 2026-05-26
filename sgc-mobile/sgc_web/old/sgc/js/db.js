// js/db.js — Camada de abstração do IndexedDB para o SGC Offline
// Uso:  import { sgcDB } from './db.js';
//       await sgcDB.abrir();
//       await sgcDB.salvarProdutos(lista);

const DB_NAME    = 'sgc_offline_db';
const DB_VERSION = 1;

// ── Definição dos Object Stores ───────────────────────────────
const STORES = {
  PRODUTOS:               'produtos',
  FORNECEDORES:           'fornecedores',
  VENDAS_PENDENTES:       'vendas_pendentes',
  MOVIMENTACOES_PENDENTES:'movimentacoes_pendentes',
  COMPRAS_PENDENTES:      'compras_pendentes',
  META:                   'meta',          // chave-valor genérico
};

class SGCDatabase {
  constructor() {
    this._db = null;
  }

  // ── Abre / cria o banco ───────────────────────────────────────
  abrir() {
    if (this._db) return Promise.resolve(this._db);

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Produtos
        if (!db.objectStoreNames.contains(STORES.PRODUTOS)) {
          const s = db.createObjectStore(STORES.PRODUTOS, { keyPath: 'id' });
          s.createIndex('referencia', 'referencia', { unique: false });
          s.createIndex('nome',       'nome',       { unique: false });
        }

        // Fornecedores
        if (!db.objectStoreNames.contains(STORES.FORNECEDORES)) {
          db.createObjectStore(STORES.FORNECEDORES, { keyPath: 'id' });
        }

        // Vendas pendentes
        if (!db.objectStoreNames.contains(STORES.VENDAS_PENDENTES)) {
          const s = db.createObjectStore(STORES.VENDAS_PENDENTES, {
            keyPath: 'id_local', autoIncrement: true,
          });
          s.createIndex('status', 'status', { unique: false });
        }

        // Movimentações pendentes
        if (!db.objectStoreNames.contains(STORES.MOVIMENTACOES_PENDENTES)) {
          const s = db.createObjectStore(STORES.MOVIMENTACOES_PENDENTES, {
            keyPath: 'id_local', autoIncrement: true,
          });
          s.createIndex('status', 'status', { unique: false });
        }

        // Compras pendentes
        if (!db.objectStoreNames.contains(STORES.COMPRAS_PENDENTES)) {
          db.createObjectStore(STORES.COMPRAS_PENDENTES, {
            keyPath: 'id_local', autoIncrement: true,
          });
        }

        // Meta
        if (!db.objectStoreNames.contains(STORES.META)) {
          db.createObjectStore(STORES.META, { keyPath: 'chave' });
        }
      };

      req.onsuccess  = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror    = (e) => reject(e.target.error);
    });
  }

  // ── Helper de transação ───────────────────────────────────────
  _tx(store, modo = 'readonly') {
    return this._db.transaction(store, modo).objectStore(store);
  }

  _promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ════════════════════════════════════════════════════════════
  //  PRODUTOS
  // ════════════════════════════════════════════════════════════

  /** Salva lista completa (substitui tudo — usado na sincronização inicial) */
  async salvarProdutos(lista) {
    await this.abrir();
    const tx = this._db.transaction(STORES.PRODUTOS, 'readwrite');
    const store = tx.objectStore(STORES.PRODUTOS);

    // Limpa e reinsere
    await this._promisify(store.clear());
    for (const p of lista) {
      store.put({ ...p, id: parseInt(p.id) });
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror    = (e) => reject(e.target.error);
    });
  }

  /** Retorna todos os produtos */
  async getProdutos() {
    await this.abrir();
    return this._promisify(this._tx(STORES.PRODUTOS).getAll());
  }

  /** Busca produto por ID */
  async getProdutoPorId(id) {
    await this.abrir();
    return this._promisify(this._tx(STORES.PRODUTOS).get(parseInt(id)));
  }

  /** Busca produto por referência (código de barras / EAN) */
  async getProdutoPorReferencia(ref) {
    await this.abrir();
    const idx = this._tx(STORES.PRODUTOS).index('referencia');
    return this._promisify(idx.get(ref));
  }

  /** Busca produtos por termo (nome parcial ou referência) */
  async buscarProdutos(termo) {
    await this.abrir();
    const todos = await this.getProdutos();
    const t = termo.toLowerCase().trim();
    return todos.filter(p =>
      p.nome?.toLowerCase().includes(t) ||
      p.referencia?.toLowerCase().includes(t) ||
      String(p.id).includes(t)
    ).slice(0, 20);
  }

  /**
   * Desconta o estoque local (para uso offline no PDV).
   * Não substitui o servidor — apenas ajusta a cópia local temporariamente.
   */
  async descontarEstoqueLocal(id, quantidade) {
    await this.abrir();
    const tx    = this._db.transaction(STORES.PRODUTOS, 'readwrite');
    const store = tx.objectStore(STORES.PRODUTOS);
    const prod  = await this._promisify(store.get(parseInt(id)));
    if (prod) {
      prod.estoque = Math.max(0, (parseFloat(prod.estoque) || 0) - quantidade);
      store.put(prod);
    }
    return new Promise((r, rj) => { tx.oncomplete = r; tx.onerror = e => rj(e.target.error); });
  }

  // ════════════════════════════════════════════════════════════
  //  VENDAS PENDENTES
  // ════════════════════════════════════════════════════════════

  /**
   * Enfileira uma venda feita offline.
   * Retorna o id_local gerado.
   */
  async adicionarVendaPendente(venda) {
    await this.abrir();
    const registro = {
      ...venda,
      status:     'pendente',     // pendente | sincronizado | erro
      criado_em:  new Date().toISOString(),
      erro_msg:   null,
    };
    const id = await this._promisify(
      this._tx(STORES.VENDAS_PENDENTES, 'readwrite').add(registro)
    );
    return id;
  }

  /** Lista todas as vendas com status 'pendente' */
  async listarVendasPendentes() {
    await this.abrir();
    const idx = this._db
      .transaction(STORES.VENDAS_PENDENTES, 'readonly')
      .objectStore(STORES.VENDAS_PENDENTES)
      .index('status');
    return this._promisify(idx.getAll('pendente'));
  }

  /** Lista todas as vendas (para histórico offline) */
  async listarTodasVendas() {
    await this.abrir();
    const todas = await this._promisify(this._tx(STORES.VENDAS_PENDENTES).getAll());
    return [...todas].reverse(); // mais recentes primeiro
  }

  /** Marca uma venda como sincronizada (ou com erro) */
  async atualizarStatusVenda(id_local, status, erro_msg = null) {
    await this.abrir();
    const tx    = this._db.transaction(STORES.VENDAS_PENDENTES, 'readwrite');
    const store = tx.objectStore(STORES.VENDAS_PENDENTES);
    const reg   = await this._promisify(store.get(id_local));
    if (reg) {
      reg.status   = status;
      reg.erro_msg = erro_msg;
      reg.sync_em  = new Date().toISOString();
      store.put(reg);
    }
    return new Promise((r, rj) => { tx.oncomplete = r; tx.onerror = e => rj(e.target.error); });
  }

  /** Contagem de vendas pendentes */
  async contarPendentes() {
    await this.abrir();
    const idx = this._db
      .transaction(STORES.VENDAS_PENDENTES, 'readonly')
      .objectStore(STORES.VENDAS_PENDENTES)
      .index('status');
    return this._promisify(idx.count('pendente'));
  }

  // ════════════════════════════════════════════════════════════
  //  MOVIMENTAÇÕES PENDENTES
  // ════════════════════════════════════════════════════════════

  async adicionarMovimentacaoPendente(mov) {
    await this.abrir();
    const reg = { ...mov, status: 'pendente', criado_em: new Date().toISOString() };
    return this._promisify(
      this._tx(STORES.MOVIMENTACOES_PENDENTES, 'readwrite').add(reg)
    );
  }

  async listarMovimentacoesPendentes() {
    await this.abrir();
    const idx = this._db
      .transaction(STORES.MOVIMENTACOES_PENDENTES, 'readonly')
      .objectStore(STORES.MOVIMENTACOES_PENDENTES)
      .index('status');
    return this._promisify(idx.getAll('pendente'));
  }

  async atualizarStatusMovimentacao(id_local, status, erro_msg = null) {
    await this.abrir();
    const tx    = this._db.transaction(STORES.MOVIMENTACOES_PENDENTES, 'readwrite');
    const store = tx.objectStore(STORES.MOVIMENTACOES_PENDENTES);
    const reg   = await this._promisify(store.get(id_local));
    if (reg) {
      reg.status   = status;
      reg.erro_msg = erro_msg;
      reg.sync_em  = new Date().toISOString();
      store.put(reg);
    }
    return new Promise((r, rj) => { tx.oncomplete = r; tx.onerror = e => rj(e.target.error); });
  }

  // ════════════════════════════════════════════════════════════
  //  META (chave-valor genérico)
  // ════════════════════════════════════════════════════════════

  async getMeta(chave) {
    await this.abrir();
    const reg = await this._promisify(this._tx(STORES.META).get(chave));
    return reg ? reg.valor : null;
  }

  async setMeta(chave, valor) {
    await this.abrir();
    return this._promisify(
      this._tx(STORES.META, 'readwrite').put({ chave, valor })
    );
  }
}

// ── Instância singleton ────────────────────────────────────────
export const sgcDB = new SGCDatabase();

// ── Expõe globalmente para scripts não-module ─────────────────
window.sgcDB = sgcDB;
