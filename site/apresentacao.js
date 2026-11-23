'use strict';
/* Modo apresentação: abertura → as 47 regionais em ordem geográfica → visão ampla.
   Usa o que app.js já define (D, G, E, resumir, METRICAS, dadosMapa, animar, N, ...). */

const DURACAO = { abertura: 9000, sre: 8000, panorama: 13000 };
const AP = { slides: [], i: 0, vez: 0, mapa: null, mini: null, grafico: null, anim: null, pausado: false, quieto: 0, is3d: false, base: null };
const ap = $('#ap'), painel = $('#ap-painel');
const espera = ms => new Promise(r => setTimeout(r, ms));
const ordinal = n => `${n}ª`;
// Centro aproximado de cada município (média dos vértices do contorno externo).
const centroMun = new Map(G.mapa.features.map(f => {
  const anel = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
  return [f.properties.name, [anel.reduce((s, p) => s + p[0], 0) / anel.length, anel.reduce((s, p) => s + p[1], 0) / anel.length]];
}));

/** Centro aproximado de cada SRE e a ordem do passeio: vizinho mais próximo, começando pelo norte. */
function roteiro() {
  const soma = D.sres.map(() => [0, 0, 0]);
  for (const [nome, [x, y]] of centroMun) {
    for (const s of G.mun[nome]?.[1] || []) { soma[s][0] += x; soma[s][1] += y; soma[s][2]++; }
  }
  const c = soma.map(([x, y, n]) => [x / n, y / n]);
  const resta = new Set(D.sres.keys());
  let atual = [...resta].reduce((a, b) => (c[b][1] > c[a][1] ? b : a));
  const ordem = [];
  while (atual >= 0) {
    resta.delete(atual);
    ordem.push(atual);
    let prox = -1, dmin = Infinity;
    for (const j of resta) {
      const d = (c[j][0] - c[atual][0]) ** 2 + (c[j][1] - c[atual][1]) ** 2;
      if (d < dmin) { dmin = d; prox = j; }
    }
    atual = prox;
  }
  return [{ tipo: 'abertura' }, ...ordem.map((i, k) => ({ tipo: 'sre', i, k: k + 1, centro: c[i] })), { tipo: 'panorama' }];
}

