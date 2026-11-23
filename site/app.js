'use strict';
/* Atlas Escolar (demo). Dados fictícios em dados.js (gerado por build.py a partir de gerar_dados_demo.py). */

const D = window.DADOS, G = window.GEO_MG;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const raiz = document.documentElement;

/* ------------------------------------------------------------ formatação */
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = v => nf0.format(v || 0);
const moeda = v => 'R$ ' + nf2.format(v || 0);
const moedaCurta = v => Math.abs(v) >= 1e6 ? `R$ ${nf2.format(v / 1e6)} mi` : Math.abs(v) >= 1e3 ? `R$ ${nf0.format(v / 1e3)} mil` : moeda(v);
const grande = v => v >= 1e6 ? nf2.format(v / 1e6) + ' mi' : v >= 1e4 ? nf0.format(v / 1e3) + ' mil' : num(v);
const pct = (p, t) => t ? nf1.format(p / t * 100) + '%' : '—';
const dataBr = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const semAcento = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
const cor = nome => getComputedStyle(raiz).getPropertyValue(nome).trim();

const MINUSC = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM']);
const SIGLAS = new Set(['EE', 'CESEC', 'SRE', 'PIEC', 'NTE', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XV', 'JK']);
const titulo = s => String(s || '').toLowerCase().split(/\s+/).map((w, i) => {
  const W = w.toUpperCase();
  if (SIGLAS.has(W)) return W;
  if (i && MINUSC.has(W)) return w;
  return w.charAt(0).toUpperCase() + w.slice(1);
}).join(' ');

/* ------------------------------------------------------------ dados */
const E = D.escolas.map((e, i) => ({ ...D.padrao, ...e, i }));
for (const e of E) e.busca = semAcento(`${e.nome} ${e.inep} ${e.codigo} ${D.municipios[e.mun]} ${D.sres[e.sre]}`);
const munPorIbge = new Map(D.munIbge.map((c, i) => [String(c), i]));
const sreDoMun = [];
for (const e of E) sreDoMun[e.mun] ??= e.sre;

// Com Wi-Fi = Fase 1, Fase 2 ou ENEC. Não receberá = sem Wi-Fi e com motivo na coluna OBSERVAÇÕES da planilha.
const instalado = e => e.fase === 1 || e.fase === 2 || e.wifi === 2;
const naoRecebera = e => !instalado(e) && !!e.obs;
const alunosPorDisp = e => e.dispositivos ? e.alunos / e.dispositivos : null;
const mbpsPorAluno = e => e.alunos ? e.velocidade / e.alunos : null;

function resumir(lista) {
  const r = { escolas: lista.length, com: 0, sem: 0, f1: 0, f2: 0, f0: 0, pontos: 0, valor: 0, capital: 0,
    alunos: 0, dispositivos: 0, velocidade: 0, custoNet: 0, atOk: 0, atRuim: 0, atSem: 0, comSala: 0, semSala: 0,
    cb: 0, nb: 0, pc: 0, inserv: 0, nr: 0, valorF1: 0, valorF2: 0,
    vAprov: 0, vReprov: 0, vPend: 0, diasMax: -1, muns: new Set() };
  for (const e of lista) {
    if (instalado(e)) r.com++; else { r.sem++; if (e.obs) r.nr++; }
    r['f' + e.fase]++;
    r.pontos += e.pontos; r.valor += e.total; r.capital += e.capital;
    if (e.fase) r['valorF' + e.fase] += e.total;
    if (e.fase === 2) {
      /REPROVAD/.test(e.status) ? r.vReprov++ : /APROVAD/.test(e.status) ? r.vAprov++ : r.vPend++;
      r.diasMax = Math.max(r.diasMax, e.dias);
    }
    r.alunos += e.alunos; r.dispositivos += e.dispositivos; r.velocidade += e.velocidade; r.custoNet += e.custoNet;
    e.atendimento === 1 ? r.atOk++ : e.atendimento === 0 ? r.atRuim++ : r.atSem++;
    if (e.salaInfo === 1) r.comSala++; else if (e.salaInfo === 0) r.semSala++;
    const p = e.parque;
    if (p) {
      r.cb += (p.cbProfessor || 0) + (p.cbAluno || 0);
      r.nb += p.notebook || 0;
      r.pc += (p.pc81 || 0) + (p.pc122 || 0) + (p.pc06 || 0) + (p.pcOutros || 0);
      r.inserv += (p.inservPc || 0) + (p.inservCb || 0) + (p.inservNb || 0);
    }
    r.muns.add(e.mun);
  }
  r.cobertura = r.escolas ? r.com / r.escolas * 100 : 0;
  r.alunosPorDisp = r.dispositivos ? r.alunos / r.dispositivos : 0;
  r.mbpsPorAluno = r.alunos ? r.velocidade / r.alunos : 0;
  return r;
}
const agrupar = (lista, chave) => {
  const m = new Map();
  for (const x of lista) { const k = chave(x); (m.get(k) || m.set(k, []).get(k)).push(x); }
  return m;
};
const RES_SRE = D.sres.map((nome, i) => ({ ...resumir(E.filter(e => e.sre === i)), nome, i }));

/* rampa: 'bom' = mais é melhor (verde); 'alerta' = mais é pior (ferrugem) */
const METRICAS = {
  cobertura:     { g: 'Wi-Fi', t: 'Cobertura Wi-Fi', v: r => r.cobertura, f: v => nf1.format(v) + '%', rampa: 'bom' },
  sem:           { g: 'Wi-Fi', t: 'Escolas sem Wi-Fi do projeto', v: r => r.sem, f: num, rampa: 'alerta' },
  nr:            { g: 'Wi-Fi', t: 'Escolas que não receberão Wi-Fi', v: r => r.nr, f: num, rampa: 'alerta' },
  vPend:         { g: 'Wi-Fi', t: 'Fase 2 aguardando vistoria', v: r => r.vPend, f: num, rampa: 'alerta' },
  valor:         { g: 'Wi-Fi', t: 'Investimento (Fases 1 e 2)', v: r => r.valor, f: moedaCurta, rampa: 'bom' },
  pontos:        { g: 'Wi-Fi', t: 'Pontos de acesso instalados', v: r => r.pontos, f: num, rampa: 'bom' },
  alunosPorDisp: { g: 'Máquinas', t: 'Alunos por dispositivo', v: r => r.alunosPorDisp, f: v => nf1.format(v), rampa: 'alerta' },
  dispositivos:  { g: 'Máquinas', t: 'Dispositivos', v: r => r.dispositivos, f: num, rampa: 'bom' },
  semSala:       { g: 'Máquinas', t: 'Escolas sem sala de informática', v: r => r.semSala, f: num, rampa: 'alerta' },
  mbpsPorAluno:  { g: 'Banda', t: 'Mbps por aluno', v: r => r.mbpsPorAluno, f: v => nf2.format(v) + ' Mbps', rampa: 'bom' },
  atRuim:        { g: 'Banda', t: 'Escolas com internet insuficiente', v: r => r.atRuim, f: num, rampa: 'alerta' },
  custoNet:      { g: 'Banda', t: 'Custo mensal de internet', v: r => r.custoNet, f: moedaCurta, rampa: 'bom' },
};

/* ------------------------------------------------------------ estado */
/* Três visões do mesmo atlas: cada uma com suas métricas, painéis, colunas e gráficos. */
const VISOES = {
  geral: { grupos: ['Wi-Fi', 'Máquinas', 'Banda'], metrica: 'cobertura' },
  wifi: { grupos: ['Wi-Fi'], metrica: 'cobertura' },
  parque: { grupos: ['Máquinas', 'Banda'], metrica: 'alunosPorDisp' },
};
const S = {
  aba: 'geral',
  visao: 'geral',
  escopo: { tipo: 'estado' },
  metrica: 'cobertura',
  ordemLista: { k: 'escolas', desc: true },
  ordemEscolas: { k: 'nome', desc: false },
  ordemVist: { k: 'dias', desc: true },
  ordemFora: { k: 'nome', desc: false },
  filtros: { texto: '', sre: '', fase: '', wifi: '', zona: '', at: '' },
  limite: 100,
  statusVist: '',
  limiteVist: 50,
};
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };
const ler = k => { try { return localStorage.getItem(k); } catch { return null; } };
const metricaDaVisao = v => (METRICAS[ler('metrica:' + v)] && VISOES[v].grupos.includes(METRICAS[ler('metrica:' + v)].g)) ? ler('metrica:' + v) : VISOES[v].metrica;
S.metrica = metricaDaVisao('geral');

const escolasDoEscopo = () => {
  const s = S.escopo;
  return s.tipo === 'sre' ? E.filter(e => e.sre === s.i) : s.tipo === 'mun' ? E.filter(e => e.mun === s.i) : E;
};
const sreFoco = () => S.escopo.tipo === 'sre' ? S.escopo.i : S.escopo.tipo === 'mun' ? sreDoMun[S.escopo.i] : -1;

function irPara(escopo) {
  S.escopo = escopo;
  S.ordemLista = escopo.tipo === 'mun' ? { k: 'nome', desc: false } : { k: 'escolas', desc: true };
  trocarAba(S.visao);
  renderAtlas();
  const lista = $('#lista');
  lista.classList.remove('entrando'); void lista.offsetWidth; lista.classList.add('entrando');
  window.scrollTo({ top: 0, behavior: semMovimento.matches ? 'auto' : 'smooth' });
}

/* ------------------------------------------------------------ componentes */
const selo = (texto, tom) => `<span class="selo ${tom || ''}">${esc(texto)}</span>`;
const situacaoWifi = e => instalado(e) ? (e.wifi === 2 && !e.fase ? 'Com Wi-Fi (ENEC)' : `Com Wi-Fi, Fase ${e.fase}`) : naoRecebera(e) ? 'Não receberá Wi-Fi' : 'Sem Wi-Fi do projeto';
const seloWifi = e => selo(situacaoWifi(e), instalado(e) ? 'ok' : naoRecebera(e) ? 'ruim' : 'alerta');
const seloAt = e => e.atendimento === 1 ? selo('Adequada', 'ok') : e.atendimento === 0 ? selo('Insuficiente', 'ruim') : selo('Sem avaliação');
const seloStatus = s => !s ? '' : selo(titulo(s), /APROVAD/.test(s) ? 'ok' : /REPROVAD/.test(s) ? 'ruim' : 'alerta');

function barraComposicao(partes) {
  const total = partes.reduce((s, p) => s + p.v, 0);
  const rotulo = partes.map(p => `${p.t}: ${num(p.v)}`).join(', ');
  return `<div class="comp" role="img" aria-label="${esc(rotulo)}">${partes.map(p => `<span data-k="barra:${p.t}" data-g="${p.v}" style="flex-grow:${p.v};background:${p.c}"></span>`).join('')}</div>
    <ul class="legenda">${partes.filter(p => p.v).map(p => `<li><i style="background:${p.c}"></i>${esc(p.t)} <b>${N('leg:' + p.t, p.v, 'int')}</b> <small>${pct(p.v, total)}</small></li>`).join('')}</ul>`;
}

/* Números e barras animam do valor anterior para o novo ao trocar de recorte (não em cada tecla). */
const FMT = { int: num, n1: v => nf1.format(v), n2: v => nf2.format(v), pct: v => nf1.format(v) + '%', moeda: moedaCurta, grande };
const N = (k, v, f) => `<span class="n" data-k="${k}" data-n="${v}" data-f="${f}">${FMT[f](v)}</span>`;
const semMovimento = matchMedia('(prefers-reduced-motion: reduce)');
const anteriores = new Map();
function animar(raiz) {
  const nums = $$('[data-n]', raiz), barras = $$('[data-g]', raiz);
  const de = new Map([...nums, ...barras].map(el => [el.dataset.k, anteriores.get(el.dataset.k) ?? 0]));
  nums.forEach(el => anteriores.set(el.dataset.k, +el.dataset.n));
  barras.forEach(el => anteriores.set(el.dataset.k, +el.dataset.g));
  if (semMovimento.matches) return;
  barras.forEach(el => { el.style.flexGrow = de.get(el.dataset.k); });
  void raiz.offsetWidth;   // fixa o estado inicial antes da transição
  requestAnimationFrame(() => barras.forEach(el => { el.style.flexGrow = el.dataset.g; }));
  const t0 = performance.now();
  const passo = agora => {
    const p = Math.min(1, (agora - t0) / 700), e = 1 - (1 - p) ** 4;   // ease-out forte
    nums.forEach(el => { const a = de.get(el.dataset.k), b = +el.dataset.n; el.textContent = FMT[el.dataset.f](a + (b - a) * e); });
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
const fato = (t, v, nota) => `<div><dt>${t}</dt><dd>${v}${nota ? `<small>${nota}</small>` : ''}</dd></div>`;

/** Tabela ordenável. `cols`: { k, t, v(linha) para ordenar, f(linha) html, num }. */
function tabela(host, cols, linhas, { ordem, aoOrdenar, aoClicar, limite = Infinity, aoMais, vazio = 'Nada encontrado com esses filtros.' }) {
  if (!linhas.length) { host.innerHTML = `<p class="vazio">${vazio}</p>`; return; }
  const col = cols.find(c => c.k === ordem.k) || cols[0];
  const sinal = ordem.desc ? -1 : 1;
  const ord = [...linhas].sort((a, b) => {
    const x = col.v(a), y = col.v(b);
    if (x == null || y == null) return (x == null) - (y == null);   // sem dado vai sempre para o fim
    return (typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y) * sinal;
  });
  const vis = ord.slice(0, limite);
  const resto = ord.length - vis.length;
  host.innerHTML = `<table><thead><tr>${cols.map(c =>
    `<th class="${c.num ? 'num' : ''}" aria-sort="${c === col ? (ordem.desc ? 'descending' : 'ascending') : 'none'}"><button type="button" data-k="${c.k}">${c.t}</button></th>`).join('')}</tr></thead>
    <tbody>${vis.map((l, i) => `<tr data-i="${i}" tabindex="0"${i < 14 ? ` style="--i:${i}"` : ''}>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.f ? c.f(l) : esc(c.v(l))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${resto > 0 ? `<button type="button" class="mais">Mostrar mais ${num(Math.min(100, resto))} de ${num(resto)} restantes</button>` : ''}`;
  host.onclick = ev => {
    const th = ev.target.closest('th button');
    if (th) {
      const k = th.dataset.k;
      return aoOrdenar(k === col.k ? { k, desc: !ordem.desc } : { k, desc: !!cols.find(c => c.k === k).num });
    }
    if (ev.target.closest('.mais')) return aoMais?.();
    const tr = ev.target.closest('tbody tr');
    if (tr && aoClicar) aoClicar(vis[+tr.dataset.i]);
  };
  host.onkeydown = ev => {
    if (ev.key === 'Enter' && ev.target.matches('tbody tr') && aoClicar) aoClicar(vis[+ev.target.dataset.i]);
  };
}

const cNome = { k: 'nome', t: 'Nome', v: r => r.nome, f: r => `<span class="nome">${esc(titulo(r.nome))}</span>` };
const cEscolas = { k: 'escolas', t: 'Escolas', v: r => r.escolas, f: r => num(r.escolas), num: 1 };
const cCobertura = { k: 'cobertura', t: 'Cobertura Wi-Fi', v: r => r.cobertura, num: 1,
  f: r => `<span class="celbar"><i style="width:${r.cobertura}%"></i></span>${nf1.format(r.cobertura)}%` };
const cApd = { k: 'alunosPorDisp', t: 'Alunos por dispositivo', v: r => r.dispositivos ? r.alunosPorDisp : null, f: r => r.dispositivos ? nf1.format(r.alunosPorDisp) : '—', num: 1 };
const cMpa = { k: 'mbpsPorAluno', t: 'Mbps por aluno', v: r => r.alunos ? r.mbpsPorAluno : null, f: r => r.alunos ? nf2.format(r.mbpsPorAluno) : '—', num: 1 };
const cRuim = { k: 'atRuim', t: 'Internet insuficiente', v: r => r.atRuim, num: 1, f: r => `${num(r.atRuim)} <small>${pct(r.atRuim, r.atOk + r.atRuim)}</small>` };
const cValor = { k: 'valor', t: 'Investimento', v: r => r.valor, f: r => moedaCurta(r.valor), num: 1 };
const eNome = { k: 'nome', t: 'Escola', v: e => e.nome, f: e => `<span class="nome">${esc(titulo(e.nome))}</span><small>${esc(titulo(D.municipios[e.mun]))}, SRE ${esc(titulo(D.sres[e.sre]))}</small>` };
const eWifi = { k: 'wifi', t: 'Wi-Fi do projeto', v: e => instalado(e) ? 2 : naoRecebera(e) ? 0 : 1, f: seloWifi };
const eApd = { k: 'apd', t: 'Alunos por dispositivo', v: alunosPorDisp, f: e => e.dispositivos ? nf1.format(alunosPorDisp(e)) : '—', num: 1 };
const eMpa = { k: 'mpa', t: 'Mbps por aluno', v: mbpsPorAluno, f: e => e.alunos ? nf2.format(mbpsPorAluno(e)) : '—', num: 1 };
const eAt = { k: 'at', t: 'Internet', v: e => e.atendimento, f: seloAt };
const eAlunos = { k: 'alunos', t: 'Alunos', v: e => e.alunos, f: e => e.alunos ? num(e.alunos) : '—', num: 1 };
const COLUNAS = {
  geral: {
    regiao: [cNome, cEscolas, cCobertura, cValor, cApd, cMpa, cRuim],
    escola: [eNome, eWifi, eAlunos, eApd, eMpa, eAt],
  },
  wifi: {
    regiao: [cNome, cEscolas, cCobertura,
      { k: 'sem', t: 'Sem Wi-Fi', v: r => r.sem, f: r => num(r.sem), num: 1 },
      { k: 'nr', t: 'Não receberão', v: r => r.nr, f: r => num(r.nr), num: 1 },
      cValor,
      { k: 'vPend', t: 'Aguardando vistoria', v: r => r.vPend, f: r => num(r.vPend), num: 1 }],
    escola: [eNome, eWifi,
      { k: 'valor', t: 'Valor', v: e => e.total, f: e => e.total ? moeda(e.total) : '—', num: 1 },
      { k: 'pontos', t: 'Pontos', v: e => e.pontos, f: e => e.pontos ? num(e.pontos) : '—', num: 1 },
      { k: 'vist', t: 'Vistoria', v: e => e.fase === 2 ? e.status : '', f: e => e.fase === 2 ? seloStatus(e.status) + (e.dias >= 0 ? ` <small>${plural(e.dias, 'dia', 'dias')} sem vistoria</small>` : '') : '—' }],
  },
  parque: {
    regiao: [cNome, cEscolas,
      { k: 'alunos', t: 'Alunos', v: r => r.alunos, f: r => num(r.alunos), num: 1 },
      { k: 'dispositivos', t: 'Dispositivos', v: r => r.dispositivos, f: r => num(r.dispositivos), num: 1 },
      cApd, cMpa, cRuim,
      { k: 'semSala', t: 'Sem sala de informática', v: r => r.semSala, f: r => num(r.semSala), num: 1 }],
    escola: [eNome, eAlunos,
      { k: 'disp', t: 'Dispositivos', v: e => e.dispositivos, f: e => e.dispositivos ? num(e.dispositivos) : '—', num: 1 },
      eApd, eMpa, eAt,
      { k: 'sala', t: 'Sala de informática', v: e => e.salaInfo, f: e => e.salaInfo === 1 ? selo('Tem', 'ok') : e.salaInfo === 0 ? selo('Não tem', 'ruim') : selo('Sem resposta') }],
  },
};
const COL_ESCOLA = COLUNAS.geral.escola;   // aba Escolas: a lista completa

/* ------------------------------------------------------------ atlas */
function renderAtlas() {
  const lista = escolasDoEscopo();
  const r = resumir(lista);
  renderTrilha();
  renderResposta(r);
  renderMapa();
  renderLista(lista);
  renderGraficos(lista, r);
  $('#extras-wifi').hidden = S.visao !== 'wifi';
  if (S.visao === 'wifi') { renderVistorias(lista); renderFora(lista); }
}

function renderTrilha() {
  const s = S.escopo, partes = [];
  const sre = sreFoco();
  partes.push(s.tipo === 'estado' ? '<b>Minas Gerais</b>' : '<button type="button" data-ir="estado">Minas Gerais</button>');
  if (sre >= 0) partes.push(s.tipo === 'sre' ? `<b>SRE ${esc(titulo(D.sres[sre]))}</b>` : `<button type="button" data-ir="sre">SRE ${esc(titulo(D.sres[sre]))}</button>`);
  if (s.tipo === 'mun') partes.push(`<b>${esc(titulo(D.municipios[s.i]))}</b>`);
  $('#trilha').innerHTML = partes.join('<i aria-hidden="true">/</i>');
}
$('#trilha').addEventListener('click', ev => {
  const b = ev.target.closest('[data-ir]');
  if (b) irPara(b.dataset.ir === 'estado' ? { tipo: 'estado' } : { tipo: 'sre', i: sreFoco() });
});

const BLOCOS = {
  wifi: r => `<section class="questao" data-tilt><h3>Situação do Wi-Fi</h3>
      ${barraComposicao([
        { t: 'Fase 1', v: r.f1, c: 'var(--mata)' }, { t: 'Fase 2', v: r.f2, c: 'var(--mata-2)' },
        { t: 'Sem Wi-Fi', v: r.sem - r.nr, c: 'var(--linha)' }, { t: 'Não receberá', v: r.nr, c: 'var(--ruim)' }])}
      <dl class="fatos">
        ${fato('Com Wi-Fi instalado', N('com', r.com, 'int'), pct(r.com, r.escolas) + ' das escolas')}
        ${fato('Pontos de acesso', N('pontos', r.pontos, 'int'), 'instalados')}
        ${fato('Não receberão Wi-Fi', N('nr', r.nr, 'int'), 'motivo na planilha')}
      </dl></section>`,
  valores: r => `<section class="questao" data-tilt><h3>Valores</h3>
      <dl class="fatos">
        ${fato('Fase 1', N('vf1', r.valorF1, 'moeda'), plural(r.f1, 'escola', 'escolas'))}
        ${fato('Fase 2', N('vf2', r.valorF2, 'moeda'), plural(r.f2, 'escola', 'escolas'))}
        ${fato('Total', N('valor', r.valor, 'moeda'), 'Fases 1 e 2')}
      </dl></section>`,
  vistorias: r => `<section class="questao" data-tilt><h3>Vistorias da Fase 2</h3>
      ${barraComposicao([
        { t: 'Aprovadas', v: r.vAprov, c: 'var(--ok)' }, { t: 'Aguardando vistoria', v: r.vPend, c: 'var(--alerta)' },
        { t: 'Reprovadas', v: r.vReprov, c: 'var(--ruim)' }])}
      <dl class="fatos">
        ${fato('Escolas na Fase 2', N('f2', r.f2, 'int'))}
        ${fato('Aguardando vistoria', N('vPend', r.vPend, 'int'))}
        ${fato('Maior espera', r.diasMax >= 0 ? N('diasMax', r.diasMax, 'int') : '—', r.diasMax >= 0 ? 'dias sem vistoria' : '')}
      </dl></section>`,
  maquinas: r => `<section class="questao" data-tilt><h3>Máquinas</h3>
      ${barraComposicao([
        { t: 'Chromebooks', v: r.cb, c: 'var(--mata)' }, { t: 'Desktops', v: r.pc, c: 'var(--mata-2)' },
        { t: 'Notebooks', v: r.nb, c: 'var(--mata-3)' }])}
      <dl class="fatos">
        ${fato('Alunos matriculados', N('alunos', r.alunos, 'grande'))}
        ${fato('Sem sala de informática', N('semSala', r.semSala, 'int'), r.semSala === 1 ? 'escola' : 'escolas')}
        ${fato('Inservíveis com laudo', N('inserv', r.inserv, 'int'), 'aguardando leilão')}
      </dl></section>`,
  banda: r => {
    const avaliadas = r.atOk + r.atRuim;
    return `<section class="questao" data-tilt><h3>Banda</h3>
      ${barraComposicao([
        { t: 'Internet adequada', v: r.atOk, c: 'var(--ok)' }, { t: 'Insuficiente', v: r.atRuim, c: 'var(--ruim)' },
        { t: 'Sem avaliação', v: r.atSem, c: 'var(--linha)' }])}
      <dl class="fatos">
        ${fato('Insuficiente', N('insuf', avaliadas ? r.atRuim / avaliadas * 100 : 0, 'pct'), 'das escolas avaliadas')}
        ${fato('Banda contratada', N('banda', r.velocidade, 'grande') + ' Mbps')}
        ${fato('Custo de internet', N('custo', r.custoNet, 'moeda') + '/mês', r.velocidade ? `R$ ${nf2.format(r.custoNet / r.velocidade)} por Mbps` : '')}
      </dl></section>`;
  },
};

function renderResposta(r) {
  const s = S.escopo;
  const onde = esc(s.tipo === 'estado' ? 'Minas Gerais' : s.tipo === 'sre' ? `SRE ${titulo(D.sres[s.i])}` : titulo(D.municipios[s.i]));
  const das = r.escolas === 1 ? 'da escola tem' : `das ${plural(r.escolas, 'escola', 'escolas')} têm`;
  const avaliadas = r.atOk + r.atRuim;
  const parque = r.alunos > 0;
  const V = {
    geral: ['A escola tem Wi-Fi, máquina para usar e banda que aguente?',
      `Em ${onde}, <b>${N('cobertura', r.cobertura, 'pct')}</b> ${das} Wi-Fi do projeto.` +
      (parque ? ` Há <b>${N('apd', r.alunosPorDisp, 'n1')}</b> alunos por dispositivo e <b>${N('mpa', r.mbpsPorAluno, 'n2')} Mbps</b> por aluno.` : ''),
      ['wifi', 'maquinas', 'banda']],
    wifi: ['A escola foi contemplada? Quanto custou? Já foi vistoriada?',
      `Em ${onde}, <b>${N('cobertura', r.cobertura, 'pct')}</b> ${das} Wi-Fi do projeto. <b>${N('sem', r.sem, 'int')}</b> ainda não ${r.sem === 1 ? 'tem' : 'têm'}` +
      (r.nr ? `, e <b>${N('nr', r.nr, 'int')}</b> não ${r.nr === 1 ? 'receberá' : 'receberão'}.` : '.'),
      ['wifi', 'valores', 'vistorias']],
    parque: ['A escola tem máquina para usar e banda que aguente?',
      parque ? `Em ${onde}, há <b>${N('apd', r.alunosPorDisp, 'n1')}</b> alunos por dispositivo e <b>${N('mpa', r.mbpsPorAluno, 'n2')} Mbps</b> por aluno. A internet é insuficiente em <b>${N('insuf', avaliadas ? r.atRuim / avaliadas * 100 : 0, 'pct')}</b> das escolas avaliadas.`
        : `Não há dados do parque tecnológico para ${onde}.`,
      ['maquinas', 'banda']],
  }[S.visao];
  $('#resposta').innerHTML = `<p class="pergunta">${V[0]}</p><h1 class="frase">${V[1]}</h1>${V[2].map(b => BLOCOS[b](r)).join('')}`;
  animar($('#resposta'));
}

function renderLista(lista) {
  const s = S.escopo, cols = COLUNAS[S.visao];
  const opcoes = { ordem: S.ordemLista, aoOrdenar: o => { S.ordemLista = o; renderLista(escolasDoEscopo()); } };
  if (s.tipo === 'mun') {
    $('#lista-titulo').textContent = `Escolas em ${titulo(D.municipios[s.i])}`;
    $('#lista-sub').textContent = 'Clique numa escola para abrir a ficha completa.';
    return tabela($('#lista'), cols.escola, lista, { ...opcoes, aoClicar: abrirFicha });
  }
  if (s.tipo === 'sre') {
    const linhas = [...agrupar(lista, e => e.mun)].map(([i, l]) => ({ ...resumir(l), nome: D.municipios[i], i }));
    $('#lista-titulo').textContent = `Municípios da SRE ${titulo(D.sres[s.i])}`;
    $('#lista-sub').textContent = `${plural(linhas.length, 'município', 'municípios')}. Clique para ver as escolas.`;
    return tabela($('#lista'), cols.regiao, linhas, { ...opcoes, aoClicar: l => irPara({ tipo: 'mun', i: l.i }) });
  }
  $('#lista-titulo').textContent = 'Regionais';
  $('#lista-sub').textContent = `${D.sres.length} superintendências regionais de ensino. Clique numa linha para aproximar.`;
  tabela($('#lista'), cols.regiao, RES_SRE, { ...opcoes, aoClicar: l => irPara({ tipo: 'sre', i: l.i }) });
}

/* ------------------------------------------------------------ mapa (2D e 3D) */
// Cada recorte registra só as suas feições: o ECharts enquadra sozinho, sem zoom calculado à mão.
const temWebGL = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } })();
const pode3d = () => temWebGL && window.GL_OK === true;
S.modo = ler('modo') || (matchMedia('(min-width: 760px)').matches ? '3d' : '2d');
let mapa = null, chaveMapa = '';
const registrados = new Set();
function mapaDoRecorte(foco) {
  const nome = foco < 0 ? 'mg' : 'sre' + foco;
  if (!registrados.has(nome)) {
    const feicoes = foco < 0 ? G.mapa.features : G.mapa.features.filter(f => G.mun[f.properties.name]?.[1].includes(foco));
    echarts.registerMap(nome, { type: 'FeatureCollection', features: feicoes });
    registrados.add(nome);
  }
  return nome;
}

function tooltipBase() {
  return { backgroundColor: cor('--superficie'), borderColor: cor('--linha'), textStyle: { color: cor('--tinta'), fontFamily: 'Instrument Sans', fontSize: 13 }, extraCssText: 'border-radius:8px;box-shadow:0 8px 24px -12px rgba(0,0,0,.35)' };
}

const hex = h =>(h.match(/[0-9a-f]{2}/gi) || ['00', '00', '00']).map(x => parseInt(x, 16));
const misturar = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const RAZOES = new Set(['cobertura', 'alunosPorDisp', 'mbpsPorAluno']);

/** Valores por município do recorte, com cor e altura (0–1) já calculadas. */
function dadosMapa(m, foco) {
  const lista = foco < 0 ? E : E.filter(e => e.sre === foco);
  const dados = [...agrupar(lista, e => e.mun)].map(([mi, l]) => ({ name: String(D.munIbge[mi]), value: m.v(resumir(l)), n: l.length }));
  const ord = dados.map(d => d.value).sort((a, b) => a - b);
  // ponytail: teto no percentil 95 — um município extremo (1 escola, 200 alunos por máquina) não apaga os demais.
  const min = ord[0] ?? 0, max = ord[Math.floor((ord.length - 1) * 0.95)] ?? 1, span = max - min || 1;
  // Um matiz só por rampa; o dourado fica reservado para seleção e hover.
  const [c0, c2] = m.rampa === 'bom' ? [cor('--rampa-bom-0'), cor('--mata')] : [cor('--rampa-alerta-0'), cor('--ferrugem')];
  const c1 = misturar(c0, c2, 0.5);
  for (const d of dados) {
    // contagens têm cauda longa: raiz quadrada espalha melhor as cores; razões ficam lineares.
    const t = Math.min(1, Math.max(0, (d.value - min) / span)) ** (RAZOES.has(S.metrica) ? 1 : 0.5);
    d.t = t;
    d.cor = t < 0.5 ? misturar(c0, c1, t * 2) : misturar(c1, c2, (t - 0.5) * 2);
  }
  return { dados, min, max, acima: ord.at(-1) > max, grad: `linear-gradient(90deg, ${c0}, ${c1}, ${c2})` };
}

function renderMapa() {
  const el = $('#mapa');
  if (!window.echarts) { el.innerHTML = '<p class="vazio">O mapa precisa de internet para carregar a biblioteca de gráficos (ECharts).</p>'; return; }
  const is3d = S.modo === '3d' && pode3d();
  if (mapa && mapa.__3d !== is3d) { mapa.dispose(); mapa = null; chaveMapa = ''; }
  if (!mapa) { mapa = echarts.init(el); mapa.__3d = is3d; mapa.on('click', cliqueMapa); }

  const m = METRICAS[S.metrica], s = S.escopo, foco = sreFoco(), nome = mapaDoRecorte(foco);
  const { dados, min, max, acima, grad } = dadosMapa(m, foco);
  const sel = s.tipo === 'mun' ? String(D.munIbge[s.i]) : '';
  const tooltip = { ...tooltipBase(), formatter: p => {
    const info = G.mun[p.name];
    if (!info) return '';
    const d = p.data;
    return `<b>${esc(info[0])}</b>${d ? ` · ${plural(d.n, 'escola', 'escolas')}<br>${m.t}: <b>${m.f(d.value)}</b>` : '<br>Sem escola estadual'}`;
  } };
  const destaque = cor('--ouro');
  const serie = is3d ? {
    type: 'map3D', map: nome, regionHeight: 0.3, shading: 'lambert',
    data: dados.map(d => ({ name: d.name, value: d.value, n: d.n, height: 0.5 + d.t * (foco < 0 ? 4 : 6) + (d.name === sel ? 2 : 0),
      itemStyle: { color: d.name === sel ? destaque : d.cor } })),
    itemStyle: { color: cor('--vazio'), borderWidth: 0.5, borderColor: cor('--papel') },
    emphasis: { label: { show: false }, itemStyle: { color: destaque } },
    label: { show: false },
    light: { main: { intensity: 1.15, alpha: 55, beta: 25, shadow: true, shadowQuality: 'high' }, ambient: { intensity: 0.5 } },
    viewControl: { alpha: 50, beta: 4, distance: 125, minDistance: 30, maxDistance: 220, damping: 0.86,
      animation: true, animationDurationUpdate: 900, animationEasingUpdate: 'cubicInOut', panMouseButton: 'right' },
    postEffect: { enable: true, SSAO: { enable: true, radius: 2, intensity: 1.2, quality: 'medium' } },
    temporalSuperSampling: { enable: true },
    animationDurationUpdate: 600, animationEasingUpdate: 'cubicOut',
  } : {
    type: 'map', map: nome, roam: true, scaleLimit: { min: 0.8, max: 14 },
    data: dados.map(d => ({ ...d, itemStyle: { areaColor: d.name === sel ? destaque : d.cor } })),
    itemStyle: { areaColor: cor('--vazio'), borderColor: cor('--papel'), borderWidth: 0.5 },
    emphasis: { itemStyle: { areaColor: destaque }, label: { show: false } },
    select: { disabled: true }, label: { show: false },
    animationDurationUpdate: 300, animationEasingUpdate: 'cubicOut',
  };

  // Troca de recorte: um desfoque curto esconde o corte entre um mapa e outro.
  const chave = `${nome}|${is3d}`;
  const trocou = chave !== chaveMapa;
  chaveMapa = chave;
  if (trocou) el.classList.add('trocando');
  mapa.setOption({ tooltip, series: [serie] }, { replaceMerge: ['series'] });
  if (trocou) setTimeout(() => el.classList.remove('trocando'), 120);   // timer, não rAF: rAF para em aba oculta

  $('#leg-min').textContent = m.f(min);
  $('#leg-max').textContent = (acima ? '≥ ' : '') + m.f(max);
  $('#leg-grad').style.background = grad;
  $('#leg-nome').textContent = m.t;
  $('#mapa-voltar').hidden = s.tipo === 'estado';
  $$('#modo button').forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.modo === (is3d ? '3d' : '2d'));
    b.disabled = b.dataset.modo === '3d' && !pode3d();
  });
  $('#mapa-nota').textContent = s.tipo === 'estado'
    ? 'Clique num município para abrir a regional dele.'
    : `Clique num município para ver as escolas. ${is3d ? 'Arraste para girar, botão direito para mover' : 'Arraste para mover'}, roda do mouse para aproximar.`;
}

function cliqueMapa(p) {
  const info = G.mun[p.name];
  if (!info?.[1].length) return;
  const mi = munPorIbge.get(p.name), foco = sreFoco();
  if (foco < 0) return irPara({ tipo: 'sre', i: mi !== undefined ? sreDoMun[mi] : info[1][0] });
  if (mi !== undefined && E.some(e => e.mun === mi && e.sre === foco)) irPara({ tipo: 'mun', i: mi });
}

function subir() {
  const s = S.escopo;
  if (s.tipo === 'mun') irPara({ tipo: 'sre', i: sreDoMun[s.i] });
  else if (s.tipo === 'sre') irPara({ tipo: 'estado' });
}
$('#mapa-voltar').onclick = subir;
$('#mapa-recentrar').onclick = () => { mapa?.clear(); chaveMapa = ''; renderMapa(); };
$('#modo').addEventListener('click', ev => {
  const b = ev.target.closest('[data-modo]');
  if (!b || b.disabled) return;
  S.modo = b.dataset.modo;
  guardar('modo', S.modo);
  renderMapa();
});

function preencherMetricas() {
  const grupos = agrupar(Object.entries(METRICAS).filter(([, m]) => VISOES[S.visao].grupos.includes(m.g)), ([, m]) => m.g);
  $('#metrica').innerHTML = [...grupos].map(([g, itens]) =>
    `<optgroup label="${g}">${itens.map(([k, m]) => `<option value="${k}">${m.t}</option>`).join('')}</optgroup>`).join('');
  $('#metrica').value = S.metrica;
}
$('#metrica').onchange = ev => { S.metrica = ev.target.value; guardar('metrica:' + S.visao, S.metrica); renderMapa(); };

/* ------------------------------------------------------------ gráficos */
const graficos = new Map();
function grafico(id) {
  if (!window.echarts) return null;
  if (!graficos.has(id)) graficos.set(id, echarts.init($('#' + id)));
  return graficos.get(id);
}
function eixos() {
  const t = { color: cor('--tinta-3'), fontFamily: 'Instrument Sans', fontSize: 12 };
  const linha = { lineStyle: { color: cor('--linha') } };
  return { axisLabel: t, axisLine: linha, splitLine: linha, axisTick: { show: false } };
}
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Barras horizontais: [[rótulo, valor, cor?], ...]. */
function barras(id, linhas, { corBarra = cor('--mata'), fmt = num, esquerda = 120 } = {}) {
  const ax = eixos(), curto = fmt === moeda ? moedaCurta : fmt;
  grafico(id)?.setOption({
    animationDuration: 700, animationEasing: 'cubicOut', animationDelay: i => i * 40, animationDurationUpdate: 500,
    textStyle: { fontFamily: 'Instrument Sans' }, tooltip: { ...tooltipBase(), trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: fmt },
    grid: { left: esquerda, right: 72, top: 8, bottom: 24 },
    xAxis: { type: 'value', ...ax, axisLine: { show: false }, axisLabel: { ...ax.axisLabel, formatter: v => (fmt === moeda ? moedaCurta(v) : grande(v)) } },
    yAxis: { type: 'category', inverse: true, data: linhas.map(l => l[0]), ...ax, splitLine: { show: false } },
    series: [{ type: 'bar', data: linhas.map(l => (l[2] ? { value: l[1], itemStyle: { color: l[2] } } : l[1])), barMaxWidth: 18,
      itemStyle: { color: corBarra, borderRadius: [0, 3, 3, 0] },
      label: { show: true, position: 'right', color: cor('--tinta-2'), fontSize: 12, formatter: p => curto(p.value) } }],
  }, true);
}
const GRAFICOS = {
  entregas: ['Obras entregues por mês', (id, lista) => {
    const ax = eixos(), meses = [...new Set(lista.filter(e => e.dataObra).map(e => e.dataObra.slice(0, 7)))].sort();
    const serie = f => meses.map(m => lista.filter(e => e.fase === f && e.dataObra.startsWith(m)).length);
    grafico(id)?.setOption({ animationDuration: 700, animationEasing: 'cubicOut', animationDelay: i => i * 30, textStyle: { fontFamily: 'Instrument Sans' },
      tooltip: { ...tooltipBase(), trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { left: 36, right: 8, top: 24, bottom: 28 },
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: ax.axisLabel },
      xAxis: { type: 'category', data: meses.map(m => `${MESES[+m.slice(5) - 1]}/${m.slice(2, 4)}`), ...ax, splitLine: { show: false } },
      yAxis: { type: 'value', ...ax, axisLine: { show: false } },
      series: [1, 2].map(f => ({ name: `Fase ${f}`, type: 'bar', stack: 'f', data: serie(f), barMaxWidth: 22,
        itemStyle: { color: cor(f === 1 ? '--mata' : '--mata-2'), borderRadius: f === 2 ? [3, 3, 0, 0] : 0 } })) }, true);
  }],
  valores: ['Valor por fase', (id, lista, r) => barras(id, [['Fase 1', r.valorF1, cor('--mata')], ['Fase 2', r.valorF2, cor('--mata-2')]], { fmt: moeda, esquerda: 70 })],
  vistorias: ['Vistorias da Fase 2', (id, lista, r) => barras(id, [['Aprovadas', r.vAprov, cor('--ok')], ['Aguardando', r.vPend, cor('--alerta')],
    ['Reprovadas', r.vReprov, cor('--ruim')]], { esquerda: 90 })],
  velocidade: ['Faixa de velocidade contratada (Mbps)', (id, lista) => barras(id,
    ['0-300', '301-600', '601-1000', '>1000'].map(f => [f.replace('>', 'acima de '), lista.filter(e => e.parque?.catVel === f).length]), { esquerda: 80 })],
  dispositivos: ['Dispositivos por tipo', (id, lista) => {
    const soma = k => lista.reduce((t, e) => t + (e.parque?.[k] || 0), 0);
    barras(id, [['Chromebook aluno', 'cbAluno'], ['Chromebook professor', 'cbProfessor'], ['Notebook', 'notebook'], ['Desktop pregão 81/2021', 'pc81'],
      ['Desktop pregão 122/2017', 'pc122'], ['Desktop pregão 06/2015', 'pc06'], ['Outros desktops', 'pcOutros']].map(([t, k]) => [t, soma(k)]),
    { corBarra: cor('--mata-2'), esquerda: 150 });
  }],
  sala: ['Sala de informática', (id, lista, r) => barras(id, [['Tem', r.comSala, cor('--ok')], ['Não tem', r.semSala, cor('--ruim')],
    ['Sem resposta', r.escolas - r.comSala - r.semSala, cor('--linha')]], { esquerda: 90 })],
};
const GRAFICOS_DA_VISAO = { geral: ['entregas', 'velocidade', 'dispositivos'], wifi: ['entregas', 'valores', 'vistorias'], parque: ['dispositivos', 'velocidade', 'sala'] };
function renderGraficos(lista, r) {
  GRAFICOS_DA_VISAO[S.visao].forEach((k, i) => {
    const [nome, desenhar] = GRAFICOS[k];
    $(`#gc${i + 1}`).textContent = nome;
    desenhar(`g${i + 1}`, lista, r);
  });
}

/* ------------------------------------------------------------ escolas */
const F = S.filtros;
function escolasFiltradas() {
  const alvo = semAcento(F.texto).trim();
  return E.filter(e =>
    (F.sre === '' || e.sre === +F.sre) && (F.fase === '' || e.fase === +F.fase) &&
    (F.wifi === '' || (F.wifi === '1' ? instalado(e) : F.wifi === 'nr' ? naoRecebera(e) : !instalado(e))) && (F.zona === '' || e.zona === +F.zona) &&
    (F.at === '' || e.atendimento === +F.at) && (!alvo || e.busca.includes(alvo)));
}
function renderEscolas() {
  const lista = escolasFiltradas();
  const r = resumir(lista);
  $('#escolas-resumo').innerHTML = `<b>${plural(lista.length, 'escola', 'escolas')}</b>, ${pct(r.com, r.escolas)} com Wi-Fi do projeto, ${num(r.atRuim)} com internet insuficiente`;
  tabela($('#tabela-escolas'), COL_ESCOLA, lista, {
    ordem: S.ordemEscolas, limite: S.limite, aoClicar: abrirFicha,
    aoOrdenar: o => { S.ordemEscolas = o; renderEscolas(); },
    aoMais: () => { S.limite += 100; renderEscolas(); },
  });
}
function ligarFiltros() {
  $('#f-sre').innerHTML = '<option value="">Todas as regionais</option>' +
    D.sres.map((n, i) => [titulo(n), i]).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([n, i]) => `<option value="${i}">${esc(n)}</option>`).join('');
  const campos = { texto: '#f-texto', sre: '#f-sre', fase: '#f-fase', wifi: '#f-wifi', zona: '#f-zona', at: '#f-at' };
  const sincronizar = () => Object.entries(campos).forEach(([k, s]) => { $(s).value = F[k]; });
  Object.entries(campos).forEach(([k, s]) => $(s).addEventListener('input', ev => { F[k] = ev.target.value; S.limite = 100; renderEscolas(); }));
  $('#limpar').onclick = () => { Object.keys(F).forEach(k => { F[k] = ''; }); S.ordemEscolas = { k: 'nome', desc: false }; sincronizar(); renderEscolas(); };
  $('#fila').onclick = () => { F.at = '0'; S.ordemEscolas = { k: 'mpa', desc: false }; sincronizar(); renderEscolas(); };
  $('#csv').onclick = () => baixarCsv(escolasFiltradas());
}

