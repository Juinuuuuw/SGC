// js/sync.js — Motor de Sincronização Offline-First do SGC
// Responsabilidades:
//   1. Detectar se está online/offline (com heartbeat real)
//   2. Baixar produtos/fornecedores e salvar no IndexedDB quando online
//   3. Enviar fila de operações pendentes quando a rede volta
//   4. Atualizar a UI de status (badge, notificações)

import { sgcDB } from './db.js';

// ── Configuração ──────────────────────────────────────────────
const HEARTBEAT_URL      = 'api/sessao.php';
const HEARTBEAT_INTERVAL = 30_000;  // 30s
const SYNC_ENDPOINT      = 'api/sincronizar.php';
const PRODUTOS_ENDPOINT  = 'api/produtos.php';
const SEED_INTERVAL_MS   = 5 * 60 * 1000; // Reseed a cada 5 min se online

class SGCSyncManager {
  constructor() {
    this._online        = navigator.onLine;
    this._sincronizando = false;
    this._heartbeatTimer= null;
    this._seedTimer     = null;
    this._listeners     = {};

    this._bindEvents();
    this._iniciarHeartbeat();

    // Inicializa o banco e faz o seed inicial
    sgcDB.abrir().then(() => {
      if (this._online) {
        this._seedDados();
        this._processarFila();
      }
      this._atualizarUI();
    });
  }

  // ════════════════════════════════════════════════════════════
  //  EVENTOS
  // ════════════════════════════════════════════════════════════
  _bindEvents() {
    window.addEventListener('online',  () => this._handleOnline());
    window.addEventListener('offline', () => this._handleOffline());

    // O Service Worker pode nos notificar de um sync
    navigator.serviceWorker?.addEventListener('message', (e) => {
      if (e.data?.type === 'SYNC_NOW') this._processarFila();
    });
  }

  _handleOnline() {
    console.log('[Sync] 🟢 Conexão restabelecida');
    this._online = true;
    this._atualizarUI();
    this._seedDados();
    this._processarFila();
    this.emit('online');
  }

  _handleOffline() {
    console.log('[Sync] 🔴 Conexão perdida — modo offline ativo');
    this._online = false;
    this._atualizarUI();
    this.emit('offline');
  }

  // ════════════════════════════════════════════════════════════
  //  HEARTBEAT (verifica conectividade real, não só navigator.onLine)
  // ════════════════════════════════════════════════════════════
  _iniciarHeartbeat() {
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = setInterval(() => this._ping(), HEARTBEAT_INTERVAL);
  }

  async _ping() {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 4000);
      await fetch(HEARTBEAT_URL, { method: 'HEAD', signal: ctrl.signal });

