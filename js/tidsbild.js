// Tidsbild per period och bilder från Wikimedia Commons.
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

// ---------- Tidsbild ----------

// Kläder, smycken, hus, skepp och vapen för perioden på tidslinjen, ur data/tidsbild.json.
// Korten visar foton av verkliga fynd från Wikimedia Commons (miniatyr, upphov och licens hämtas
// från Commons API när rutan öppnas). Dräktfigurerna är schematiska: siffrorna leder till ett kort
// eller till en kort text om plagget.
let tidsbilder = [], tbGrupp = 'se', tbVisad = null, tbMarkor = null;

// Figurernas grundformer och var varje del sitter: [x, y] på figuren och [x, y] för siffran.
const TB_FIGURER = {
  kvinna: {
    namn: 'Kvinna',
    former: `
      <path class="kropp" d="M36 62 L22 150 L30 152 L42 84 Z M84 62 L98 150 L90 152 L78 84 Z"/>
      <path class="plagg2" d="M44 48 L76 48 L86 68 L96 256 L24 256 L34 68 Z"/>
      <path class="plagg" d="M42 78 L78 78 L86 232 L34 232 Z"/>
      <path class="plagg" d="M46 78 L48 52 L52 52 L51 78 Z M74 78 L72 52 L68 52 L69 78 Z"/>
      <rect class="kropp" x="54" y="38" width="12" height="12"/>
      <circle class="kropp" cx="60" cy="27" r="14"/>
      <path d="M48 81 Q60 100 72 81" fill="none" stroke="var(--text-2)" stroke-width=".8"/>
      ${[[50, 87], [54, 92], [60, 94], [66, 92], [70, 87]].map(([x, y]) => `<circle class="parla" cx="${x}" cy="${y}" r="2.2"/>`).join('')}
      <ellipse class="metall" cx="47" cy="78" rx="6" ry="4.5"/><ellipse class="metall" cx="73" cy="78" rx="6" ry="4.5"/>
      <g class="metall"><circle cx="60" cy="59" r="2.6"/><circle cx="57.2" cy="64" r="2.6"/><circle cx="62.8" cy="64" r="2.6"/></g>`,
    punkter: { treflik: [60, 62, 12, 58], spannbuckla: [73, 78, 108, 70], parlor: [60, 94, 108, 104],
      hangselkjol: [72, 165, 108, 165], sark: [30, 240, 12, 228] },
  },
  man: {
    namn: 'Man',
    former: `
      <path class="kropp" d="M36 62 L24 145 L32 147 L42 84 Z"/>
      <path class="plagg2" d="M38 158 L58 158 L56 246 L42 246 Z M62 158 L82 158 L78 246 L64 246 Z"/>
      <path d="M42 205 L57 205 M42 215 L57 215 M42 225 L56 225 M42 235 L56 235 M64 205 L79 205 M64 215 L79 215 M64 225 L78 225 M64 235 L78 235" stroke="var(--text-2)" stroke-width=".7"/>
      <path class="plagg" d="M44 48 L76 48 L86 68 L90 162 L30 162 L34 68 Z"/>
      <rect x="31" y="110" width="58" height="6" fill="var(--text-2)"/>
      <rect class="kropp" x="33" y="116" width="6" height="12" rx="1"/>
      <path class="plagg2" d="M40 52 L82 48 L98 165 L76 170 L56 104 Z"/>
      <rect class="kropp" x="54" y="38" width="12" height="12"/>
      <circle class="kropp" cx="60" cy="27" r="14"/>
      <circle class="metall" cx="41" cy="55" r="4.5" fill="none"/><path d="M41 50 L41 66" stroke="var(--text)" stroke-width="1.2"/>`,
    punkter: { ringnal: [41, 55, 12, 46], kjortel: [48, 140, 12, 140], balte: [76, 113, 108, 118],
      kam: [36, 122, 12, 180], byxor: [72, 205, 108, 205] },
  },
};