function baixarCsv(lista) {
  const zona = ['Urbana', 'Distrito', 'Rural'], at = { 1: 'Adequado', 0: 'Insuficiente', '-1': '' };
  const dec = v => v ? String(Math.round(v * 100) / 100).replace('.', ',') : '';
  const campos = [
    ['INEP', e => e.inep], ['Código', e => e.codigo], ['Escola', e => e.nome], ['SRE', e => D.sres[e.sre]],
    ['Município', e => D.municipios[e.mun]], ['Zona', e => zona[e.zona]], ['Wi-Fi do projeto', e => situacaoWifi(e)], ['Observações', e => e.obs],
    ['Fase', e => e.fase || ''], ['Porte', e => e.porte], ['Pontos', e => e.pontos || ''], ['Valor (R$)', e => dec(e.total)],
    ['Situação', e => e.status], ['Entrega da obra', e => dataBr(e.dataObra)],
    ['Dias sem vistoria', e => e.dias >= 0 ? e.dias : ''], ['Alunos', e => e.alunos || ''], ['Dispositivos', e => e.dispositivos || ''],
    ['Banda (Mbps)', e => dec(e.velocidade)], ['Internet (R$/mês)', e => dec(e.custoNet)], ['Atendimento', e => at[e.atendimento]],
    ['E-mail', e => e.email], ['Telefone', e => e.telefone],
  ];
  const q = v => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [campos.map(c => c[0]).join(';'), ...lista.map(e => campos.map(([, f]) => q(f(e))).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `escolas-mg-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ------------------------------------------------------------ Wi-Fi: vistorias e escolas fora do projeto (no recorte atual) */
function renderVistorias(lista) {
  const fase2 = lista.filter(e => e.fase === 2);
  const status = [...agrupar(fase2, e => e.status || 'SEM STATUS')].sort((a, b) => b[1].length - a[1].length);
  if (S.statusVist && !status.some(([st]) => st === S.statusVist)) S.statusVist = '';
  $('#vist-status').innerHTML = [['', 'Todas', fase2.length], ...status.map(([st, l]) => [st, titulo(st), l.length])]
    .map(([v, t, n]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${S.statusVist === v}">${esc(t)} <small>${num(n)}</small></button>`).join('');
  tabela($('#tabela-vistorias'), [
    eNome,
    { k: 'status', t: 'Situação', v: e => e.status, f: e => seloStatus(e.status) },
    { k: 'dias', t: 'Dias sem vistoria', v: e => e.dias >= 0 ? e.dias : null, f: e => e.dias >= 0 ? num(e.dias) : '—', num: 1 },
    { k: 'pontos', t: 'Pontos', v: e => e.pontos, f: e => num(e.pontos), num: 1 },
    { k: 'valor', t: 'Valor', v: e => e.total, f: e => e.total ? moeda(e.total) : '—', num: 1 },
    { k: 'obra', t: 'Entrega da obra', v: e => e.dataObra, f: e => dataBr(e.dataObra) || '—', num: 1 },
  ], S.statusVist ? fase2.filter(e => (e.status || 'SEM STATUS') === S.statusVist) : fase2,
  { ordem: S.ordemVist, aoClicar: abrirFicha, limite: S.limiteVist, aoMais: () => { S.limiteVist += 100; renderVistorias(escolasDoEscopo()); },
    aoOrdenar: o => { S.ordemVist = o; renderVistorias(escolasDoEscopo()); }, vazio: 'Nenhuma escola da Fase 2 neste recorte.' });
}
$('#vist-status').addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (b) { S.statusVist = b.dataset.v; S.limiteVist = 50; renderVistorias(escolasDoEscopo()); }
});

