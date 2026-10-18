// Tidslinjen, uppdatering för valt år (inklusive lager som laddas vid behov) och färgläggning.
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

// ---------- Tidslinje ----------

let staplar = [];

function ritaHistogram() {
  // Varje snävt daterad inskrift fördelas jämnt över sitt spann, så en sten
  // daterad 1010–1050 bidrar med en fjärdedel till vart och ett av fyra årtionden.
  const n = (AR_MAX - AR_MIN) / 10;
  const antal = new Float32Array(n);
  for (const r of runor) {
    if (!lage.typer.has(r.k) || r.b - r.a > SNAV) continue;
    const spann = Math.max(1, r.b - r.a);
    for (let d = Math.floor((r.a - AR_MIN) / 10); d <= Math.floor((r.b - AR_MIN) / 10); d++) {
      if (d < 0 || d >= n) continue;
      const fran = Math.max(r.a, AR_MIN + d * 10), till = Math.min(r.b === r.a ? r.a + 1 : r.b, AR_MIN + d * 10 + 10);
      antal[d] += Math.max(0, till - fran) / spann;
    }
  }
  const max = Math.max(1, ...antal);
  const svg = $('histogram');
  svg.setAttribute('viewBox', `0 0 ${n} 64`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = '';
  staplar = [];
  antal.forEach((v, d) => {
    const h = v > 0 ? Math.max(1, (v / max) * 62) : 0;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', d + 0.1); rect.setAttribute('width', 0.8);
    rect.setAttribute('y', 64 - h); rect.setAttribute('height', h);
    svg.appendChild(rect);
    staplar.push({ rect, v, fran: AR_MIN + d * 10 });
  });
}

function ritaSkala() {
  const skala = $('skala');
  for (let ar = 200; ar <= 1500; ar += 100) {
    const s = document.createElement('span');
    s.style.left = `${((ar - AR_MIN) / (AR_MAX - AR_MIN)) * 100}%`;
    s.textContent = ar;
    skala.appendChild(s);
  }
  const markor = document.createElement('div');
  markor.className = 'markor'; markor.id = 'markor';
  skala.parentElement.appendChild(markor);

  // Epokband under histogrammet; uppdatera() markerar den epok året ligger i.
  const band = document.createElement('div');
  band.className = 'epokband'; band.id = 'epokband';
  const toner = ['--sedan', '--guld', '--grov', '--accent', '--sedan', '--guld'];
  const kort = { 'Romersk järnålder': 'Romartid', Folkvandringstid: 'Folkvandring', 'Nyare tid': '' };
  let fran = AR_MIN;
  EPOKER.forEach(([slut, namn], i) => {
    const till = Math.min(slut, AR_MAX);
    if (till <= fran) return;
    const s = document.createElement('span');
    s.style.left = `${((fran - AR_MIN) / (AR_MAX - AR_MIN)) * 100}%`;
    s.style.width = `${((till - fran) / (AR_MAX - AR_MIN)) * 100}%`;
    s.style.background = `color-mix(in srgb, var(${toner[i]}) 22%, transparent)`;
    s.textContent = kort[namn] ?? namn;
    s.title = `${namn} ${fran}–${till}`;
    s.dataset.fran = fran; s.dataset.till = till;
    band.appendChild(s);
    fran = till;
  });
  skala.parentElement.insertBefore(band, $('ar'));
}

function kopplaTidslinje() {
  const spar = document.querySelector('.spar');
  const arVid = (e) => {
    const b = spar.getBoundingClientRect();
    return Math.round(AR_MIN + Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * (AR_MAX - AR_MIN));
  };
  let drar = false;
  spar.addEventListener('pointerdown', (e) => { drar = true; spar.setPointerCapture(e.pointerId); stoppa(); sattAr(arVid(e)); });
  spar.addEventListener('pointermove', (e) => {
    if (drar) sattAr(arVid(e));
    visaStapeltips(arVid(e), e.clientX - spar.getBoundingClientRect().left);
  });
  spar.addEventListener('pointerup', () => { drar = false; });
  spar.addEventListener('pointerleave', () => document.querySelector('.tips')?.remove());
  $('ar').style.pointerEvents = 'none';                      // reglaget finns kvar för tangentbordet
  $('ar').addEventListener('input', (e) => { stoppa(); sattAr(+e.target.value); });
  $('spela').addEventListener('click', () => (lage.spelar ? stoppa() : spela()));
}

function visaStapeltips(ar, x) {
  const s = staplar[Math.min(staplar.length - 1, Math.floor((ar - AR_MIN) / 10))];
  let el = document.querySelector('.tips');
  if (!el) { el = document.createElement('div'); el.className = 'tips'; document.querySelector('.spar').appendChild(el); }
  el.style.left = `${x}px`;
  el.style.bottom = '84px';
  el.textContent = `${s.fran}-talet: ca ${Math.round(s.v)} snävt daterade`;
}

let timer;
function spela() {
  if (lage.ar >= AR_MAX) sattAr(AR_MIN);
  lage.spelar = true;
  $('spela').textContent = '❚❚'; $('spela').setAttribute('aria-label', 'Pausa');
  timer = setInterval(() => {
    const nasta = lage.ar + +$('fart').value;
    if (nasta >= AR_MAX) { sattAr(AR_MAX); stoppa(); } else sattAr(nasta);
  }, 50);
}
function stoppa() {
  lage.spelar = false;
  clearInterval(timer);
  $('spela').textContent = '▶'; $('spela').setAttribute('aria-label', 'Spela upp');
}

// ---------- Uppdatering ----------

// Tunga lager hämtas först när de slås på (i panelen, av en berättelse eller via en delad länk),
// så att den som bara tittar på runstenarna slipper ladda ner omkring 13 MB. Ett lager som läggs
// till sent flyttas in under runstenarna, oavsett i vilken ordning lagren råkar laddas.
const LATA_LAGER = {
  vagar: ['vagar', (d) => { vagar = d; laggTillVagar(); }],
  bygd: ['ortnamn', (d) => { ortnamn = d; laggTillBygd(); }],
  gravar: ['gravfalt', (d) => { gravfalt = d; laggTillGravfalt(); }],
  sjofart: ['sjofart', (d) => { sjofart = d; laggTillSjofart(); }],
  forsvar: ['forsvar', (d) => { forsvar = d; laggTillForsvar(); }],
  mynt: ['mynt', (d) => { mynt = d; laggTillMynt(); }],
  kult: ['kult', (d) => { kult = d; laggTillKult(); }],
  kyrkor: ['kyrkor', (d) => { kyrkor = d; laggTillKyrkor(); }],
};
const laddade = new Map();   // lagernyckel → 'laddar' | 'klar' | 'fel'

function laddaLager(nyckel) {
  if (['laddar', 'klar'].includes(laddade.get(nyckel))) return;   // efter ett fel försöker vi igen nästa gång
  const [fil, lagg] = LATA_LAGER[nyckel];
  laddade.set(nyckel, 'laddar');
  const rad = document.querySelector(`#visa-${nyckel}`)?.closest('.rad');
  rad?.classList.remove('fel');
  rad?.classList.add('laddar');
  fetch(`data/${fil}.json`, { cache: 'no-cache' }).then((s) => s.json()).then((d) => {
    const fore = new Set(karta.getStyle().layers.map((l) => l.id));
    lagg(d);
    for (const id of karta.getStyle().layers.map((l) => l.id)) {
      if (fore.has(id)) continue;
      const ordning = karta.getStyle().layers.map((l) => l.id);
      if (ordning.indexOf(id) > ordning.indexOf('runor')) karta.moveLayer(id, 'runor');
    }
    laddade.set(nyckel, 'klar');
    ritaVagar();
    uppdatera();
  }).catch((fel) => {
    console.error(fel);
    laddade.set(nyckel, 'fel');
    rad?.classList.add('fel');
  }).finally(() => rad?.classList.remove('laddar'));
}

let vantar = false;
function sattAr(ar) {
  lage.ar = Math.min(AR_MAX, Math.max(AR_MIN, ar));
  if (vantar) return;
  vantar = true;
  requestAnimationFrame(() => { vantar = false; uppdatera(); });
}

function uppdatera() {
  if (!klar) return;
  for (const nyckel of Object.keys(LATA_LAGER)) if (lage[nyckel] && laddade.get(nyckel) !== 'fel') laddaLager(nyckel);
  const Y = lage.ar;
  ritaInskrifter();
  ritaLeder();
  ritaStrand();
  ritaBygd();
  ritaGravfalt();
  ritaOdegardar();
  ritaKult();
  ritaKyrkor();
  ritaFardnamn();
  ritaSjofart();
  ritaForsvar();
  ritaSkatter();
  ritaMynt();

  let nu = 0, sedan = 0, grov = 0, borta = 0, resande = 0;
  const perMal = {};
  for (const r of runor) {
    if (!lage.typer.has(r.k) || r.a > Y) continue;
    if (r.fs ? !lage.forsvunna : !lage.bevarade) continue;
    if (r.fs) borta++;
    if (r.rs) { resande++; for (const k of r.rs) perMal[k] = (perMal[k] || 0) + 1; }
    if (r.b < Y) sedan++; else if (r.b - r.a <= SNAV) nu++; else grov++;
  }
  let nOrter = 0;
  for (const o of orter) {
    const syns = lage.orter && o.a <= Y && (o.b === null || o.b >= Y);
    o.el.classList.toggle('dold', !syns);
    if (syns) nOrter++;
  }
  const tal = (n) => n.toLocaleString('sv-SE');
  satt('antal-nu', tal(nu));
  satt('antal-sedan', tal(sedan));
  satt('antal-grov', tal(grov));
  satt('antal-borta', tal(borta));
  satt('antal-resor', tal(resande));
  karta.getSource('resmal')?.setData({
    type: 'FeatureCollection',
    features: Object.entries(resmal).filter(([k]) => perMal[k]).map(([k, m]) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [m.x, m.y] }, properties: { t: `${m.n} · ${perMal[k]}` },
    })),
  });
  satt('antal-orter', tal(nOrter));
  satt('antal-leder', lage.leder ? leder.filter((l) => l.a <= Y && (l.b === null || l.b >= Y)).length : 0);

  $('ar-tal').textContent = Y;
  for (const el of document.querySelectorAll('.valt-ar')) el.textContent = Y;
  $('ar-epok').textContent = EPOKER.find(([slut]) => Y < slut)[1];
  $('ar').value = Y;
  $('markor').style.left = `calc(${((Y - AR_MIN) / (AR_MAX - AR_MIN)) * 100}% - 1px)`;
  for (const s of staplar) {
    s.rect.setAttribute('class', Y >= s.fran + 10 ? 'passerad' : Y >= s.fran ? 'aktiv' : '');
  }
  for (const s of $('epokband').children) s.classList.toggle('aktiv', Y >= +s.dataset.fran && Y < +s.dataset.till);
  if (tidsbilder.length) ritaTidsbild();
  skrivAdress();
}