function figurSvg(typ, delar) {
  const f = TB_FIGURER[typ];
  const punkter = delar.map((d, k) => {
    const id = d.kort || d.id, p = f.punkter[id];
    if (!p) return '';
    return `<line x1="${p[0]}" y1="${p[1]}" x2="${p[2]}" y2="${p[3]}" stroke="var(--text)" stroke-width=".7" stroke-dasharray="2 1.5"/>
      <g class="punkt" data-figur="${typ}" data-del="${k}" role="button" tabindex="0" aria-label="${k + 1}"><circle cx="${p[2]}" cy="${p[3]}" r="7"/><text x="${p[2]}" y="${p[3]}">${k + 1}</text></g>`;
  }).join('');
  return `<figure><svg viewBox="0 0 120 262" role="img" aria-label="Schematisk figur: ${f.namn.toLowerCase()}">${f.former}${punkter}</svg><figcaption>${f.namn}</figcaption></figure>`;
}

function laggTillTidsbild() {
  $('visa-tidsbild').addEventListener('click', () => ($('tidsbild').hidden ? oppnaTidsbild() : stangTidsbild()));
  const ruta = $('tidsbild');
  ruta.addEventListener('click', (e) => {
    if (e.target.closest('.stang')) return stangTidsbild();
    const flik = e.target.closest('[data-grupp]');
    if (flik) { tbGrupp = flik.dataset.grupp; ritaTbKort(); return; }
    const punkt = e.target.closest('.punkt');
    if (punkt) return valjTbDel(punkt);
    const fotopunkt = e.target.closest('[data-punkt]');
    if (fotopunkt) return valjTbFotopunkt(+fotopunkt.dataset.punkt);
    const karta_ = e.target.closest('.till-karta');
    if (karta_) return visaTbPlats(karta_.dataset.id);
    const ar = e.target.closest('[data-ar]');
    if (ar) { stoppa(); sattAr(+ar.dataset.ar); }
  });
  ruta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('.punkt')) valjTbDel(e.target.closest('.punkt')); });
}

const aktuellTidsbild = () => tidsbilder.find((p) => lage.ar >= p.a && lage.ar < p.b);

function oppnaTidsbild() {
  $('tidsbild').hidden = false;
  $('detalj').hidden = true;
  $('visa-tidsbild').setAttribute('aria-expanded', 'true');
  tbMarkor?.remove(); tbMarkor = null;
  tbVisad = null;
  ritaTidsbild();
}

function stangTidsbild() {
  $('tidsbild').hidden = true;
  $('visa-tidsbild').setAttribute('aria-expanded', 'false');
}

// Anropas från uppdatera(); ritar bara om när tidslinjen har gått in i en annan period.
function ritaTidsbild() {
  if ($('tidsbild').hidden) return;
  const p = aktuellTidsbild();
  if ((p?.id ?? '-') === tbVisad) return;
  tbVisad = p?.id ?? '-';
  const ruta = $('tidsbild');
  if (!p) {
    ruta.innerHTML = `<button class="stang" aria-label="Stäng">×</button>
      <h2>Tidsbild</h2>
      <div class="tb-tom"><p class="ingress">Tidslinjen står på år ${lage.ar}. Tidsbilden finns än så länge för
        ${tidsbilder.map((t) => `${esc(t.n.toLowerCase())} (${t.a}–${t.b})`).join(' och ')}.</p>
        <div class="tb-perioder">${tidsbilder.map((t) => `<button type="button" data-ar="${Math.round((t.a + t.b) / 2)}">${esc(t.n)}</button>`).join('')}</div></div>`;
    return;
  }
  const delar = p.drakt;
  ruta.innerHTML = `<button class="stang" aria-label="Stäng">×</button>
    <h2>Tidsbild: ${esc(p.n)} <small>${p.a}–${Math.min(p.b, AR_MAX)}</small></h2>
    <p class="ingress">${esc(p.ingress)}</p>
    <div class="tb-yta">
      ${p.personer ? personerHtml(p.personer) : `<div class="tb-figurer">
        <div class="par">${figurSvg('kvinna', delar.kvinna)}${figurSvg('man', delar.man)}</div>
        <p class="not">Schematiska figurer, inte rekonstruktioner av verkliga personer. Klicka på siffrorna.</p>
        <div class="tb-del" id="tb-del" hidden></div>
      </div>`}
      <div>
        <div class="tb-flikar" role="tablist">${p.grupper.map((g) => `<button type="button" role="tab" data-grupp="${g.id}">${esc(g.n)}</button>`).join('')}</div>
        <div class="tb-kort" id="tb-kort"></div>
      </div>
    </div>`;
  ritaTbKort();
  hamtaTbBilder(p);
}

