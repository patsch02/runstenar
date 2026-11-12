// Läsning ord för ord: runor, translitterering, normaliserad text och ordförklaring uppställda mot varandra.
// Används både i detaljrutan (index.html) och på inskrifternas egna sidor (sten/*.html) och är därför
// fristående från de andra filerna i js/.

// ---------- Läsning ----------

// Runraderna. Runorna återskapas ur translittereringen med standardformer (långkvistrunor för vikingatid):
// vilka former ristaren faktiskt använde står inte i databasen. Versaler i translittereringen är latinska
// bokstäver i inskriften och lämnas som de är; kapitäler (ᴀ, ɢ …) är äldre runor i yngre inskrifter.
const RUNRAD_ALDRE = { f: 'ᚠ', u: 'ᚢ', þ: 'ᚦ', a: 'ᚨ', r: 'ᚱ', k: 'ᚲ', g: 'ᚷ', w: 'ᚹ', h: 'ᚺ', n: 'ᚾ', i: 'ᛁ', j: 'ᛃ',
  ï: 'ᛇ', p: 'ᛈ', z: 'ᛉ', ʀ: 'ᛉ', s: 'ᛊ', t: 'ᛏ', b: 'ᛒ', e: 'ᛖ', m: 'ᛗ', l: 'ᛚ', ŋ: 'ᛜ', d: 'ᛞ', o: 'ᛟ', ᴀ: 'ᛡ' };
const RUNRAD_YNGRE = { f: 'ᚠ', u: 'ᚢ', þ: 'ᚦ', o: 'ᚬ', ą: 'ᚬ', r: 'ᚱ', k: 'ᚴ', h: 'ᚼ', n: 'ᚾ', i: 'ᛁ', a: 'ᛅ', s: 'ᛋ',
  t: 'ᛏ', b: 'ᛒ', m: 'ᛘ', l: 'ᛚ', ʀ: 'ᛦ', e: 'ᛂ', g: 'ᚵ', y: 'ᚤ', d: 'ᛑ', p: 'ᛔ', v: 'ᚡ', æ: 'ᛅ', ø: 'ᚯ', ð: 'ᚧ',
  w: 'ᚹ', ᴀ: 'ᛡ', ɢ: 'ᚷ', ᴍ: 'ᛗ', ᴏ: 'ᛟ', ᴇ: 'ᛖ', ᴅ: 'ᛞ', ʜ: 'ᚺ', ɴ: 'ᚾ', ʟ: 'ᛚ', ᴘ: 'ᛈ', ʙ: 'ᛒ' };
const RUNRAD_MEDELTID = { ...RUNRAD_YNGRE, a: 'ᛆ', æ: 'ᛅ', o: 'ᚮ', ø: 'ᚯ', ǫ: 'ᚰ', c: 'ᛍ', z: 'ᛎ', q: 'ᛩ', x: 'ᛪ' };
const RUNTECKEN = { ':': '᛬', '·': '᛫', "'": '᛫', '×': '᛭', '+': '᛭', '⁓': '᛬', '⁑': '᛬', '-': '–' };

// Period i databasen → runrad och dess namn.
function lasRunrad(period) {
  if (/^Urnordisk/.test(period || '')) return [RUNRAD_ALDRE, 'den äldre runraden (24 runor)'];
  if (/Medeltid|SENTIDA/.test(period || '') && !/Vikingatid/.test(period)) return [RUNRAD_MEDELTID, 'medeltida runor'];
  return [RUNRAD_YNGRE, 'den yngre runraden (16 runor, här som långkvistrunor)'];
}

const lasEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Ord utan redaktörens tecken: [] förlorat, () skadat, <> chiffer, {} latinska bokstäver, ^ bindruna, | dubbelläst runa.
const lasKarna = (t) => t.replace(/[\[\](){}<>?^|¶]/g, '');
const lasRunor = (ord, rad) => [...lasKarna(ord)].map((c) => rad[c] ?? RUNTECKEN[c] ?? c).join('');

// Delar en text i ord. Skiljetecken och luckor som står för sig hoppas över; §A, §B … (sidor på
// stenen) följer med nästa ord som `sida`.
function lasDela(text, skilje) {
  const ord = [];
  let sida = null;
  for (const t of (text || '').split(/\s+/)) {
    if (t[0] === '§') { sida = t.slice(1); continue; }
    const k = lasKarna(t);
    if (!k || (skilje.test(k) && !/^-+$/.test(k))) continue;   // bara streck = ett helt oläsligt ord
    ord.push({ t, sida });
    sida = null;
  }
  return ord;
}
const LAS_SKILJE_R = /^[·:×'+⁓⁑.°`´*\/…-]+$/, LAS_SKILJE_N = /^[….,;:!?\/-]+$/;

// Grov ljudbild, så att ristarens stavning (16 runor) går att jämföra med normaliseringen:
// kunukʀ och kunungʀ, onklati och Ænglandi.
const lasLjud = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ð/g, 'þ').replace(/ʀ/g, 'r').replace(/[^a-zþæø]/g, '')
  .replace(/d/g, 't').replace(/g/g, 'k').replace(/p/g, 'b').replace(/[vwoyø]/g, 'u').replace(/[ej]/g, 'i').replace(/æ/g, 'a')
  .replace(/[nm](?=[ktb])/g, '').replace(/(.)\1+/g, '$1');
