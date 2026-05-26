// js/sgc_empresa.js  (v2 — com Dados da Empresa e Segmento)
(function () {
  'use strict';

  function notify(msg, titulo) {
    document.getElementById('notificationTitle').textContent = titulo || 'Aviso';
    document.getElementById('notificationMessage').textContent = msg;
    document.getElementById('notificationModal').style.display = 'flex';
  }

  window.SGC = window.SGC || {};
  window.SGC.segmento = 'varejista';

  // ════════════════════════════════════════════════════════════
  //  DADOS DA EMPRESA
  // ════════════════════════════════════════════════════════════
  async function carregarEmpresa() {
    try {
      const res = await fetch('api/empresa.php').then(r => r.json());
      if (!res.success) return;
      const e = res.empresa;
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
      set('empresa-razao-social',  e.razao_social);
      set('empresa-nome-fantasia', e.nome_fantasia);
      set('empresa-cnpj',          e.cnpj_cpf);
      set('empresa-email',         e.email);
      set('empresa-telefone',      e.telefone);
      set('empresa-cep',           e.cep);
      set('empresa-logradouro',    e.logradouro);
      set('empresa-numero',        e.numero);
      set('empresa-bairro',        e.bairro);
      set('empresa-cidade',        e.cidade);
      set('empresa-uf',            e.uf);
      const segSel = document.getElementById('empresa-segmento');
      if (segSel) segSel.value = e.segmento || 'varejista';
      window.SGC.segmento = e.segmento || 'varejista';
      aplicarSegmento(window.SGC.segmento);
      atualizarDescSegmento(window.SGC.segmento);
    } catch (er) { notify('Erro ao carregar dados da empresa.', 'Erro'); }
  }

  function aplicarSegmento(seg) {
    const varejo = document.getElementById('pdv-varejo-view');
    const rest   = document.getElementById('pdv-restaurante-view');
    const bar    = document.getElementById('pdv-mode-bar');
    if (!varejo || !rest) return;
    if (seg === 'restaurante') {
      rest.classList.add('active');   varejo.classList.remove('active');
      if (bar) bar.style.display = 'flex';
    } else {
      varejo.classList.add('active'); rest.classList.remove('active');
      if (bar) bar.style.display = 'none';
    }
  }

  function atualizarDescSegmento(seg) {
    const el = document.getElementById('segmento-descricao');
    if (!el) return;
    el.innerHTML = seg === 'restaurante'
      ? '🍽️ <strong>Restaurante</strong> — Mesas como tela principal. PDV Avulso disponível para pedidos sem mesa.'
      : '🏪 <strong>Varejista</strong> — PDV padrão com leitura de código de barras e carrinho de compras.';
  }

  async function salvarEmpresa(e) {
    e.preventDefault();
    const f = document.getElementById('companyDataForm');
    const data = {
      razao_social:  f.elements['empresa-razao-social'].value,
      nome_fantasia: f.elements['empresa-nome-fantasia'].value,
      cnpj_cpf:      f.elements['empresa-cnpj'].value,
      email:         f.elements['empresa-email'].value,
      telefone:      f.elements['empresa-telefone'].value,
      cep:           f.elements['empresa-cep'].value,
      logradouro:    f.elements['empresa-logradouro'].value,
      numero:        f.elements['empresa-numero'].value,
      bairro:        f.elements['empresa-bairro'].value,
      cidade:        f.elements['empresa-cidade'].value,
      uf:            f.elements['empresa-uf'].value,
      segmento:      f.elements['empresa-segmento'].value,
    };
    try {
      const res = await fetch('api/empresa.php', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      }).then(r => r.json());
      notify(res.message, res.success ? 'Sucesso' : 'Erro');
      if (res.success) {
        window.SGC.segmento = res.segmento;
        aplicarSegmento(res.segmento);
        atualizarDescSegmento(res.segmento);
      }
    } catch (er) { notify('Erro de conexão.', 'Erro'); }
  }

  // ════════════════════════════════════════════════════════════
  //  USUÁRIOS
  // ════════════════════════════════════════════════════════════
  let todosOsPerfis = [], todosOsModulos = [];
  let editandoUserId = null, editandoPerfilId = null;

  async function carregarUsuarios() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    const data = await fetch('api/usuarios.php').then(r => r.json()).catch(() => []);
    tbody.innerHTML = '';
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa">Nenhum usuário encontrado.</td></tr>'; return; }
    data.forEach(u => {
      tbody.innerHTML += `<tr class="${u.ativo==0?'row-inactive':''}">
        <td>${u.id}</td><td>${u.nome}</td><td>${u.email}</td><td>${u.perfil_nome}</td>
        <td><span class="badge-status badge-${u.ativo==1?'ativo':'inativo'}">${u.ativo==1?'Ativo':'Inativo'}</span></td>
        <td>
          <button onclick="sgcEmpresa.editarUsuario(${u.id})">Editar</button>
          ${u.ativo==1
            ? `<button class="delete-btn" onclick="sgcEmpresa.desativarUsuario(${u.id})">Desativar</button>`
            : `<button onclick="sgcEmpresa.reativarUsuario(${u.id})">Reativar</button>`}
        </td></tr>`;
    });
  }

  async function salvarUsuario(e) {
    e.preventDefault();
    const f = document.getElementById('userForm');
    const d = { nome: f.elements['userName'].value, email: f.elements['userEmail'].value, senha: f.elements['userPassword'].value, id_perfil: f.elements['userPerfil'].value };
    const url = editandoUserId ? `api/usuarios.php?id=${editandoUserId}` : 'api/usuarios.php';
    const res = await fetch(url, { method: editandoUserId?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r=>r.json()).catch(()=>({success:false,message:'Erro de conexão.'}));
    notify(res.message, res.success?'Sucesso':'Erro');
    if (res.success) { editandoUserId=null; resetUserForm(); carregarUsuarios(); }
  }

  function resetUserForm() {
    const f = document.getElementById('userForm'); if (!f) return;
    f.reset(); editandoUserId=null;
    f.querySelector('[type="submit"]').textContent = 'Criar Usuário';
    const b = document.getElementById('cancelarEdicaoUsuario'); if (b) b.style.display='none';
    if (f.elements['userPassword']) { f.elements['userPassword'].placeholder='Senha (obrigatória)'; f.elements['userPassword'].required=true; }
  }

  window.sgcEmpresa = window.sgcEmpresa || {};
  window.sgcEmpresa.editarUsuario = async (id) => {
    const lista = await fetch('api/usuarios.php').then(r=>r.json());
    const u = lista.find(x=>x.id==id); if(!u) return;
    editandoUserId=id;
    const f=document.getElementById('userForm');
    f.elements['userName'].value=u.nome; f.elements['userEmail'].value=u.email; f.elements['userPerfil'].value=u.perfil_id;
    if(f.elements['userPassword']){f.elements['userPassword'].value='';f.elements['userPassword'].placeholder='Nova senha (vazio = manter)';f.elements['userPassword'].required=false;}
    f.querySelector('[type="submit"]').textContent='Salvar Alterações';
    const b=document.getElementById('cancelarEdicaoUsuario');if(b)b.style.display='inline-block';
    document.querySelector('.content-area')?.scrollTo({top:0,behavior:'smooth'});
  };
  window.sgcEmpresa.desativarUsuario = async (id) => {
    if(!confirm('Desativar este usuário?')) return;
    const res=await fetch(`api/usuarios.php?id=${id}`,{method:'DELETE'}).then(r=>r.json());
    notify(res.message,res.success?'Sucesso':'Erro'); if(res.success) carregarUsuarios();
  };
  window.sgcEmpresa.reativarUsuario = async (id) => {
    const res=await fetch(`api/usuarios.php?id=${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ativo:1})}).then(r=>r.json());
    notify(res.message,res.success?'Sucesso':'Erro'); if(res.success) carregarUsuarios();
  };

  // ════════════════════════════════════════════════════════════
  //  PERFIS E PERMISSÕES
  // ════════════════════════════════════════════════════════════
  async function carregarPerfis() {
    const tbody=document.getElementById('perfisTableBody'); const sel=document.getElementById('userPerfil'); if(!tbody) return;
    const data=await fetch('api/perfis.php').then(r=>r.json()).catch(()=>({perfis:[],modulos:[]}));
    todosOsPerfis=data.perfis||[]; todosOsModulos=data.modulos||[];
    tbody.innerHTML='';
    todosOsPerfis.forEach(p=>{
      const qtd=Object.values(p.permissoes||{}).filter(Boolean).length;
      tbody.innerHTML+=`<tr><td>${p.id}</td><td>${p.nome}</td><td>${p.descricao||'—'}</td><td>${qtd} módulo(s)</td>
        <td><button onclick="sgcEmpresa.editarPerfil(${p.id})">Editar</button>
        <button class="delete-btn" onclick="sgcEmpresa.deletarPerfil(${p.id})">Excluir</button></td></tr>`;
    });
    if(sel){sel.innerHTML='<option value="">Selecione um Perfil</option>'; todosOsPerfis.forEach(p=>sel.innerHTML+=`<option value="${p.id}">${p.nome}</option>`);}
  }

  function renderMatriz(perm) {
    const c=document.getElementById('permissoes-matrix'); if(!c||!todosOsModulos.length) return;
    c.innerHTML=todosOsModulos.map(m=>`<label class="perm-label"><input type="checkbox" data-mod="${m.identificador}" ${perm[m.identificador]?'checked':''}><span>${m.nome}</span></label>`).join('');
  }

  async function salvarPerfil(e) {
    e.preventDefault();
    const f=document.getElementById('perfilForm');
    const perm={}; f.querySelectorAll('[data-mod]').forEach(cb=>{perm[cb.dataset.mod]=cb.checked;});
    const d={nome:f.elements['perfilNome'].value,descricao:f.elements['perfilDescricao'].value,permissoes:perm};
    const url=editandoPerfilId?`api/perfis.php?id=${editandoPerfilId}`:'api/perfis.php';
    const res=await fetch(url,{method:editandoPerfilId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(r=>r.json()).catch(()=>({success:false,message:'Erro de conexão.'}));
    notify(res.message,res.success?'Sucesso':'Erro');
    if(res.success){editandoPerfilId=null;f.reset();renderMatriz({});f.querySelector('[type="submit"]').textContent='Criar Perfil';carregarPerfis();}
  }

  window.sgcEmpresa.editarPerfil=(id)=>{
    const p=todosOsPerfis.find(x=>x.id==id);if(!p) return;
    editandoPerfilId=id;
    const f=document.getElementById('perfilForm');
    f.elements['perfilNome'].value=p.nome; f.elements['perfilDescricao'].value=p.descricao||'';
    renderMatriz(p.permissoes||{});
    f.querySelector('[type="submit"]').textContent='Salvar Perfil';
    document.querySelector('.content-area')?.scrollTo({top:0,behavior:'smooth'});
  };
  window.sgcEmpresa.deletarPerfil=async(id)=>{
    if(!confirm('Excluir este perfil?')) return;
    const res=await fetch(`api/perfis.php?id=${id}`,{method:'DELETE'}).then(r=>r.json());
    notify(res.message,res.success?'Sucesso':'Erro');if(res.success)carregarPerfis();
  };

  // ════════════════════════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    const cf=document.getElementById('companyDataForm');  if(cf) cf.addEventListener('submit',salvarEmpresa);
    const ss=document.getElementById('empresa-segmento'); if(ss) ss.addEventListener('change',e=>atualizarDescSegmento(e.target.value));
    const uf=document.getElementById('userForm');          if(uf) uf.addEventListener('submit',salvarUsuario);
    const pf=document.getElementById('perfilForm');        if(pf) pf.addEventListener('submit',salvarPerfil);
    const cb=document.getElementById('cancelarEdicaoUsuario'); if(cb) cb.addEventListener('click',resetUserForm);

    document.querySelectorAll('.users-tab-btn').forEach(btn=>btn.addEventListener('click',()=>{
      const t=btn.dataset.tab;
      document.querySelectorAll('.users-tab-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      document.querySelectorAll('.users-tab-pane').forEach(p=>p.classList.toggle('active',p.id===`utab-${t}`));
    }));

    document.querySelectorAll('[data-section="company-data"]').forEach(el=>el.addEventListener('click',carregarEmpresa));
    document.querySelectorAll('[data-section="users"]').forEach(el=>el.addEventListener('click',async()=>{await carregarPerfis();renderMatriz({});await carregarUsuarios();}));

    // Carrega o segmento imediatamente ao iniciar (para configurar o PDV correto)
    carregarEmpresa();
  });
})();
