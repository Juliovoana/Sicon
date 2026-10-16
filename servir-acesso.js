/* ============================================================
   servir-acesso.js — login do Servir + unidade + credenciais do coletor Google
   Usado por: fechamento-caixas.html, extratos-contas.html, painel-financeiro.html e dashboards-acesso.html.

   O que faz:
     1) entra com a MESMA sessão do Servir (supabase-js, mesmo storage dos outros módulos); se não houver sessão,
        mostra o login (e-mail e senha);
     2) descobre as unidades do usuário (servir_unidade_usuarios) e deixa escolher quando há mais de uma;
     3) pede ao banco a URL e o token do Apps Script DA UNIDADE (fn_dash_credenciais): o servidor só devolve se o
        usuário é o principal da unidade ou tem papel "visualizador" naquele painel (servir-dashboards-acesso.sql).
        Padrão fechado: sem papel, sem acesso.
   A URL e o token ficam só em memória: não vão para localStorage nem para a barra de endereço.

   Modo reserva (transição): se a página já tem URL+token antigos neste aparelho (link com #u=&t=) e não há login do
   Servir, ela continua funcionando como antes, com um aviso e o botão "Entrar pelo Servir". Para desligar de vez,
   passe exigirLogin: true em ServirAcesso.preparar().
   ============================================================ */