function renderFora(lista) {
  const fora = lista.filter(naoRecebera);
  $('#fora-sub').textContent = `${plural(fora.length, 'escola', 'escolas')} sem Wi-Fi e com motivo registrado na coluna Observações da planilha.`;
  tabela($('#tabela-fora'), [
    eNome,
    { k: 'motivo', t: 'Motivo (Observações)', v: e => e.obs, f: e => esc(e.obs) },
  ], fora, { ordem: S.ordemFora, aoClicar: abrirFicha, aoOrdenar: o => { S.ordemFora = o; renderFora(escolasDoEscopo()); }, vazio: 'Nenhuma escola deste recorte tem motivo registrado para não receber Wi-Fi.' });
}

/* ------------------------------------------------------------ projeto */
function renderProjeto() {
  const P = D.projeto, r = resumir(E);
  const f1 = E.filter(e => e.fase === 1).reduce((s, e) => s + e.total, 0);
  const f2 = E.filter(e => e.fase === 2).reduce((s, e) => s + e.total, 0);
  $('#projeto').innerHTML = `<div class="projeto">
    <h2>${esc(P.nome)}</h2>
    <div>
      <h3>Contrato</h3>
      <dl class="contas">
        ${[['Órgão', P.orgao], ['Empresa', P.empresa], ['Contrato', P.contrato], ['Fonte do recurso', P.fonte]]
          .map(([t, v]) => `<div><dt>${t}</dt><dd>${esc(v)}</dd></div>`).join('')}
      </dl>
      <h3 style="margin-top:28px">Equipamentos</h3>
      <div class="tabela"><table><thead><tr>${['Categoria', 'Item', 'Modelo', 'Fabricante'].map(t => `<th style="padding:10px 12px">${t}</th>`).join('')}</tr></thead>
      <tbody>${P.equipamentos.map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    </div>
    <div>
      <h3>Execução financeira</h3>
      <dl class="contas">
        <div><dt>Fase 1 (${plural(r.f1, 'escola', 'escolas')})</dt><dd>${moeda(f1)}</dd></div>
        <div><dt>Fase 2 (${plural(r.f2, 'escola', 'escolas')})</dt><dd>${moeda(f2)}</dd></div>
        <div class="total"><dt>Total</dt><dd>${moeda(f1 + f2)}</dd></div>
      </dl>
      <p style="margin-top:14px">Os valores das fases são a soma das colunas de valor da planilha, escola por escola.</p>
    </div>
  </div>`;
}