function lasLikhet(a, b) {
  if (!a || !b) return 0;
  let rad = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const ny = [i];
    for (let j = 1; j <= b.length; j++) ny[j] = Math.min(rad[j] + 1, ny[j - 1] + 1, rad[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    rad = ny;
  }
  return 1 - rad[b.length] / Math.max(a.length, b.length);
}

// Parar translittereringens ord med normaliseringens. Är de lika många hör de ihop ett och ett;
// annars (fragment, tillagda eller sammandragna ord) paras de ord som liknar varandra, i ordning,
// och resten står ensamma.
function lasPara(rOrd, nOrd) {
  if (rOrd.length === nOrd.length) return rOrd.map((r, i) => ({ r, n: nOrd[i] }));
  const a = rOrd.map((o) => lasLjud(o.t)), b = nOrd.map((o) => lasLjud(o.t));
  const P = Array.from({ length: a.length + 1 }, () => new Float32Array(b.length + 1));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      P[i][j] = Math.max(P[i - 1][j], P[i][j - 1], P[i - 1][j - 1] + lasLikhet(a[i - 1], b[j - 1]) - 0.4);
    }
  }
  const par = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && P[i][j] !== P[i - 1][j] && P[i][j] !== P[i][j - 1]) par.push({ r: rOrd[--i], n: nOrd[--j] });
    else if (j > 0 && (i === 0 || P[i][j] === P[i][j - 1])) par.push({ r: null, n: nOrd[--j] });
    else par.push({ r: rOrd[--i], n: null });
  }
  par.reverse();
  // Ett ensamt ord på var sida, intill varandra, hör ihop även om stavningen inte liknar (o| och a).
  for (let k = 0; k < par.length - 1; k++) {
    const [x, y] = [par[k], par[k + 1]];
    const ensam = (p) => !par[p] || (par[p].r && par[p].n);
    if (!x.r === !!y.r && !x.n === !!y.n && !(x.r && x.n) && ensam(k - 1) && ensam(k + 2)) par.splice(k, 2, { r: x.r || y.r, n: x.n || y.n });
  }
  return par;
}

// Ordförklaring ur ordboken (data/ordbok.json): en handskriven betydelse per ordform, eller "namn"
// för former som står med stor bokstav inne i en mening någonstans i materialet.
function lasGlosa(ord, forst, ordbok) {
  const rent = lasKarna(ord).replace(/[.,;:!…"]/g, '').split('/')[0];
  const nyckel = rent.toLowerCase();
  if (!nyckel) return '';
  if (/^fuþ/.test(nyckel)) return 'runraden';
  if (ordbok.ord[nyckel]) return ordbok.ord[nyckel];
  if (rent[0] !== nyckel[0] && (!forst || ordbok.namn.has(nyckel))) return 'namn';
  return '';
}

// Hela läsningen som HTML. r = translitterering, n = normaliserad text (kan saknas), period = databasens
// period, ordbok = { ord: {form: betydelse}, namn: Set } eller null om ordboken inte gick att hämta.
function lasningHtml(r, n, period, ordbok) {
  const [rad, radnamn] = lasRunrad(period);
  const par = lasPara(lasDela(r, LAS_SKILJE_R), lasDela(n, LAS_SKILJE_N));
  if (!par.length) return '';
  const bok = ordbok || { ord: {}, namn: new Set() };
  let forst = true, html = '';
  for (const { r: ro, n: no } of par) {
    const sida = ro?.sida || no?.sida;
    if (sida) { html += `<span class="sida">Sida ${lasEsc(sida)}</span>`; forst = true; }
    const glosa = no ? lasGlosa(no.t, forst, bok) : '';
    if (no) forst = /[.!?]$/.test(no.t);
    html += `<span class="lo${glosa === 'namn' ? ' namn' : ''}">`
      + `<span class="ru">${ro ? lasEsc(lasRunor(ro.t, rad)) : '&nbsp;'}</span>`
      + `<span class="tr">${ro ? lasEsc(ro.t) : '&nbsp;'}</span>`
      + (n ? `<span class="no">${no ? lasEsc(no.t) : '&nbsp;'}</span><span class="gl">${lasEsc(glosa) || '&nbsp;'}</span>` : '')
      + '</span>';
  }
  const rader = ['runor', 'translitterering', ...(n ? ['normaliserad text', 'ordförklaring'] : [])];
  return `<p class="las-rader">Varje ord uppifrån och ner: ${rader.join(', ')}.</p>
    <div class="las-ord">${html}</div>
    <p class="not">Runorna är återskapade ur translittereringen med ${radnamn}; ristarens egna runformer, skiljetecken
      och radbrytningar syns inte här.${n ? ` Orden är parade automatiskt${ordbok ? `, och ordförklaringarna kommer ur en handskriven
      lista över vanliga ord: en betydelse per ordform, utan grammatisk analys, så ord med flera betydelser kan få fel
      förklaring` : ' (ordförklaringarna kunde inte hämtas just nu)'}. Översättningen ovan är den som gäller.` : ''}</p>`;
}

// Ordboken hämtas en gång, först när någon vill läsa ord för ord.
let ordbokLofte = null;
function hamtaOrdbok(url = 'data/ordbok.json') {
  ordbokLofte ??= fetch(url, { cache: 'no-cache' }).then((s) => { if (!s.ok) throw new Error(`HTTP ${s.status}`); return s.json(); })
    .then((d) => ({ ord: d.ord, namn: new Set(d.namn) }))
    .catch((fel) => { console.warn('Ordboken:', fel); ordbokLofte = null; return null; });
  return ordbokLofte;
}
