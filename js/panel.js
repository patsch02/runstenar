// Välkomstruta, ordlista, adressen (delbara länkar) och panelens i-knappar.
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

// ---------- Välkomstruta ----------

// Visas en gång per besök (sessionStorage) och erbjuder tre vägar in i kartan.
const VALKOMMEN_BILD = 'Vikings costumes woman man Arkeologisk museum Stavanger, Norway 2015-05-27.jpg';
const vanta = (villkor) => new Promise((klar_) => {
  const prova = () => (villkor() ? klar_() : setTimeout(prova, 150));
  prova();
});

function visaValkommen() {
  try { if (sessionStorage.getItem('valkommen-sedd')) return; } catch { /* privat läge */ }
  const ruta = document.createElement('div');
  ruta.className = 'valkommen';
  ruta.innerHTML = `
    <div class="kort" role="dialog" aria-label="Välkommen">
      <div class="bild"><img data-fil="${esc(VALKOMMEN_BILD)}" alt="Rekonstruerade vikingatida människor i Arkeologisk museum, Stavanger">
        <small>Arkeologisk museum, Stavanger · <span class="upphov" data-fil="${esc(VALKOMMEN_BILD)}"></span></small></div>
      <div class="text">
        <p class="kicker">Vikingatid och medeltid</p>
        <h2>Runstenar i tid och rum</h2>
        <p>Bakom varje runsten finns en människa som ville bli ihågkommen. Följ dem på resor till Särkland och England,
          se var de bodde och hur de såg ut – år för år.</p>
        <div class="siffror">
          <div><b>${runor.length.toLocaleString('sv-SE')}</b><span>runinskrifter</span></div>
          <div><b>${(AR_MAX - AR_MIN).toLocaleString('sv-SE')}</b><span>år på tidslinjen</span></div>
          <div><b class="antal-turer">7</b><span>berättelser</span></div>
        </div>
        <div class="val">
          <button type="button" class="primar" data-val="ingvar">Följ Ingvarståget</button>
          <button type="button" data-val="tidsbild">Möt människorna</button>
          <button type="button" data-val="stang">Utforska kartan</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ruta);
  hamtaCommons([VALKOMMEN_BILD]).then(() => fyllCommons(ruta));
  vanta(() => turer.length).then(() => { ruta.querySelector('.antal-turer').textContent = turer.length; });
  ruta.addEventListener('click', async (e) => {
    const val = e.target.closest('[data-val]')?.dataset.val;
    if (!val && e.target !== ruta) return;
    ruta.remove();
    try { sessionStorage.setItem('valkommen-sedd', '1'); } catch { /* privat läge */ }
    if (val === 'ingvar') {
      await vanta(() => turer.length);
      startaTur(turer.find((t) => t.id === 'ingvar'));
    } else if (val === 'tidsbild') {
      await vanta(() => tidsbilder.length);
      sattAr(950);
      oppnaTidsbild();
    }
  });
}

// ---------- Ordlista ----------

// Facktermer förklaras i en liten ruta när man klickar på dem (knappar med klassen "ord"),
// och hela listan står i panelen under "Ordlista".
const ORDLISTA = {
  ai: ['AI-översättning', 'Runtextdatabasen har svensk översättning för bara omkring 1 400 inskrifter. För övriga har vi låtit en AI-modell (Claude) översätta databasens engelska översättning till svenska. Den är alltså inte gjord från runtexten och inte granskad av en runolog; namnen står i databasens fornnordiska form. Jämför gärna med den engelska under texten och med posten i runtextdatabasen.'],
  signum: ['Signum', 'Inskriftens beteckning: landskap eller land och ett löpnummer, t.ex. U 344 (Uppland), Sö 179 (Södermanland), Ög (Östergötland), Vg (Västergötland), DR (Danmark), N (Norge). Numren kommer ur de stora utgåvorna av runinskrifterna.'],
  translitterering: ['Translitterering', 'Runorna återgivna bokstav för bokstav med latinska tecken. ʀ är den yngre r-runan, - står för en oläslig runa, … för en skadad bit och bokstäver inom parentes är osäkra.'],
  runsvenska: ['Runsvenska', 'Det svenska språket under vikingatiden, som det skrevs med runor. Texten är normaliserad: forskarnas tolkning av hur orden lät, med vanliga bokstäver och ordgränser.'],
  rundanska: ['Rundanska', 'Det danska språket under vikingatiden, normaliserat på samma sätt som runsvenska.'],
  fornvastnordiska: ['Fornvästnordiska', 'Det språk som talades i Norge och på Island (fornisländska). Databasen ger alla nordiska inskrifter en normalisering på fornvästnordiska; den används här när det saknas en svensk eller dansk.'],
  forndanska: ['Forndanska', 'Danska under medeltiden, normaliserad.'],
  fornsvenska: ['Fornsvenska', 'Svenska under medeltiden, normaliserad.'],
  urnordiska: ['Urnordiska', 'Det gemensamma nordiska språket före vikingatiden, ca 200–700, skrivet med den äldre runraden.'],
  futhark: ['Futhark', 'Runraden, uppkallad efter de sex första runorna. Den äldre runraden har 24 runor och användes till 700-talet; den yngre, med 16 runor, är vikingatidens.'],
  rak: ['Rak', 'Ornamentikstil där runslingan saknar djurhuvud och har raka ändar. Den äldsta stilen i Anne-Sofie Gräslunds kronologi för uppländska runstenar, ca 980–1015.'],
  fp: ['Fp (fågelperspektiv)', 'Slingans djurhuvud ses ovanifrån, med båda ögonen synliga. Ca 1010–1050 enligt Gräslund.'],
  pr: ['Pr 1–Pr 5 (profil)', 'Slingans djurhuvud ses från sidan. Pr 1 och Pr 2 (ca 1010–1050) har enkla djur, Pr 3 (ca 1045–1075) är början på Urnesstilen, Pr 4 och Pr 5 (ca 1070–1130) har smala djur i allt tätare slingor. Dateringarna är ungefärliga och gäller främst Uppland.'],
  kb: ['Kb (korsband)', 'Runslingan bildar ett band som korsar sig självt, utan tydligt djurhuvud.'],
  ristare: ['Ristare', 'Den som högg runorna. Ofta står namnet i texten (”Öpir ristade”); andra stenar har tillskrivits en ristare efter språk och stil, och då är uppgiften osäkrare (markerat med ?).'],
  bautil: ['Bautil', 'Göransson, Bautil (1750): ett verk med träsnitt av omkring 1 170 svenska runstenar, gjorda efter 1600-talets inventeringar av Hadorph och Peringskiöld. Många stenar som sedan försvann är kända bara därifrån. Numret skrivs B 123.'],
  liljegren: ['Liljegren', 'J. G. Liljegren, Run-urkunder (1833): förteckning över alla då kända runinskrifter. Numret skrivs L 123.'],
  snav: ['Snävt daterad', 'Inskriften är daterad inom högst 120 år, efter stil, språk eller personer i texten. Övriga har bara en period (t.ex. vikingatid, 725–1100) och kallas här ungefärligt daterade.'],
  forsvunnen: ['Försvunnen', 'Inskriften finns inte längre men är känd genom äldre avbildningar eller beskrivningar. Den ritas som en ring på sin äldsta kända plats.'],
  brosten: ['Brosten', 'Sten som berättar att någon byggt en bro eller vägbank, ofta ”för själen” efter en död. Att bygga broar sågs som en god kristen gärning.'],
  urnordisk: ['Urnordisk period', 'Inskrifter med den äldre runraden, från ca 150 till 700-talet: mest lösföremål och några stenar.'],
  vikingatid: ['Vikingatid', 'Ca 800–1050. De flesta runstenarna restes under dess sista hundra år, särskilt i Uppland.'],
  medeltid: ['Medeltid', 'Från ca 1050. Runor användes länge, på gravhällar, i kyrkor och på pinnar (som i Bergen), men resta runstenar blev sällsynta efter 1100-talets början.'],
};
const ORD_FOR_SPRAK = { Runsvenska: 'runsvenska', Rundanska: 'rundanska', Fornvästnordiska: 'fornvastnordiska', Forndanska: 'forndanska', Fornsvenska: 'fornsvenska', Urnordiska: 'urnordiska' };
const ordKnapp = (text, nyckel) => (ORDLISTA[nyckel]
  ? `<button type="button" class="ord" data-ord="${nyckel}">${esc(text)}</button>` : esc(text));
// Stilangivelser som "Pr 3, Pr 4?" får en förklaring per stil
const stilHtml = (st) => st.split(', ').map((del) => {
  const k = del.replace(/[^A-Za-z]/g, '').toLowerCase();
  return ordKnapp(del, k === 'pr' || k === 'rak' || k === 'fp' || k === 'kb' ? k : null);
}).join(', ');
const periodHtml = (p) => p.split('/').map((del) => ordKnapp(del, { Urnordisk: 'urnordisk', Vikingatid: 'vikingatid', Medeltid: 'medeltid' }[del])).join('/');

function kopplaOrdlista() {
  const stang = () => document.querySelector('.ordruta')?.remove();
  document.addEventListener('click', (e) => {
    const knapp = e.target.closest('.ord');
    if (e.target.closest('.ordruta')) return;
    stang();
    if (!knapp) return;
    const [rubrik, text] = ORDLISTA[knapp.dataset.ord];
    const ruta = document.createElement('div');
    ruta.className = 'ordruta';
    ruta.setAttribute('role', 'tooltip');
    ruta.innerHTML = `<b>${esc(rubrik)}</b>${esc(text)}`;
    document.body.appendChild(ruta);
    const b = knapp.getBoundingClientRect(), r = ruta.getBoundingClientRect();
    const vanster = Math.min(window.innerWidth - r.width - 8, Math.max(8, b.left + b.width / 2 - r.width / 2));
    const under = b.bottom + 6 + r.height < window.innerHeight;
    ruta.style.left = `${vanster}px`;
    ruta.style.top = `${under ? b.bottom + 6 : b.top - r.height - 6}px`;
  });
  // Esc stänger först ordrutan, sedan detaljrutan och sist tidsbilden.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.target.closest?.('input, select, textarea')) return;
    if (document.querySelector('.ordruta')) return stang();
    if (!$('detalj').hidden) return $('detalj').querySelector('.stang')?.click();
    if (!$('tidsbild').hidden) stangTidsbild();
  });
  document.addEventListener('scroll', stang, true);
  $('ordlista').innerHTML = Object.values(ORDLISTA).sort((a, b) => a[0].localeCompare(b[0], 'sv'))
    .map(([rubrik, text]) => `<dt>${esc(rubrik)}</dt><dd>${esc(text)}</dd>`).join('');
}

// ---------- Adress ----------

// Valt år, kartvy, lager, färgläge, öppen inskrift och pågående berättelse står i adressens hash,
// t.ex. #ar=1030&s=U+344&vy=17.81,59.52,9.0, så att en vy går att dela och bakåtknappen fungerar.
// Lager skrivs som skillnad mot förvalen (l=+gravar,-leder), föremålstyper bara när de avviker. Under en berättelse
// räcker turen och steget. Att öppna eller stänga en inskrift och att byta steg blir nya steg i
// webbläsarens historik; år och kartvy skrivs över i det aktuella.
const LAGER = [['visa-sedan', 'sedan'], ['visa-grov', 'grov'], ['visa-orter', 'orter'],
  ['visa-bevarade', 'bevarade'], ['visa-forsvunna', 'forsvunna'], ['visa-leder', 'leder'],
  ['visa-resor', 'resor'], ['visa-broar', 'broar'], ['visa-vagar', 'vagar'], ['visa-bygd', 'bygd'],
  ['visa-gravar', 'gravar'], ['visa-kult', 'kult'], ['visa-kyrkor', 'kyrkor'], ['visa-strand', 'strand'],
  ['visa-sjofart', 'sjofart'], ['visa-forsvar', 'forsvar'], ['visa-mynt', 'mynt']];
lage.vald = null;          // signum för inskriften i detaljrutan
let forval = null;         // förvalda lager och typer, sparade i start() innan adressen läses
let laserAdress = false, adressTimer;

const paLager = () => LAGER.filter(([, k]) => lage[k]).map(([, k]) => k);
const valdaTyper = () => [...'RGO'].filter((k) => lage.typer.has(k)).join('');

function adressText() {
  const delar = [];
  const satt_ = (k, v) => delar.push(`${k}=${encodeURIComponent(v).replace(/%2C/g, ',').replace(/%20|%2B/g, '+')}`);
  if (tur) {
    satt_('tur', tur.id);
    if (turSteg) satt_('steg', turSteg + 1);
    return delar.join('&');
  }
  satt_('ar', lage.ar);
  if (lage.vald && !$('detalj').hidden) satt_('s', lage.vald);
  const c = karta.getCenter();
  satt_('vy', `${c.lng.toFixed(2)},${c.lat.toFixed(2)},${karta.getZoom().toFixed(1)}`);
  const andrade = LAGER.filter(([, k]) => lage[k] !== forval.lager.includes(k)).map(([, k]) => (lage[k] ? `+${k}` : `-${k}`));
  if (andrade.length) satt_('l', andrade.join(','));
  if (valdaTyper() !== forval.typer) satt_('typ', valdaTyper() || '-');
  if (lage.farg !== 'tid') satt_('farg', lage.farg);
  return delar.join('&');
}

// nytt = true lägger till ett steg i historiken, annars skrivs det aktuella över (med fördröjning,
// eftersom webbläsare stryper täta anrop medan tidslinjen spelar).
function skrivAdress(nytt = false) {
  if (!klar || laserAdress || !forval) return;
  clearTimeout(adressTimer);
  const skriv = () => {
    const hash = `#${adressText()}`;
    if (hash === location.hash) return;
    if (nytt) history.pushState(null, '', hash); else history.replaceState(null, '', hash);
  };
  if (nytt) skriv(); else adressTimer = setTimeout(skriv, 400);
}