/* ------------------------------------------------------------ ficha da escola */
function abrirFicha(e) {
  const p = e.parque || {};
  const ln = (t, v) => (v === '' || v === undefined || v === null || v === 0) ? '' : `<div><dt>${t}</dt><dd>${v}</dd></div>`;
  const secao = (t, corpo, nota = '') => corpo.trim() ? `<section><h3>${t}</h3><dl>${corpo}</dl>${nota}</section>` : '';
  const zona = ['Zona urbana', 'Sede em distrito', 'Zona rural'][e.zona];
  const tx = v => v ? esc(titulo(v)) : '';
  $('#ficha-corpo').innerHTML = `
    <p class="ficha-local">${esc(titulo(D.municipios[e.mun]))}, SRE ${esc(titulo(D.sres[e.sre]))}</p>
    <h2 id="ficha-nome">${esc(titulo(e.nome))}</h2>
    <p class="ficha-ids">${[e.inep && 'INEP ' + e.inep, e.codigo && 'Código ' + e.codigo, zona].filter(Boolean).join(', ')}</p>
    <div class="ficha-selos">${seloWifi(e)}${e.fase ? selo('Fase ' + e.fase) : ''}${seloStatus(e.status)}${e.alunos ? seloAt(e) : ''}</div>
    ${secao('Wi-Fi do projeto',
      ln('Porte', e.porte) + ln('Pontos de acesso', num(e.pontos)) + ln('APs internos', e.aps && num(e.aps)) +
      ln('Valor total', e.total && moeda(e.total)) + ln('Capital', e.capital && moeda(e.capital)) + ln('Custeio', e.custeio && moeda(e.custeio)) +
      ln('Entrega da obra', dataBr(e.dataObra)) + ln('Primeira visita NTE', dataBr(e.dataVis1)) + ln('Última visita NTE', dataBr(e.dataVisU)) +
      ln('Dias sem vistoria', e.dias >= 0 ? num(e.dias) : ''),
      '')}
    ${secao('Parque tecnológico',
      ln('Alunos matriculados', p.alunos && num(p.alunos)) + ln('Alunos por dispositivo', e.dispositivos ? nf1.format(alunosPorDisp(e)) : '') +
      ln('Chromebooks de aluno', p.cbAluno) + ln('Chromebooks de professor', p.cbProfessor) + ln('Notebooks', p.notebook) +
      ln('Desktops pregão 81/2021', p.pc81) + ln('Desktops pregão 122/2017', p.pc122) + ln('Desktops pregão 06/2015', p.pc06) +
      ln('Outros desktops', p.pcOutros) + ln('Inservíveis com laudo', (p.inservPc || 0) + (p.inservCb || 0) + (p.inservNb || 0)) +
      ln('Projetores', p.projetores) + ln('Telas interativas', p.telas) + ln('Impressoras', p.impressoras) + ln('Switches', p.switches) +
      ln('Sala de informática', tx(p.salaInfo)) + ln('Desktops na sala', p.desktopsSala) + ln('Rede elétrica e lógica da sala', tx(p.redeSala)))}
    ${secao('Conectividade',
      ln('Atendimento da internet', tx(p.atendimento)) + ln('Links contratados', p.links) +
      ln('Banda via Transferência', p.velTransf && num(p.velTransf) + ' Mbps') + ln('Custo via Transferência', p.precoTransf && moeda(p.precoTransf) + '/mês') +
      ln('Banda via PIEC', p.velPiec && num(p.velPiec) + ' Mbps') + ln('Custo via PIEC', p.precoPiec && moeda(p.precoPiec) + '/mês') +
      ln('Mbps por aluno', e.alunos && e.velocidade ? nf2.format(mbpsPorAluno(e)) : '') + ln('Faixa de velocidade', p.catVel && esc(p.catVel) + ' Mbps') +
      ln('Outras conexões', tx(p.outrasConex)) + ln('Possui Wi-Fi', tx(p.possuiWifi)) + ln('Origem do Wi-Fi', tx(p.origemWifi)) +
      ln('Sinal cobre a escola toda', tx(p.abrangencia)) + ln('APs que faltam', p.apsFaltantes))}
    ${secao('Contato',
      ln('Endereço', esc([titulo(e.endereco), e.numero, titulo(e.bairro)].filter(Boolean).join(', '))) + ln('CEP', esc(e.cep)) +
      ln('Telefone', esc(e.telefone)) + ln('E-mail', e.email && `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>`))}
    ${e.obs ? `<section><h3>Observações</h3><p class="nota">${esc(e.obs)}</p></section>` : ''}
    ${e.origem === 'parque' ? '<p class="nota">Escola presente só no levantamento do parque tecnológico, não na planilha do Wi-Fi.</p>' : ''}`;
  const d = $('#ficha');
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
$('#ficha').addEventListener('click', ev => {
  if (ev.target === ev.currentTarget || ev.target.closest('[data-fechar]')) ev.currentTarget.close();
});

/* ------------------------------------------------------------ busca (paleta) */
let resultados = [], ativo = 0;
function buscar(q) {
  const a = semAcento(q).trim();
  if (!a) return [];
  const sres = D.sres.map((n, i) => [n, i]).filter(([n]) => semAcento(n).includes(a)).slice(0, 3)
    .map(([n, i]) => ({ t: 'SRE ' + titulo(n), tipo: 'Regional', ir: () => irPara({ tipo: 'sre', i }) }));
  const muns = D.municipios.map((n, i) => [n, i]).filter(([n]) => semAcento(n).includes(a)).slice(0, 4)
    .map(([n, i]) => ({ t: titulo(n), sub: 'SRE ' + titulo(D.sres[sreDoMun[i]]), tipo: 'Município', ir: () => irPara({ tipo: 'mun', i }) }));
  const escolas = [];
  for (const e of E) {
    if (escolas.length >= 12 - sres.length - muns.length) break;
    if (e.busca.includes(a)) escolas.push({ t: titulo(e.nome), sub: `${titulo(D.municipios[e.mun])}, INEP ${e.inep || '—'}. ${situacaoWifi(e)}`, tipo: 'Escola', ir: () => abrirFicha(e) });
  }
  return [...sres, ...muns, ...escolas];
}
function renderBusca() {
  $('#busca-res').innerHTML = resultados.length
    ? resultados.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === ativo}"><span>${esc(r.t)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><em>${r.tipo}</em></li>`).join('')
    : ($('#busca').value.trim() ? '<li class="vazio" aria-disabled="true">Nenhum resultado. Tente parte do nome ou o INEP.</li>' : '');
  $('#busca-res [aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}
function abrirBusca() {
  const d = $('#paleta');
  if (d.open) return;
  d.showModal();
  $('#busca').select();
}
function escolher(i) {
  const r = resultados[i];
  if (!r) return;
  $('#paleta').close();
  r.ir();
}
$('#abrir-busca').onclick = abrirBusca;
$('#busca').addEventListener('input', ev => { resultados = buscar(ev.target.value); ativo = 0; renderBusca(); });
$('#busca').addEventListener('keydown', ev => {
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    ativo = (ativo + (ev.key === 'ArrowDown' ? 1 : -1) + resultados.length) % (resultados.length || 1);
    renderBusca();
  } else if (ev.key === 'Enter') { ev.preventDefault(); escolher(ativo); }
});
$('#busca-res').addEventListener('click', ev => { const li = ev.target.closest('li[data-i]'); if (li) escolher(+li.dataset.i); });
$('#paleta').addEventListener('click', ev => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
document.addEventListener('keydown', ev => {
  const digitando = ev.target.closest?.('input, select, textarea');
  if (ev.key === 'Escape' && !digitando && ehAtlas(S.aba) && !document.querySelector('dialog[open]')) return subir();
  if ((ev.key === '/' && !digitando) || (ev.key.toLowerCase() === 'k' && (ev.ctrlKey || ev.metaKey))) {
    ev.preventDefault();
    abrirBusca();
  }
});

/* ------------------------------------------------------------ inclinação 3D */
// Painéis [data-tilt] inclinam de leve seguindo o mouse; a transição CSS suaviza (e é interrompível).
const mouseFino = matchMedia('(hover: hover) and (pointer: fine)');
let inclinado = null;
const endireitar = () => { if (inclinado) inclinado.style.transform = ''; inclinado = null; };
document.addEventListener('pointermove', ev => {
  if (!mouseFino.matches || semMovimento.matches) return;
  const el = ev.target.closest?.('[data-tilt]');
  if (el !== inclinado) endireitar();
  if (!el) return;
  inclinado = el;
  const r = el.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
  el.style.transform = `perspective(1000px) rotateX(${(-y * 3).toFixed(2)}deg) rotateY(${(x * 4).toFixed(2)}deg) translateZ(4px)`;
}, { passive: true });
document.addEventListener('pointerout', ev => { if (!ev.relatedTarget) endireitar(); });

/* ------------------------------------------------------------ abas, tema, início */
const RENDER = { escolas: renderEscolas, projeto: renderProjeto };
const ehAtlas = aba => aba in VISOES;   // Geral, Wi-Fi e Parque usam o mesmo atlas
function trocarAba(aba) {
  if (S.aba === aba) return;
  const aplicar = () => {
    S.aba = aba;
    $$('.abas [role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === aba));
    $$('[data-painel]').forEach(p => { p.hidden = p.id !== (ehAtlas(aba) ? 'atlas' : aba); });
    if (!ehAtlas(aba)) return RENDER[aba]();
    if (S.visao !== aba) {
      S.visao = aba;
      S.metrica = metricaDaVisao(aba);
      preencherMetricas();
      renderAtlas();
    }
    requestAnimationFrame(redimensionar);
  };
  // Aba oculta ou troca rápida: o navegador pula a animação, mas o conteúdo troca do mesmo jeito.
  if (document.startViewTransition && !semMovimento.matches) document.startViewTransition(aplicar).ready.catch(() => {});
  else aplicar();
}
$('.abas').addEventListener('click', ev => { const b = ev.target.closest('[data-aba]'); if (b) trocarAba(b.dataset.aba); });
document.addEventListener('click', ev => { if (ev.target.closest('[data-imprimir]')) window.print(); });

const escuro = () => raiz.dataset.theme ? raiz.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
const repintar = () => { if (ehAtlas(S.aba)) renderAtlas(); };
$('#tema').onclick = () => { raiz.dataset.theme = escuro() ? 'light' : 'dark'; guardar('tema', raiz.dataset.theme); repintar(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repintar);

const redimensionar = () => { mapa?.resize(); graficos.forEach(g => g.resize()); };
let tRedim;
addEventListener('resize', () => { clearTimeout(tRedim); tRedim = setTimeout(redimensionar, 120); });
addEventListener('beforeprint', redimensionar);

$('#conta-escolas').textContent = num(E.length);
$('#rodape').textContent = `Demonstração com DADOS FICTÍCIOS (gerar_dados_demo.py): escolas, códigos e números são inventados; só a geografia (municípios e regionais) é real. Gerados em ${new Date(D.geradoEm).toLocaleString('pt-BR')}. ${num(E.length)} escolas em ${num(D.municipios.length)} municípios e ${D.sres.length} regionais.`;
preencherMetricas();
ligarFiltros();
renderAtlas();