function ritaTbKort(valt) {
  const p = aktuellTidsbild();
  if (!p) return;
  for (const b of $('tidsbild').querySelectorAll('[data-grupp]')) b.setAttribute('aria-selected', b.dataset.grupp === tbGrupp);
  const typer = { fynd: 'Fynd', rekonstruktion: 'Rekonstruktion', teckning: 'Teckning', malning: 'Målning' };
  $('tb-kort').innerHTML = p.kort.filter((k) => k.g === tbGrupp).map((k) => `
    <article data-id="${k.id}"${k.id === valt ? ' class="vald"' : ''}>
      <a class="bild" target="_blank" rel="noopener">
        <img data-fil="${esc(k.bild)}" alt="${esc(k.n)}" loading="lazy">
        <span class="etikett${k.dom ? ' myt' : ''}">${esc(k.dom || typer[k.typ])}</span></a>
      <div class="innehall">
        <h3>${esc(k.n)}</h3>
        <p>${esc(k.text)}</p>
        ${k.fynd ? `<p class="fynd">${k.dom ? 'Bild: ' : 'Hittad: '}${esc(k.fynd)}${k.ungefar ? ' (ungefärlig plats)' : ''}</p>` : ''}
        <p class="upphov" data-fil="${esc(k.bild)}"></p>
        ${k.plats ? `<button type="button" class="till-karta" data-id="${k.id}">Visa på kartan</button>` : ''}
      </div>
    </article>`).join('');
  fyllCommons($('tidsbild'));
}

async function hamtaTbBilder(p) {
  await hamtaCommons([...p.kort.map((k) => k.bild), p.personer?.bild, ...(p.personer?.narbilder || []).map((n) => n.bild)]);
  fyllCommons($('tidsbild'));
}