      if (!this._online) this._handleOnline(); // voltou!
    } catch {
      if (this._online) this._handleOffline(); // caiu!
    }
  }

  // ════════════════════════════════════════════════════════════
  //  SEED — baixa dados do servidor e salva no IndexedDB
  // ════════════════════════════════════════════════════════════
  async _seedDados() {
    if (!this._online) return;
    try {
      const ultimoSeed = await sgcDB.getMeta('ultimo_seed');
      const agora      = Date.now();
      if (ultimoSeed && (agora - parseInt(ultimoSeed)) < SEED_INTERVAL_MS) return;

      console.log('[Sync] 🔄 Baixando produtos para cache local...');
      const res  = await fetch(PRODUTOS_ENDPOINT);
      if (!res.ok) return;
      const lista = await res.json();

      if (Array.isArray(lista) && lista.length > 0) {
        await sgcDB.salvarProdutos(lista);
        await sgcDB.setMeta('ultimo_seed',      String(agora));
        await sgcDB.setMeta('total_produtos',   String(lista.length));
        console.log(`[Sync] ✅ ${lista.length} produtos salvos no cache`);
        this.emit('produtos-atualizados', lista);
      }
    } catch (e) {
      console.warn('[Sync] Falha no seed de dados:', e.message);
    }
  }

  /** Força um novo seed imediato (chamado por botão "Sincronizar Agora") */
  async seedForçado() {
    await sgcDB.setMeta('ultimo_seed', '0');
    await this._seedDados();
  }

  // ════════════════════════════════════════════════════════════
  //  PROCESSAR FILA — envia pendentes para o servidor
  // ════════════════════════════════════════════════════════════
  async _processarFila() {
    if (!this._online || this._sincronizando) return;
    this._sincronizando = true;

    try {
      const vendas       = await sgcDB.listarVendasPendentes();
      const movimentacoes= await sgcDB.listarMovimentacoesPendentes();

      if (vendas.length === 0 && movimentacoes.length === 0) {
        this._sincronizando = false;
        return;
      }

      console.log(`[Sync] Enviando ${vendas.length} venda(s) e ${movimentacoes.length} movimentação(ões)...`);
      this._atualizarUI('sincronizando');
      this.emit('sync-inicio', { vendas: vendas.length, movimentacoes: movimentacoes.length });

      const payload = {
        vendas:        vendas.map(v => ({ id_local: v.id_local, ...v })),
        movimentacoes: movimentacoes.map(m => ({ id_local: m.id_local, ...m })),
      };

      const res  = await fetch(SYNC_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resultado = await res.json();

      // Processa resultados de vendas
      for (const r of (resultado.vendas || [])) {
        if (r.success) {
          await sgcDB.atualizarStatusVenda(r.id_local, 'sincronizado');
        } else {
          await sgcDB.atualizarStatusVenda(r.id_local, 'erro', r.message);
          console.warn(`[Sync] Venda ${r.id_local} com erro: ${r.message}`);
        }
      }

      // Processa resultados de movimentações
      for (const r of (resultado.movimentacoes || [])) {
        if (r.success) {
          await sgcDB.atualizarStatusMovimentacao(r.id_local, 'sincronizado');
        } else {
          await sgcDB.atualizarStatusMovimentacao(r.id_local, 'erro', r.message);
        }
      }

      // Alertas de furo de estoque
      const furos = (resultado.vendas || []).filter(r => r.furo_estoque);
      if (furos.length > 0) {
        this.emit('furo-estoque', furos);
        this._alertarFuroEstoque(furos);
      }

      const pendentesRestantes = await sgcDB.contarPendentes();
      this.emit('sync-fim', { resultado, pendentesRestantes });

      // Atualiza seed após sincronização
      await this._seedDados();

      console.log('[Sync] ✅ Sincronização concluída');
    } catch (e) {
      console.error('[Sync] Falha ao processar fila:', e.message);
      this.emit('sync-erro', e.message);
    } finally {
      this._sincronizando = false;
      this._atualizarUI();
    }
  }

  // ════════════════════════════════════════════════════════════
  //  PDV OFFLINE — adiciona venda à fila
  // ════════════════════════════════════════════════════════════
  /**
   * Registra uma venda.
   * Se estiver online, tenta enviar direto; se offline, enfileira.
   * Sempre desconta o estoque local.
   */
  async registrarVenda(dadosVenda) {
    // Desconta estoque local para manter consistência visual
    for (const item of dadosVenda.itens) {
      await sgcDB.descontarEstoqueLocal(item.id_produto, item.quantidade);
    }

    if (this._online) {
      try {
        const res = await fetch('api/vendas.php', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(dadosVenda),
        });
        const data = await res.json();
        if (data.success) return { success: true, online: true, id_venda: data.id_venda };
        // Servidor recusou: enfileira mesmo assim
        console.warn('[Sync] Servidor recusou a venda, enfileirando:', data.message);
      } catch {
        // Rede caiu durante a requisição
      }
    }

    // Offline ou falha: enfileira
    const id_local = await sgcDB.adicionarVendaPendente(dadosVenda);
    this._atualizarUI();
    return { success: true, online: false, id_local, pendente: true };
  }

  /**
   * Registra uma movimentação de estoque.
   * Se offline, enfileira.
   */
  async registrarMovimentacao(dadosMov) {
    if (this._online) {
      try {
        const res  = await fetch('api/movimentacoes.php', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(dadosMov),
        });
        const data = await res.json();
        if (data.success) return { success: true, online: true };
      } catch {}
    }

    await sgcDB.adicionarMovimentacaoPendente(dadosMov);
    this._atualizarUI();
    return { success: true, online: false, pendente: true };
  }

  // ════════════════════════════════════════════════════════════
  //  UI — atualiza os indicadores visuais
  // ════════════════════════════════════════════════════════════
  async _atualizarUI(modo) {
    const badge     = document.getElementById('sync-status-badge');
    const contador  = document.getElementById('sync-pendentes-count');
    const btnSync   = document.getElementById('btn-sync-agora');

    if (!badge) return;

    if (modo === 'sincronizando') {
      badge.className = 'sync-badge sync-badge--sincronizando';
      badge.textContent = '⟳ Sincronizando...';
      return;
    }

    const pendentes = await sgcDB.contarPendentes().catch(() => 0);

    if (!this._online) {
      badge.className = 'sync-badge sync-badge--offline';
      badge.textContent = '● Offline';
    } else if (pendentes > 0) {
      badge.className = 'sync-badge sync-badge--pendente';
      badge.textContent = `↑ ${pendentes} pendente${pendentes !== 1 ? 's' : ''}`;
    } else {
      badge.className = 'sync-badge sync-badge--online';
      badge.textContent = '● Online';
    }

    if (contador) contador.textContent = pendentes > 0 ? pendentes : '';
    if (btnSync)  btnSync.style.display = pendentes > 0 ? 'flex' : 'none';
  }

  _alertarFuroEstoque(furos) {
    // Usa o modal de notificação do sistema se existir
    const el = document.getElementById('notificationModal');
    if (el) {
      document.getElementById('notificationTitle').textContent = '⚠️ Furo de Estoque Detectado';
      document.getElementById('notificationMessage').textContent =
        `${furos.length} venda(s) sincronizada(s) com itens além do estoque disponível. ` +
        'Revise o relatório de movimentações.';
      el.style.display = 'flex';
    }
  }

  // ════════════════════════════════════════════════════════════
  //  GETTERS PÚBLICOS
  // ════════════════════════════════════════════════════════════
  get online() { return this._online; }

  // ════════════════════════════════════════════════════════════
  //  SISTEMA DE EVENTOS SIMPLES
  // ════════════════════════════════════════════════════════════
  on(evento, fn)  { (this._listeners[evento] = this._listeners[evento] || []).push(fn); }
  off(evento, fn) { this._listeners[evento] = (this._listeners[evento] || []).filter(f => f !== fn); }
  emit(evento, dados) {
    (this._listeners[evento] || []).forEach(fn => { try { fn(dados); } catch {} });
  }
}

// ── Instância singleton ────────────────────────────────────────
export const sgcSync = new SGCSyncManager();

// ── Expõe globalmente para scripts não-module ─────────────────
window.sgcSync = sgcSync;
