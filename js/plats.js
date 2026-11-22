// "Här är jag": besökarens egen plats på kartan, med de närmaste gamla vägarna och runstenarna.
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

// ---------- Här är jag ----------

// Platsen stannar i webbläsaren: den sparas inte och skickas ingenstans. Adressen innehåller som vanligt
// kartvyn (två decimaler, ungefär en kilometer), men inte själva platsen.
// Vägarna är lämningar ur RAÄ:s fornlämningsregister och norska Askeladden (vagar.json): bevarade bitar, inte hela sträckningar,
// och odaterade. Runstenarna är de som finns kvar, på sin nuvarande plats om de har flyttats.
const VADERSTRECK = ['norr', 'nordost', 'öster', 'sydost', 'söder', 'sydväst', 'väster', 'nordväst'];
const HAR_MAX_KM = 30;       // längre bort än så räknas inte som "i närheten"
let harBevakning = null, harMarkor = null, harPlats = null, harRitad = null, harKnapp = null;

const harLangd = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString('sv-SE', { maximumFractionDigits: m < 10000 ? 1 : 0 })} km`);

// Meter öster- och norrut från besökaren, plant räknat (duger gott inom några mil).
const harMeter = ([x, y]) => [(x - harPlats.x) * Math.cos(harPlats.y * Math.PI / 180) * 111320, (y - harPlats.y) * 110540];
function harRiktning([dx, dy]) {
  return VADERSTRECK[Math.round(((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360) / 45) % 8];
}

// Närmaste punkt på en väglämning: längs hela linjen om sträckningen finns, annars mittpunkten.
function harNarmastPa(v) {
  let bast = harMeter(v.m), min = Math.hypot(...bast);
  for (const linje of v.l || []) {
    let a = harMeter(linje[0]);
    for (let i = 1; i < linje.length; i++) {
      const b = harMeter(linje[i]);
      const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.min(1, Math.max(0, -(a[0] * ex + a[1] * ey) / (ex * ex + ey * ey || 1)));
      const p = [a[0] + t * ex, a[1] + t * ey], d = Math.hypot(...p);
      if (d < min) { min = d; bast = p; }
      a = b;
    }
  }
  return { m: min, at: harRiktning(bast) };
}

// De närmaste lämningarna av varje slag och de närmaste runstenarna som står kvar.
function harNara() {
  const inom = (x, y) => Math.abs(y - harPlats.y) < 0.4 && Math.abs(x - harPlats.x) < 0.9;
  const vagarNara = vagar.map((v, i) => (inom(...v.m) ? { i, v, ...harNarmastPa(v) } : null))
    .filter((t) => t && t.m < HAR_MAX_KM * 1000).sort((a, b) => a.m - b.m);
  const stenar = runor.map((r, i) => {
    if (r.k !== 'R' || r.fs) return null;
    const p = [r.cx ?? r.x, r.cy ?? r.y];
    if (!inom(...p)) return null;
    const d = harMeter(p);
    return { i, r, m: Math.hypot(...d), at: harRiktning(d) };
  }).filter((t) => t && t.m < HAR_MAX_KM * 1000).sort((a, b) => a.m - b.m);
  return {
    vagar: [...vagarNara.filter((t) => t.v.t === 'väg').slice(0, 4), ...vagarNara.filter((t) => t.v.t === 'bro').slice(0, 1),
      ...vagarNara.filter((t) => t.v.t === 'vad').slice(0, 1)].sort((a, b) => a.m - b.m),
    stenar: stenar.slice(0, 4),
  };
}

function ritaHar() {
  const { vagar: vagarNara, stenar } = harNara();
  const rad = (attr, rubrik, under, t) => `<li><button type="button" ${attr}><b>${esc(rubrik)}</b>
    <span>${t.m < 15 ? 'Här, där du står' : `${harLangd(t.m)} åt ${t.at}`}${under ? ` · ${esc(under)}` : ''}</span></button></li>`;
  const vagtyp = { väg: 'Färdväg', bro: 'Bro', vad: 'Vadställe' };
  const vaglista = laddade.get('vagar') === 'fel' ? '<p class="not">Vägarna kunde inte hämtas just nu.</p>'
    : !vagar.length ? '<p class="not">Hämtar vägarna …</p>'
    : vagarNara.length ? `<ul class="har-lista">${vagarNara.map((t) => rad(`data-vag="${t.i}"`, t.v.n ? `${vagtyp[t.v.t]}: ${t.v.n}` : vagtyp[t.v.t], t.v.so || t.v.la, t)).join('')}</ul>`
    : `<p class="not">Inga vägar, broar eller vad i registren inom ${HAR_MAX_KM} km. Registren täcker bara Sverige och Norge.</p>`;
  const stenlista = stenar.length
    ? `<ul class="har-lista">${stenar.map((t) => rad(`data-sten="${t.i}"`, t.r.s, [t.r.pl, t.r.cx ? 'flyttad hit' : null].filter(Boolean).join(', '), t)).join('')}</ul>`
    : `<p class="not">Inga bevarade runstenar inom ${HAR_MAX_KM} km.</p>`;
  visaFlytt(null);
  visaRuta(`
    <div class="har-jag">
    <h2>Här är jag</h2>
    <p class="under">Din plats${harPlats.fel ? ` · på ${harLangd(harPlats.fel)} när` : ''}</p>
    <h3>Gamla vägar i närheten</h3>
    ${vaglista}
    <h3>Runstenar i närheten</h3>
    ${stenlista}
    <p class="not">Vägarna är lämningar ur fornlämningsregistren i Sverige och Norge: bevarade bitar av hålvägar och vägbankar, broar och vad,
      inte hela sträckningar. De är odaterade och kan vara förhistoriska, medeltida eller yngre. Avstånden är fågelvägen
      från din plats. Platsen stannar i din webbläsare: den sparas inte och skickas inte vidare.</p>
    <p><button type="button" class="dela har-sluta">Sluta visa min plats</button></p>
    </div>`);
  harRitad = { ...harPlats, vagar: vagar.length };
  const ruta = $('detalj');
  ruta.querySelectorAll('[data-vag]').forEach((k) => k.addEventListener('click', () => {
    const v = vagar[+k.dataset.vag];
    karta.flyTo({ center: v.m, zoom: Math.max(karta.getZoom(), 14), duration: 800 });
    visaVag(v);
  }));
  ruta.querySelectorAll('[data-sten]').forEach((k) => k.addEventListener('click', () => gaTillInskrift(runor[+k.dataset.sten])));
  ruta.querySelector('.har-sluta').addEventListener('click', () => { slutaHar(); ruta.hidden = true; });
}

// På smal skärm ligger rutan över kartans nedre del; platsen centreras då i den del som syns ovanför.
function harCentrera(tid) {
  const ruta = $('detalj'), skymd = innerWidth <= 760 && !ruta.hidden ? ruta.offsetHeight : 0;
  karta.flyTo({ center: [harPlats.x, harPlats.y], zoom: Math.max(karta.getZoom(), 13), duration: tid, offset: [0, -skymd / 2] });
}

// Första positionen flyttar kartan och öppnar rutan; senare flyttar bara markören, och listan
// skrivs om när besökaren har gått en bit, så länge rutan fortfarande är den som visas.
function harNyPlats(p) {
  const forsta = !harPlats;
  harPlats = { x: p.coords.longitude, y: p.coords.latitude, fel: p.coords.accuracy };
  if (!harMarkor) {
    const el = document.createElement('div');
    el.className = 'har-prick';
    el.title = 'Din plats';
    harMarkor = new maplibregl.Marker({ element: el }).setLngLat([harPlats.x, harPlats.y]).addTo(karta);
  } else harMarkor.setLngLat([harPlats.x, harPlats.y]);
  if (forsta) {
    if (tur) avslutaTur();
    if (!lage.vagar) { $('visa-vagar').checked = true; $('visa-vagar').dispatchEvent(new Event('change', { bubbles: true })); }
    ritaHar();
    harCentrera(1200);
    vanta(() => vagar.length || laddade.get('vagar') === 'fel').then(() => { if (harPlats && $('detalj').querySelector('.har-jag')) ritaHar(); });
  } else if ($('detalj').querySelector('.har-jag') && !$('detalj').hidden
      && Math.hypot(...harMeter([harRitad.x, harRitad.y])) > 25) ritaHar();
}

// Tappas signalen en stund under vandringen ligger den senaste platsen kvar; bara ett nej till
// platsåtkomst, eller ett fel innan någon plats alls har kommit, stänger av läget.
function harFel(fel) {
  if (harPlats && fel.code !== 1) return;
  slutaHar();
  visaFlytt(null);
  visaRuta(`<div class="har-jag"><h2>Här är jag</h2>
    <p>${fel.code === 1 ? 'Webbläsaren fick inte läsa av din plats. Tillåt platsåtkomst för sidan i webbläsarens inställningar och försök igen.'
    : 'Din plats gick inte att bestämma just nu. Försök igen utomhus eller med platstjänster påslagna.'}</p></div>`);
}

function startaHar() {
  if (!navigator.geolocation) return harFel({ code: 2 });
  harKnapp.setAttribute('aria-pressed', 'true');
  document.body.classList.add('har-lage');   // på mobil göms panelen och tidslinjen så att kartan syns, se style.css
  harBevakning = navigator.geolocation.watchPosition(harNyPlats, harFel, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
}

function slutaHar() {
  if (harBevakning !== null) navigator.geolocation.clearWatch(harBevakning);
  harMarkor?.remove();
  harBevakning = harMarkor = harPlats = harRitad = null;
  harKnapp.setAttribute('aria-pressed', 'false');
  document.body.classList.remove('har-lage');
  karta.resize();
}

// Knappen ligger ovanför kartans zoomknappar. Är läget redan på visar den rutan igen och centrerar kartan.
function laggTillHar() {
  harKnapp = document.createElement('button');
  harKnapp.type = 'button';
  harKnapp.className = 'har-knapp';
  harKnapp.setAttribute('aria-pressed', 'false');
  harKnapp.title = 'Visa min plats och de gamla vägarna och runstenarna i närheten';
  harKnapp.innerHTML = '<span aria-hidden="true"></span>Här är jag';
  harKnapp.addEventListener('click', () => {
    if (harBevakning === null) return startaHar();
    if (!harPlats) return;
    ritaHar();
    harCentrera(800);
  });
  const hallare = document.createElement('div');
  hallare.className = 'maplibregl-ctrl har-hallare';
  hallare.appendChild(harKnapp);
  karta.addControl({ onAdd: () => hallare, onRemove: () => hallare.remove() }, 'bottom-right');
}