// Knappen i detaljrutan kopierar adressen, som redan beskriver den aktuella vyn.
function kopplaDela() {
  const knapp = $('detalj').querySelector('.dela');
  knapp?.addEventListener('click', async () => {
    clearTimeout(adressTimer);
    history.replaceState(null, '', `#${adressText()}`);
    try { await navigator.clipboard.writeText(location.href); knapp.textContent = 'Länken är kopierad'; }
    catch { knapp.textContent = 'Kopiera från adressfältet'; }
    setTimeout(() => { if (knapp.isConnected) knapp.textContent = 'Kopiera länk'; }, 2500);
  });
}

async function tillampaAdress() {
  const p = new URLSearchParams(location.hash.slice(1));
  laserAdress = true;
  try {
    if (p.has('tur')) {
      await vanta(() => turer.length);
      const t = turer.find((x) => x.id === p.get('tur'));
      if (t) {
        const steg = Math.max(0, (+p.get('steg') || 1) - 1);
        if (tur !== t) { startaTur(t); }
        if (turSteg !== steg) gaTillSteg(steg);
        return;
      }
    }
    if (tur) avslutaTur();
    const lista = (namn, standard) => (p.has(namn) ? p.get(namn).replace(/^-$/, '') : standard);
    const pa = new Set(forval.lager);
    for (const del of (p.get('l') || '').split(',')) {
      if (del[0] === '-') pa.delete(del.slice(1)); else if (del.trim()) pa.add(del.trim().replace(/^\+/, ''));   // + blir mellanslag i adressen
    }
    for (const [id, k] of LAGER) { lage[k] = pa.has(k); $(id).checked = lage[k]; }
    ritaVagar();
    raknaLager();
    lage.typer = new Set([...lista('typ', forval.typer)].filter((k) => 'RGO'.includes(k)));
    document.querySelectorAll('[data-typ]').forEach((ruta) => (ruta.checked = lage.typer.has(ruta.dataset.typ)));
    lage.farg = ['tid', 'stil', 'ristare'].includes(p.get('farg')) ? p.get('farg') : 'tid';
    $('farg').value = lage.farg;
    if (p.has('ar') && Number.isFinite(+p.get('ar'))) lage.ar = Math.min(AR_MAX, Math.max(AR_MIN, Math.round(+p.get('ar'))));
    stoppa();
    ritaHistogram();
    ritaFarglegend();
    uppdatera();
    const vy = (p.get('vy') || '').split(',').map(Number);
    if (vy.length === 3 && vy.every(Number.isFinite)) karta.jumpTo({ center: [vy[0], vy[1]], zoom: vy[2] });
    const r = p.has('s') && runor.find((x) => x.s === p.get('s'));
    if (r) visaInskrift(r);
    else if (lage.vald) { $('detalj').hidden = true; visaFlytt(null); lage.vald = null; }
  } finally {
    laserAdress = false;
  }
}