/* ------------------------------------------------------------ mapa grande (3D, ou 2D sem WebGL) */
function pontoMundo(lonlat) {
  try { return Array.from(AP.mapa.getModel().getSeriesByIndex(0).coordinateSystem.dataToPoint([...lonlat, 0])); }
  catch { return [0, 0, 0]; }
}
function camera(sl) {
  if (sl.tipo === 'abertura') return { alpha: 58, beta: 0, distance: 140, center: [0, 0, 0], autoRotate: true, autoRotateSpeed: 3 };
  if (sl.tipo === 'panorama') return { alpha: 32, beta: 25, distance: 150, center: [0, 0, 0], autoRotate: true, autoRotateSpeed: 5 };
  // cada regional chega de um ângulo um pouco diferente: a câmera "passeia" em vez de só transladar
  return { alpha: 50, beta: ((sl.k * 37) % 70) - 35, distance: 52, center: pontoMundo(sl.centro), autoRotate: false };
}
function dadosSlide(sl) {
  const nesta = sl.tipo === 'sre' ? new Set(E.filter(e => e.sre === sl.i).map(e => String(D.munIbge[e.mun]))) : null;
  const apagado = cor('--vazio');
  return AP.base.map(d => {
    const dentro = !nesta || nesta.has(d.name);
    const item = { name: d.name, value: d.value, n: d.n };
    if (AP.is3d) item.height = dentro ? (nesta ? 1.5 + d.t * 7 : 0.5 + d.t * 4) : 0.25;
    item.itemStyle = AP.is3d ? { color: dentro ? d.cor : apagado } : { areaColor: dentro ? d.cor : apagado };
    return item;
  });
}
function desenharMapa(sl) {
  const m = METRICAS[S.metrica];
  const tooltip = { ...tooltipBase(), formatter: p => p.data ? `<b>${esc(G.mun[p.name]?.[0] || '')}</b><br>${m.t}: <b>${m.f(p.data.value)}</b>` : '' };
  const serie = AP.is3d ? {
    type: 'map3D', map: mapaDoRecorte(-1), regionHeight: 0.3, shading: 'lambert', data: AP.atual || plano(dadosSlide(sl)),
    itemStyle: { color: cor('--vazio'), borderWidth: 0.4, borderColor: cor('--papel') },
    emphasis: { label: { show: false }, itemStyle: { color: cor('--ouro') } }, label: { show: false },
    light: { main: { intensity: 1.2, alpha: 55, beta: 30, shadow: true, shadowQuality: 'high' }, ambient: { intensity: 0.5 } },
    viewControl: { ...camera(sl), damping: 0.9, animation: !semMovimento.matches, animationDurationUpdate: 2200, animationEasingUpdate: 'cubicInOut',
      minDistance: 30, maxDistance: 240, panMouseButton: 'right' },
    postEffect: { enable: true, SSAO: { enable: true, radius: 2, intensity: 1.2, quality: 'medium' } },
    temporalSuperSampling: { enable: true },
    animationDurationUpdate: 1200, animationEasingUpdate: 'cubicOut',
  } : {
    type: 'map', map: sl.tipo === 'sre' ? mapaDoRecorte(sl.i) : mapaDoRecorte(-1), roam: false, data: dadosSlide(sl),
    itemStyle: { areaColor: cor('--vazio'), borderColor: cor('--papel'), borderWidth: 0.5 },
    emphasis: { itemStyle: { areaColor: cor('--ouro') }, label: { show: false } }, select: { disabled: true }, label: { show: false },
    animationDurationUpdate: 600,
  };
  AP.mapa.setOption({ tooltip, series: [serie] }, { replaceMerge: ['series'] });
  if (AP.is3d) crescer(sl);
}

/* A regional nova brota: os municípios sobem em onda a partir do centro dela, passam um pouco
   do ponto e assentam, ganhando cor enquanto sobem; a anterior afunda ao mesmo tempo.
   O map3D não anima altura sozinho, então cada quadro redesenha (≈20 ms): ~30 quadros por segundo. */
const plano = dados => dados.map(d => ({ ...d, height: 0.15, itemStyle: { color: cor('--vazio') } }));
const passaEAssenta = t => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;   // ease-out com ~8% de passagem
const assenta = t => 1 - (1 - t) ** 3;
function crescer(sl) {
  cancelAnimationFrame(AP.quadro);
  const alvo = dadosSlide(sl);
  const de = new Map((AP.atual || plano(alvo)).map(d => [d.name, d]));
  if (semMovimento.matches) { AP.atual = alvo; AP.mapa.setOption({ series: [{ data: alvo }] }); return; }
  // atraso pela distância ao centro da regional (ou do estado, na abertura e no panorama)
  const c = sl.centro || [-44.6, -18.5];
  const itens = alvo.map(d => {
    const p = centroMun.get(d.name) || c;
    return { d, a: de.get(d.name) || d, atraso: Math.min(1, Math.hypot(p[0] - c[0], p[1] - c[1]) / (sl.centro ? 2.2 : 7)) * (sl.centro ? 420 : 900) };
  });
  const DUR = 950, fimTotal = DUR + (sl.centro ? 420 : 900), t0 = performance.now();
  let ultimo = -1e9;
  const passo = agora => {
    const fim = agora - t0 >= fimTotal;
    if (fim || agora - ultimo >= 32) {
      ultimo = agora;
      AP.atual = itens.map(({ d, a, atraso }) => {
        const t = Math.min(1, Math.max(0, (agora - t0 - atraso) / DUR));
        const h0 = a.height, h1 = d.height, e = h1 > h0 ? passaEAssenta(t) : assenta(t);
        return { ...d, height: Math.max(0.1, h0 + (h1 - h0) * e), itemStyle: { color: misturar(a.itemStyle.color, d.itemStyle.color, Math.min(1, t * 1.5)) } };
      });
      AP.mapa?.setOption({ series: [{ data: AP.atual }] });
    }
    if (!fim && AP.mapa) AP.quadro = requestAnimationFrame(passo);
  };
  AP.quadro = requestAnimationFrame(passo);
}