(function(){
  'use strict';
  const SUPABASE_URL = 'https://frzvcrcshkpvjdbbqkhz.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_h-JuDyjYgb5YKGYFRKtLEg_8gnJor9w';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const K_UNIDADE = 'servir_dash_unidade_v1';
  const URL_SCRIPT_OK = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  const NOME_CSV_OK = /^[A-Za-z0-9_.-]{1,80}\.csv$/;
  const MODULOS = { fechamento_caixas: 'Fechamento de caixas', extratos_contas: 'Extratos das contas', painel_financeiro: 'Painel financeiro' };
  const PAGINAS = { fechamento_caixas: 'fechamento-caixas.html', extratos_contas: 'extratos-contas.html', painel_financeiro: 'painel-financeiro.html' };

  let sb = null;

  // ---------- utilidades ----------
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if(cls) e.className = cls; if(txt != null) e.textContent = txt; return e; };
  const lerLS = (k) => { try { return localStorage.getItem(k); } catch(e){ return null; } };
  const gravarLS = (k, v) => { try { if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch(e){} };

  function estilo(){
    if(document.getElementById('sa-estilo')) return;
    const s = document.createElement('style'); s.id = 'sa-estilo';
    s.textContent = `
      .sa-fundo{ position:fixed; inset:0; z-index:9999; background:var(--bg,#f4f6f5); display:flex; align-items:center; justify-content:center; padding:16px; overflow:auto; }
      .sa-card{ background:var(--card,#fff); color:var(--ink,#18241f); border:1px solid var(--line,#dfe5e2); border-radius:14px; padding:22px 22px 18px; width:100%; max-width:380px; font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
      .sa-card h2{ margin:0 0 4px; font-size:1.2rem; } .sa-card p{ margin:0 0 14px; color:var(--muted,#5d6b64); font-size:.9rem; }
      .sa-card label{ display:block; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted,#5d6b64); margin:10px 0 4px; }
      .sa-card input{ width:100%; border:1px solid var(--line,#dfe5e2); background:var(--card,#fff); color:var(--ink,#18241f); border-radius:8px; padding:10px 12px; font-size:1rem; }
      .sa-btn{ width:100%; margin-top:14px; border:none; border-radius:8px; padding:11px 14px; font-weight:700; font-size:.95rem; cursor:pointer; background:var(--brand,#1f6f4a); color:#fff; }
      .sa-btn.sec{ background:var(--card,#fff); color:var(--ink,#18241f); border:1px solid var(--line,#dfe5e2); margin-top:8px; }
      .sa-btn[disabled]{ opacity:.6; cursor:default; }
      .sa-msg{ margin-top:10px; font-size:.88rem; color:var(--neg,#b3261e); min-height:1.2em; }
      .sa-unid{ display:block; width:100%; text-align:left; margin-top:8px; border:1px solid var(--line,#dfe5e2); background:var(--card,#fff); color:var(--ink,#18241f); border-radius:10px; padding:12px 14px; font-size:1rem; font-weight:600; cursor:pointer; }
      .sa-unid:hover{ border-color:var(--brand,#1f6f4a); }
      .sa-barra{ position:fixed; right:10px; bottom:10px; z-index:9000; background:var(--card,#fff); color:var(--ink,#18241f); border:1px solid var(--line,#dfe5e2); border-radius:999px; padding:5px 6px 5px 12px; font:600 .78rem system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; display:flex; gap:6px; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,.15); max-width:calc(100vw - 20px); }
      .sa-barra span{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:46vw; }
      .sa-barra button, .sa-barra a{ border:1px solid var(--line,#dfe5e2); background:var(--bg,#f4f6f5); color:var(--ink,#18241f); border-radius:999px; padding:4px 10px; font:inherit; cursor:pointer; text-decoration:none; }
      .sa-aviso-legado{ position:fixed; left:0; right:0; top:0; z-index:9000; background:var(--warn-bg,#fff0cf); color:var(--warn,#9a6200); border-bottom:1px solid var(--warn,#9a6200); padding:6px 12px; font:600 .82rem system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .sa-aviso-legado button{ border:1px solid currentColor; background:transparent; color:inherit; border-radius:999px; padding:3px 10px; font:inherit; cursor:pointer; }
    `;
    document.head.appendChild(s);
  }
  function fundo(){ estilo(); let f = document.getElementById('sa-fundo'); if(!f){ f = el('div', 'sa-fundo'); f.id = 'sa-fundo'; document.body.appendChild(f); } f.replaceChildren(); return f; }
  const fecharFundo = () => { const f = document.getElementById('sa-fundo'); if(f) f.remove(); };

  function carregarScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Não consegui carregar a biblioteca de login (internet?).')); document.head.appendChild(s); }); }
  async function cliente(){
    if(sb) return sb;
    if(!window.supabase) await carregarScript(LIB);
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return sb;
  }

  // ---------- login ----------
  function telaLogin(titulo){
    return new Promise((resolve) => {
      const f = fundo(); const c = el('div', 'sa-card');
      c.appendChild(el('h2', '', titulo || 'Entrar')); c.appendChild(el('p', '', 'Use o mesmo e-mail e senha do Servir.'));
      const lE = el('label', '', 'E-mail'); const iE = el('input'); iE.type = 'email'; iE.autocomplete = 'username'; iE.inputMode = 'email';
      const lS = el('label', '', 'Senha'); const iS = el('input'); iS.type = 'password'; iS.autocomplete = 'current-password';
      const b = el('button', 'sa-btn', 'Entrar'); b.type = 'button'; const m = el('div', 'sa-msg'); m.setAttribute('role', 'alert');
      [lE, iE, lS, iS, b, m].forEach(x => c.appendChild(x)); f.appendChild(c); iE.focus();
      const entrar = async () => {
        if(!iE.value.trim() || !iS.value){ m.textContent = 'Informe e-mail e senha.'; return; }
        b.disabled = true; m.textContent = '';
        const { data, error } = await sb.auth.signInWithPassword({ email: iE.value.trim(), password: iS.value });
        b.disabled = false;
        if(error){ m.textContent = /invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message; return; }
        resolve(data.session);
      };
      b.addEventListener('click', entrar);
      [iE, iS].forEach(i => i.addEventListener('keydown', (e) => { if(e.key === 'Enter') entrar(); }));
    });
  }

  // ---------- unidades ----------
  async function listarUnidades(userId){
    const { data: vs, error } = await sb.from('servir_unidade_usuarios').select('unidade_negocio_id, eh_principal').eq('user_id', userId).order('eh_principal', { ascending: false });
    if(error) throw error;
    if(!vs || !vs.length) return [];
    const ids = [...new Set(vs.map(v => v.unidade_negocio_id))];
    const { data: us } = await sb.from('servir_unidades_negocio').select('id, nome').in('id', ids);
    const nomes = new Map((us || []).map(u => [u.id, u.nome]));
    return vs.map(v => ({ id: v.unidade_negocio_id, nome: nomes.get(v.unidade_negocio_id) || '(unidade sem nome)', ehPrincipal: !!v.eh_principal }));
  }
  function escolherUnidade(unidades, titulo){
    return new Promise((resolve) => {
      const f = fundo(); const c = el('div', 'sa-card'); c.appendChild(el('h2', '', titulo || 'Escolha a unidade')); c.appendChild(el('p', '', 'Cada unidade tem os seus próprios dados.'));
      unidades.forEach(u => { const b = el('button', 'sa-unid', u.nome); b.type = 'button'; b.addEventListener('click', () => { gravarLS(K_UNIDADE, u.id); resolve(u); }); c.appendChild(b); });
      f.appendChild(c);
    });
  }

  function mensagem(titulo, texto, botoes){
    const f = fundo(); const c = el('div', 'sa-card'); c.appendChild(el('h2', '', titulo)); c.appendChild(el('p', '', texto));
    (botoes || []).forEach(([rot, fn, sec, href]) => { const b = href ? el('a', 'sa-btn' + (sec ? ' sec' : ''), rot) : el('button', 'sa-btn' + (sec ? ' sec' : ''), rot); if(href){ b.href = href; b.style.display = 'block'; b.style.textAlign = 'center'; b.style.textDecoration = 'none'; } else { b.type = 'button'; b.addEventListener('click', fn); } c.appendChild(b); });
    f.appendChild(c);
  }

  // ---------- API ----------
  async function entrar(opts){
    opts = opts || {};
    await cliente();
    let { data: { session } } = await sb.auth.getSession();
    if(!session) session = await telaLogin(opts.titulo);
    const user = session.user;
    const unidades = await listarUnidades(user.id);
    if(!unidades.length){ mensagem('Sem unidade', 'Seu usuário não está vinculado a nenhuma unidade do Servir.', [['Sair', sair]]); return new Promise(() => {}); }
    let unidade = unidades.find(u => u.id === lerLS(K_UNIDADE));
    if(!unidade) unidade = unidades.length === 1 ? unidades[0] : await escolherUnidade(unidades);
    gravarLS(K_UNIDADE, unidade.id);
    fecharFundo();
    const ctx = { sb, user, unidade, unidades, sair, trocarUnidade };
    return ctx;
  }
  async function sair(){ try { await sb.auth.signOut(); } catch(e){} gravarLS(K_UNIDADE, null); location.reload(); }
  async function trocarUnidade(){ const ctxUn = (await listarUnidades((await sb.auth.getUser()).data.user.id)); const u = await escolherUnidade(ctxUn); location.reload(); return u; }

  async function credenciais(ctx, modulo){
    const { data, error } = await sb.rpc('fn_dash_credenciais', { p_unidade: ctx.unidade.id, p_modulo: modulo });
    if(error){
      if(/sem_acesso/.test(error.message || '')) return { erro: 'sem_acesso' };
      if(/fn_dash_credenciais|schema cache/i.test(error.message || '')) return { erro: 'sem_sql' };
      return { erro: 'falha', detalhe: error.message };
    }
    const linha = Array.isArray(data) ? data[0] : data;
    if(!linha || !linha.url || !linha.token) return { erro: 'sem_credenciais' };
    if(!URL_SCRIPT_OK.test(linha.url)) return { erro: 'url_invalida' };      // JSONP executa o que o endereço devolver: só o formato do Google
    const arquivos = {};
    if(linha.arquivos && typeof linha.arquivos === 'object') Object.keys(linha.arquivos).forEach(k => { if(NOME_CSV_OK.test(String(linha.arquivos[k]))) arquivos[k] = linha.arquivos[k]; });
    return { url: linha.url, token: linha.token, arquivos };
  }

  function barra(ctx, modulo){
    estilo(); const old = document.getElementById('sa-barra'); if(old) old.remove();
    const b = el('div', 'sa-barra'); b.id = 'sa-barra';
    const t = el('span', '', '🏢 ' + ctx.unidade.nome); t.title = ctx.user.email || ''; b.appendChild(t);
    if(ctx.unidades.length > 1){ const x = el('button', '', 'Trocar'); x.type = 'button'; x.addEventListener('click', trocarUnidade); b.appendChild(x); }
    if(ctx.unidade.ehPrincipal){ const a = el('a', '', '⚙ Acesso'); a.href = 'dashboards-acesso.html'; a.title = 'Credenciais do Google e quem pode ver cada painel (só o principal)'; b.appendChild(a); }
    const s = el('button', '', 'Sair'); s.type = 'button'; s.addEventListener('click', sair); b.appendChild(s);
    document.body.appendChild(b);
  }

  /* preparar({ modulo, titulo, legado(): bool, exigirLogin, aoLegado(), aoPronto(cred, ctx) }) */
  async function preparar(o){
    const modulo = o.modulo;
    const temLegado = !!(o.legado && o.legado()) && !o.exigirLogin;
    const forcar = (function(){ try { return sessionStorage.getItem('sa_forcar') === '1'; } catch(e){ return false; } })();
    try {
      if(temLegado && !forcar){
        // modo reserva: só usa se NÃO houver login do Servir neste aparelho
        let sessao = null; try { await cliente(); sessao = (await sb.auth.getSession()).data.session; } catch(e){ /* sem internet pra biblioteca: segue no reserva */ }
        if(!sessao){ avisoLegado(); if(o.aoLegado) o.aoLegado(); return; }
      }
      const ctx = await entrar({ titulo: o.titulo || MODULOS[modulo] });
      const r = await credenciais(ctx, modulo);
      if(r.erro === 'sem_acesso'){
        mensagem('Sem acesso a este painel', 'Você está na unidade “' + ctx.unidade.nome + '”, mas o principal ainda não liberou “' + (MODULOS[modulo] || modulo) + '” para o seu usuário.',
          [ctx.unidades.length > 1 ? ['Trocar unidade', trocarUnidade, true] : null, ['Sair', sair, true]].filter(Boolean)); return;
      }
      if(r.erro === 'sem_credenciais'){
        mensagem('Credenciais não cadastradas', ctx.unidade.ehPrincipal ? 'Cadastre o endereço e o token do script do Google desta unidade.' : 'O principal da unidade ainda não cadastrou o acesso aos dados. Avise-o.',
          [ctx.unidade.ehPrincipal ? ['Cadastrar agora', null, false, 'dashboards-acesso.html'] : null, ['Sair', sair, true]].filter(Boolean)); return;
      }
      if(r.erro === 'sem_sql'){ mensagem('Falta configurar o banco', 'Peça ao administrador para rodar o servir-dashboards-acesso.sql no Supabase.', [['Sair', sair, true]]); return; }
      if(r.erro === 'url_invalida'){ mensagem('Endereço do script inválido', 'O endereço cadastrado não é de um app da web do Google (…/exec). O principal precisa corrigir em “Acesso”.', [['Sair', sair, true]]); return; }
      if(r.erro){ mensagem('Não consegui abrir', r.detalhe || 'Erro desconhecido.', [['Sair', sair, true]]); return; }
      try { sessionStorage.removeItem('sa_forcar'); } catch(e){}
      barra(ctx, modulo);
      o.aoPronto(r, ctx);
    } catch(err){
      console.error(err);
      mensagem('Não consegui entrar', err.message || String(err), [['Tentar de novo', () => location.reload()]]);
    }
  }
  function avisoLegado(){
    estilo(); const a = el('div', 'sa-aviso-legado'); a.appendChild(el('span', '', 'Acesso antigo (link com token neste aparelho).'));
    const b = el('button', '', 'Entrar pelo Servir'); b.type = 'button'; b.addEventListener('click', () => { try { sessionStorage.setItem('sa_forcar', '1'); } catch(e){} location.reload(); });
    a.appendChild(b); document.body.appendChild(a);
  }

  window.ServirAcesso = { MODULOS, PAGINAS, URL_SCRIPT_OK, cliente, entrar, credenciais, barra, preparar, sair, mensagem };
})();