function kopplaAdress() {
  forval = { lager: paLager(), typer: valdaTyper() };
  const harAdress = location.hash.length > 1;
  if (harAdress) tillampaAdress();
  window.addEventListener('popstate', () => tillampaAdress());
  karta.on('moveend', () => skrivAdress());
  return harAdress;
}

// ---------- Panel ----------

// i-knapparna fäller ut lagrets förbehåll; gruppernas rubriker visar hur många lager som är påslagna.
function kopplaPanel() {
  const panel = $('panel');
  panel.addEventListener('click', (e) => {
    const knapp = e.target.closest('.info-knapp');
    if (!knapp) return;
    const text = $(knapp.getAttribute('aria-controls'));
    text.hidden = !text.hidden;
    knapp.setAttribute('aria-expanded', !text.hidden);
  });
  panel.addEventListener('change', raknaLager);
  raknaLager();
}

// Grupperna är hopfällda från start; rubriken visar hur många av gruppens lager som är på.
function raknaLager() {
  for (const grupp of $('panel').querySelectorAll('.grupp')) {
    const aktiva = grupp.querySelector('.aktiva');
    if (!aktiva) continue;   // runinskrifternas kryssrutor är filter, inte lager
    const alla = grupp.querySelectorAll('.rad:not(.under) > label > input');
    const n = [...alla].filter((ruta) => ruta.checked).length;
    aktiva.textContent = `${n} av ${alla.length} på`;
    aktiva.classList.toggle('pa', n > 0);
  }
}