/* minimapa 2D: onde fica a regional */
function desenharMini(sl) {
  const nesta = sl.tipo === 'sre' ? new Set(E.filter(e => e.sre === sl.i).map(e => String(D.munIbge[e.mun]))) : null;
  AP.mini.setOption({ series: [{
    type: 'map', map: mapaDoRecorte(-1), roam: false, silent: true, label: { show: false },
    itemStyle: { areaColor: cor('--linha'), borderColor: cor('--linha'), borderWidth: 0.3 },
    data: nesta ? [...nesta].map(name => ({ name, itemStyle: { areaColor: cor('--ouro'), borderColor: cor('--ouro') } })) : [],
    animationDurationUpdate: 500,
  }] }, { replaceMerge: ['series'] });
}

/* ------------------------------------------------------------ painel de texto e gráficos */
const numero = (k, v, f, rot) => `<div><b>${N(k, v, f)}</b><span>${rot}</span></div>`;
function htmlSlide(sl) {
  if (sl.tipo === 'abertura' || sl.tipo === 'panorama') {
    const r = resumir(E), melhor = [...RES_SRE].sort((a, b) => b.cobertura - a.cobertura);
    const abre = sl.tipo === 'abertura';
    return `
      <p class="ap-sobre">${abre ? 'Apresentação · dados fictícios' : 'Visão ampla'}</p>
      <h2 class="ap-titulo">${abre ? 'Infraestrutura escolar de Minas Gerais' : 'Minas Gerais inteira'}</h2>
      <p class="ap-frase">${abre
        ? `A escola tem Wi-Fi, máquina para usar e banda que aguente? Vamos passar pelas ${D.sres.length} regionais, uma a uma.`
        : `A maior cobertura está na SRE ${esc(titulo(melhor[0].nome))} (${nf1.format(melhor[0].cobertura)}%) e a menor na SRE ${esc(titulo(melhor.at(-1).nome))} (${nf1.format(melhor.at(-1).cobertura)}%).`}</p>
      <div class="ap-numeros">
        ${numero('ap:escolas', r.escolas, 'int', `escolas em ${num(r.muns.size)} municípios`)}
        ${numero('ap:cob', r.cobertura, 'pct', 'com Wi-Fi do projeto')}
        ${numero('ap:apd', r.alunosPorDisp, 'n1', 'alunos por dispositivo')}
        ${numero('ap:mpa', r.mbpsPorAluno, 'n2', 'Mbps por aluno')}
      </div>
      ${abre ? '' : '<div class="ap-bloco"><h3>Cobertura Wi-Fi: as 5 maiores e as 5 menores regionais</h3><div class="ap-grafico" id="ap-g"></div></div>'}`;
  }
  const r = RES_SRE[sl.i], avaliadas = r.atOk + r.atRuim;
  const pos = 1 + RES_SRE.filter(x => x.cobertura > r.cobertura).length;
  return `
    <p class="ap-sobre">Regional ${sl.k} de ${D.sres.length}</p>
    <h2 class="ap-titulo">SRE ${esc(titulo(r.nome))}</h2>
    <p class="ap-frase">${r.com === r.escolas ? 'Todas as escolas têm Wi-Fi do projeto.' : `${plural(r.sem, 'escola ainda não tem', 'escolas ainda não têm')} Wi-Fi do projeto${r.nr ? `, e ${num(r.nr)} não ${r.nr === 1 ? 'receberá' : 'receberão'}` : ''}.`}
      ${avaliadas ? `A internet é insuficiente em ${pct(r.atRuim, avaliadas)} das escolas avaliadas.` : ''}
      É a ${ordinal(pos)} regional em cobertura.</p>
    <div class="ap-numeros">
      ${numero('ap:escolas', r.escolas, 'int', `escolas em ${plural(r.muns.size, 'município', 'municípios')}`)}
      ${numero('ap:cob', r.cobertura, 'pct', 'com Wi-Fi do projeto')}
      ${numero('ap:apd', r.alunosPorDisp, 'n1', 'alunos por dispositivo')}
      ${numero('ap:mpa', r.mbpsPorAluno, 'n2', 'Mbps por aluno')}
    </div>
    <div class="ap-bloco"><h3>Internet das escolas</h3>${barraComposicao([
      { t: 'Adequada', v: r.atOk, c: 'var(--ok)' }, { t: 'Insuficiente', v: r.atRuim, c: 'var(--ruim)' }, { t: 'Sem avaliação', v: r.atSem, c: 'var(--linha)' }])}</div>
    <div class="ap-bloco"><h3 id="ap-g-titulo"></h3><div class="ap-grafico" id="ap-g"></div></div>`;
}