// ---------- Färgläggning per stil eller ristare ----------

function ritaFarglegend() {
  const lista = $('farglegend');
  document.body.dataset.farg = lage.farg;
  if (lage.farg === 'tid') { lista.hidden = true; lista.innerHTML = ''; return; }
  const grupper = Array.from({ length: 10 }, () => []);
  runor.forEach((r, i) => { if (lage.typer.has(r.k)) grupper[kategori(r, lage.farg)].push(i); });
  const namn = lage.farg === 'stil'
    ? [...STILAR.map(([, n, ar]) => [n, ar]), ['Annan stil', ''], ['Ingen stil angiven', '']]
    : [...toppristare.map((n) => [n, '']), ['Övriga ristare', ''], ['Ingen ristare känd', '']];
  const farger = [...KULORER, css('--annan'), css('--grov')];
  lista.innerHTML = namn.map(([n, under], k) => (grupper[k].length ? `
    <li><button type="button" data-k="${k}">
      <i style="background:${farger[k]}"></i><span>${esc(n)}${under ? ` <small>${under}</small>` : ''}</span>
      <small>${grupper[k].length.toLocaleString('sv-SE')}</small></button></li>` : '')).join('');
  lista.hidden = false;
  lista.onclick = (e) => {
    const knapp = e.target.closest('button');
    if (!knapp) return;
    const k = +knapp.dataset.k;
    markera(grupper[k], `${lage.farg === 'stil' ? 'Stil' : 'Ristare'}: ${namn[k][0]}`);
  };
}