function valjTbDel(punkt) {
  const p = aktuellTidsbild();
  const del = p.drakt[punkt.dataset.figur][+punkt.dataset.del];
  for (const g of $('tidsbild').querySelectorAll('.punkt')) g.classList.toggle('vald', g === punkt);
  const ruta = $('tb-del');
  if (del.kort) {
    ruta.hidden = true;
    tbGrupp = p.kort.find((k) => k.id === del.kort).g;
    ritaTbKort(del.kort);
    $('tidsbild').querySelector(`article[data-id="${del.kort}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    ruta.hidden = false;
    ruta.innerHTML = `<b>${punkt.dataset.del * 1 + 1}. ${esc(del.n)}</b>${esc(del.text)}`;
  }
}

// Har perioden ett foto av rekonstruerade människor (personer) visas det med siffror direkt på
// fotot; annars de schematiska figurerna.

function personerHtml(pers) {
  return `<div class="tb-personer">
    <h3>${esc(pers.rubrik)}</h3>
    <div class="foto">
      <img data-fil="${esc(pers.bild)}" alt="${esc(pers.rubrik)}">
      ${pers.punkter.map((pt, k) => `<button type="button" class="hot" data-punkt="${k}" style="left:${pt.x}%;top:${pt.y}%" aria-label="Del ${k + 1}">${k + 1}</button>`).join('')}
    </div>
    <div class="tb-del" id="tb-del" hidden></div>
    <p class="not">${esc(pers.text)} Klicka på siffrorna.</p>
    <p class="upphov" data-fil="${esc(pers.bild)}"></p>
    <div class="narbilder">${(pers.narbilder || []).map((n) => `
      <figure><a class="bild" target="_blank" rel="noopener"><img data-fil="${esc(n.bild)}" alt="" loading="lazy"></a>
        <figcaption>${esc(n.text)} <span class="upphov" data-fil="${esc(n.bild)}"></span></figcaption></figure>`).join('')}</div>
  </div>`;
}

function valjTbFotopunkt(k) {
  const p = aktuellTidsbild();
  const pt = p.personer.punkter[k];
  for (const b of $('tidsbild').querySelectorAll('[data-punkt]')) b.classList.toggle('vald', +b.dataset.punkt === k);
  const ruta = $('tb-del');
  if (pt.kort) {
    ruta.hidden = true;
    tbGrupp = p.kort.find((x) => x.id === pt.kort).g;
    ritaTbKort(pt.kort);
    $('tidsbild').querySelector(`article[data-id="${pt.kort}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  const del = pt.text ? pt : [...p.drakt.kvinna, ...p.drakt.man].find((d) => d.id === pt.id);
  ruta.hidden = false;
  ruta.innerHTML = `<b>${k + 1}. ${esc(del.n)}</b>${esc(del.text)}`;
}

// Stänger rutan och visar fyndplatsen på kartan med en markör, som tas bort när rutan öppnas igen.
function visaTbPlats(id) {
  const k = aktuellTidsbild().kort.find((x) => x.id === id);
  stangTidsbild();
  tbMarkor?.remove();
  const el = document.createElement('div');
  el.className = 'ort tur-plats';
  el.innerHTML = `<i></i><span>${esc(k.n)}: ${esc(k.fynd)}</span>`;
  tbMarkor = new maplibregl.Marker({ element: el, anchor: 'left', offset: [-6, 0] }).setLngLat([k.plats.x, k.plats.y]).addTo(karta);
  karta.flyTo({ center: [k.plats.x, k.plats.y], zoom: 9, duration: 1200 });
}

// ---------- Bilder från Wikimedia Commons ----------

// Berättelser, tidsbild och välkomstruta visar bilder från Commons. Miniatyr, upphov och licens
// hämtas med ett anrop för alla filer som saknas och fylls sedan i element med data-fil:
// <img data-fil> får bilden (och upphov som title om ingen bildtext finns), .upphov[data-fil] får
// upphov, licens och länk.
const commonsBilder = {};   // filnamn → { thumb, sida, upphov, licens }

async function hamtaCommons(filer) {
  const saknas = [...new Set(filer.filter(Boolean))].filter((f) => !commonsBilder[f]);
  if (!saknas.length) return;
  const text = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };
  for (let i = 0; i < saknas.length; i += 40) {
    try {
      const titlar = saknas.slice(i, i + 40).map((f) => `File:${f}`).join('|');
      const svar = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=${encodeURIComponent(titlar)}`).then((s) => s.json());
      for (const sida of Object.values(svar.query.pages)) {
        const info = sida.imageinfo?.[0];
        if (!info) continue;
        const meta = info.extmetadata || {};
        commonsBilder[sida.title.replace(/^File:/, '')] = { thumb: info.thumburl, sida: info.descriptionurl,
          upphov: text(meta.Artist?.value).slice(0, 80), licens: text(meta.LicenseShortName?.value) };
      }
      // Commons normaliserar titlar (t.ex. understreck och versaler); matcha även på vår form.
      for (const n of svar.query.normalized || []) {
        const fran = n.from.replace(/^File:/, ''), till = n.to.replace(/^File:/, '');
        if (commonsBilder[till]) commonsBilder[fran] = commonsBilder[till];
      }
    } catch (fel) {
      console.warn('Commons:', fel);
      meddela('commons', 'Bilder från Wikimedia Commons kunde inte hämtas just nu. Texterna fungerar som vanligt.');
    }
  }
}

const upphovText = (b) => [b.upphov, b.licens].filter(Boolean).join(' · ');

function fyllCommons(rot) {
  for (const img of rot.querySelectorAll('img[data-fil]')) {
    const b = commonsBilder[img.dataset.fil];
    if (!b || img.src) continue;
    img.src = b.thumb;
    const lank = img.closest('a');
    if (lank) lank.href = b.sida;
    if (!img.closest('figure, .foto, article')) img.title = `Foto: ${upphovText(b)} (Wikimedia Commons)`;
  }
  for (const el of rot.querySelectorAll('.upphov[data-fil]')) {
    const b = commonsBilder[el.dataset.fil];
    if (!b || el.innerHTML) continue;
    el.innerHTML = `${esc(upphovText(b))}${upphovText(b) ? ' · ' : ''}<a href="${esc(b.sida)}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
  }
}