function desenharGrafico(sl) {
  const el = $('#ap-g');
  AP.grafico?.dispose();
  AP.grafico = null;
  if (!el || !window.echarts) return;
  let linhas, titulo_, corBarra = cor('--ferrugem'), fmt = num;
  if (sl.tipo === 'panorama') {
    const ord = [...RES_SRE].sort((a, b) => b.cobertura - a.cobertura);
    linhas = [...ord.slice(0, 5), ...ord.slice(-5)].map(r => [titulo(r.nome), r.cobertura]);
    fmt = v => nf1.format(v) + '%';
  } else {
    const porMun = [...agrupar(E.filter(e => e.sre === sl.i), e => e.mun)].map(([mi, l]) => ({ nome: titulo(D.municipios[mi]), r: resumir(l) }));
    const campo = porMun.some(x => x.r.sem) ? ['sem', 'Municípios com mais escolas sem Wi-Fi'] : ['atRuim', 'Municípios com mais escolas com internet insuficiente'];
    titulo_ = campo[1];
    linhas = porMun.sort((a, b) => b.r[campo[0]] - a.r[campo[0]]).slice(0, 5).filter(x => x.r[campo[0]]).map(x => [x.nome, x.r[campo[0]]]);
    if (!linhas.length) { titulo_ = 'Municípios com mais escolas'; corBarra = cor('--mata'); linhas = porMun.sort((a, b) => b.r.escolas - a.r.escolas).slice(0, 5).map(x => [x.nome, x.r.escolas]); }
  }
  if ($('#ap-g-titulo')) $('#ap-g-titulo').textContent = titulo_;
  AP.grafico = echarts.init(el);
  const ax = eixos(), fs = Math.max(12, Math.min(19, Math.round(innerHeight / 58)));
  AP.grafico.setOption({
    animationDuration: 900, animationEasing: 'cubicOut', animationDelay: i => 250 + i * 70,
    grid: { left: fs * 11.5, right: fs * 4.5, top: 4, bottom: 4 },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: linhas.map(l => l[0]), ...ax, axisLine: { show: false }, axisLabel: { ...ax.axisLabel, fontSize: fs, color: cor('--tinta-2') } },
    series: [{ type: 'bar', data: linhas.map(([, v], i) => ({ value: v, itemStyle: { color: sl.tipo === 'panorama' ? cor(i < 5 ? '--mata' : '--ferrugem') : corBarra } })),
      barMaxWidth: Math.round(fs * 1.3), itemStyle: { borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: cor('--tinta'), fontSize: fs, fontWeight: 600, formatter: p => fmt(p.value) } }],
  });
}

/* ------------------------------------------------------------ andamento */
async function irSlide(i) {
  const vez = ++AP.vez;
  AP.i = (i + AP.slides.length) % AP.slides.length;
  const sl = AP.slides[AP.i];
  painel.classList.add('saindo');
  await espera(semMovimento.matches ? 0 : 200);
  if (vez !== AP.vez) return;   // clicaram de novo no meio da troca
  painel.innerHTML = htmlSlide(sl);
  painel.classList.remove('saindo');
  animar(painel);
  desenharMapa(sl);
  desenharMini(sl);
  desenharGrafico(sl);
  $('#ap-conta').textContent = `${AP.i + 1} / ${AP.slides.length}`;
  progresso(DURACAO[sl.tipo]);
}

/** A barra do slide atual é a própria contagem de tempo: quando a animação termina, passa para o próximo. */
function progresso(ms) {
  const total = AP.slides.length;
  $('#ap-feito').style.transform = `scaleX(${AP.i / total})`;
  const fatia = $('#ap-fatia');
  fatia.style.left = `${(AP.i / total) * 100}%`;
  fatia.style.width = `${100 / total}%`;
  AP.anim?.cancel();
  AP.anim = fatia.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
  AP.anim.onfinish = () => irSlide(AP.i + 1);
  if (AP.pausado) AP.anim.pause();
}

function pausar(sim = !AP.pausado) {
  AP.pausado = sim;
  if (sim) AP.anim?.pause(); else AP.anim?.play();
  const b = $('[data-ap="play"]');
  b.setAttribute('aria-label', sim ? 'Continuar' : 'Pausar');
  b.dataset.estado = sim ? 'pausado' : 'tocando';
}

async function abrirApresentacao() {
  if (!window.echarts) return;
  AP.slides = roteiro();
  AP.is3d = pode3d();
  AP.base = dadosMapa(METRICAS[S.metrica], -1).dados;
  // O mapa da página para enquanto a apresentação usa a placa de vídeo.
  mapa?.dispose(); mapa = null; chaveMapa = '';
  ap.hidden = false;
  document.body.style.overflow = 'hidden';
  try { await ap.requestFullscreen?.(); } catch { /* sem tela cheia: segue na janela */ }
  AP.mapa = echarts.init($('#ap-mapa'));
  AP.mini = echarts.init($('#ap-mini'));
  $('#ap-legenda').textContent = METRICAS[S.metrica].t;
  pausar(false);
  acordar();
  irSlide(0);
}

function fecharApresentacao() {
  if (ap.hidden) return;
  AP.vez++;
  AP.anim?.cancel();
  cancelAnimationFrame(AP.quadro);
  AP.atual = null;
  [AP.mapa, AP.mini, AP.grafico].forEach(c => c?.dispose());
  AP.mapa = AP.mini = AP.grafico = null;
  ap.hidden = true;
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (ehAtlas(S.aba)) renderMapa();
  $('#apresentar').focus();
}

/* controles somem com o mouse parado, voltam ao mexer */
function acordar() {
  ap.classList.remove('quieto');
  clearTimeout(AP.quieto);
  AP.quieto = setTimeout(() => ap.classList.add('quieto'), 2600);
}

$('#apresentar').onclick = abrirApresentacao;
$('#ap-controles').addEventListener('click', ev => {
  const b = ev.target.closest('[data-ap]');
  if (!b) return;
  ({ ant: () => irSlide(AP.i - 1), prox: () => irSlide(AP.i + 1), play: () => pausar(), sair: fecharApresentacao })[b.dataset.ap]();
});
ap.addEventListener('pointermove', acordar, { passive: true });
// Teclado tem prioridade sobre os atalhos da página enquanto a apresentação está aberta.
addEventListener('keydown', ev => {
  if (ap.hidden) return;
  const acao = { ArrowRight: () => irSlide(AP.i + 1), PageDown: () => irSlide(AP.i + 1), ArrowLeft: () => irSlide(AP.i - 1),
    PageUp: () => irSlide(AP.i - 1), ' ': () => pausar(), Escape: fecharApresentacao, Home: () => irSlide(0) }[ev.key];
  if (!acao) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  acordar();
  acao();
}, true);
// Sair da tela cheia (Esc do navegador) encerra a apresentação; aba escondida pausa.
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) fecharApresentacao(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !ap.hidden) pausar(true); });
addEventListener('resize', () => { AP.mapa?.resize(); AP.mini?.resize(); AP.grafico?.resize(); });
