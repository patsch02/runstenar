// Sökning och markering av inskrifter.
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

// ---------- Sökning ----------

// Sökningen går över signum, plats (fyndplats, socken, landskap) och ristare.
// En träff på en ristare eller socken markerar alla dess inskrifter på kartan,
// oavsett vilket år tidslinjen står på.
// Utan diakritiska tecken och med fornnordiska bokstäver utskrivna, så att "knut" hittar Knútr.
const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/þ/g, 'th').replace(/ð/g, 'd').replace(/æ/g, 'ae').replace(/[ǫø]/g, 'o').replace(/œ/g, 'oe')
  .replace(/\s+/g, ' ').trim();
const utanBlank = (t) => norm(t).replace(/ /g, '');
let sokindex = null;

function byggSokindex() {
  const ristare = new Map(), platser = new Map(), landskap = new Map(), personer = new Map();
  const lagg = (karta_, namn, i) => { if (!karta_.has(namn)) karta_.set(namn, []); karta_.get(namn).push(i); };
  runor.forEach((r, i) => {
    for (const namn of (r.c || '').split(', ')) if (namn) lagg(ristare, namn.replace(/\?$/, ''), i);
    if (r.so) lagg(platser, `${r.so}${r.la ? `, ${r.la}` : ''}`, i);
    // Landskapskoder som "NO" och "Okänd" hoppas över; landet finns alltid som egen träff.
    if (r.la && !/^[A-Z]{2,3}$|känd/.test(r.la)) lagg(landskap, r.co && r.co !== r.la ? `${r.la}, ${r.co}` : r.la, i);
    if (r.co) lagg(landskap, r.co, i);
    for (const namn of r.pn || []) lagg(personer, namn, i);
  });
  sokindex = { ristare: [...ristare], platser: [...platser], landskap: [...landskap], personer: [...personer] };
}

function sok(fraga) {
  const q = norm(fraga), qs = utanBlank(fraga);
  if (q.length < 2) return null;
  const grupp = (lista) => lista.filter(([namn]) => norm(namn).includes(q))
    .sort((a, b) => (norm(b[0]).startsWith(q) - norm(a[0]).startsWith(q)) || b[1].length - a[1].length).slice(0, 6);
  const inskrifter = [];
  runor.forEach((r, i) => {
    const sig = utanBlank(r.s);
    const rang = sig === qs ? 0 : sig.startsWith(qs) ? 1 : norm(r.pl).includes(q) ? 2 : sig.includes(qs) ? 3 : -1;
    if (rang >= 0) inskrifter.push([rang, i]);
  });
  inskrifter.sort((a, b) => a[0] - b[0] || runor[a[1]].s.localeCompare(runor[b[1]].s, 'sv', { numeric: true }));
  return { ristare: grupp(sokindex.ristare), personer: grupp(sokindex.personer), landskap: grupp(sokindex.landskap), platser: grupp(sokindex.platser), inskrifter };
}

function visaSoktraffar() {
  const lista = $('traffar'), t = sok($('sok').value);
  if (!t) { lista.hidden = true; lista.innerHTML = ''; return; }
  const rad = (typ, nyckel, text, under) =>
    `<li><button type="button" data-typ="${typ}" data-nyckel="${esc(nyckel)}"><span>${esc(text)}</span><small>${esc(under)}</small></button></li>`;
  const antal = (n) => `${n} ${n === 1 ? 'inskrift' : 'inskrifter'}`;
  let html = '';
  if (t.ristare.length) html += `<li class="grupp">Ristare</li>${t.ristare.map(([n, ix]) => rad('ristare', n, n, antal(ix.length))).join('')}`;
  if (t.personer.length) html += `<li class="grupp">Personnamn i texterna</li>${t.personer.map(([n, ix]) => rad('person', n, n, antal(ix.length))).join('')}`;
  if (t.landskap.length) html += `<li class="grupp">Landskap och länder</li>${t.landskap.map(([n, ix]) => rad('landskap', n, n, antal(ix.length))).join('')}`;
  if (t.platser.length) html += `<li class="grupp">Socknar</li>${t.platser.map(([n, ix]) => rad('plats', n, n, antal(ix.length))).join('')}`;
  if (t.inskrifter.length) {
    html += `<li class="grupp">Inskrifter${t.inskrifter.length > 12 ? ` (12 av ${t.inskrifter.length})` : ''}</li>`;
    html += t.inskrifter.slice(0, 12).map(([, i]) => rad('inskrift', i, runor[i].s, [runor[i].pl, runor[i].la].filter(Boolean).join(', '))).join('');
  }
  lista.innerHTML = html || '<li class="grupp">Inga träffar</li>';
  lista.hidden = false;
}

function valjSoktraff(typ, nyckel) {
  $('traffar').hidden = true;
  if (typ === 'inskrift') return gaTillInskrift(runor[+nyckel]);
  const [namn, index] = sokindex[{ ristare: 'ristare', landskap: 'landskap', plats: 'platser', person: 'personer' }[typ]].find(([n]) => n === nyckel);
  markera(index, typ === 'ristare' ? `Ristare: ${namn}` : typ === 'person' ? `Namnet ${namn}` : namn);
}

// Flyttar kartan och tidslinjen så att inskriften syns, och öppnar dess ruta.
function gaTillInskrift(r) {
  if (!lage.typer.has(r.k)) {
    lage.typer.add(r.k);
    document.querySelector(`[data-typ="${r.k}"]`).checked = true;
    ritaHistogram();
  }
  for (const [flagga, id] of [[r.fs ? 'forsvunna' : 'bevarade', r.fs ? 'visa-forsvunna' : 'visa-bevarade'], ['sedan', 'visa-sedan'], ['grov', 'visa-grov']]) {
    lage[flagga] = true; $(id).checked = true;
  }
  stoppa();
  if (lage.ar < r.a || lage.ar > AR_MAX) lage.ar = Math.min(AR_MAX, Math.max(AR_MIN, Math.round((r.a + r.b) / 2)));
  uppdatera();
  karta.flyTo({ center: [r.x, r.y], zoom: Math.max(karta.getZoom(), 11), duration: 800 });
  visaInskrift(r);
}

function markera(index, rubrik) {
  karta.setFilter('markerade', ['in', ['get', 'i'], ['literal', index]]);
  karta.setLayoutProperty('markerade', 'visibility', 'visible');
  $('markering').hidden = false;
  $('markering-text').textContent = `${rubrik} · ${index.length} ${index.length === 1 ? 'inskrift' : 'inskrifter'}`;
  const xs = index.map((i) => runor[i].x), ys = index.map((i) => runor[i].y);
  const span = index.map((i) => runor[i]);
  $('markering-ar').textContent = `Daterade ${Math.min(...span.map((r) => r.a))}–${Math.max(...span.map((r) => r.b))}`;
  const bred = karta.getContainer().clientWidth > 760;   // på smal skärm täcker panelerna inte kartans sidor
  karta.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
    { padding: bred ? { top: 60, bottom: 150, left: 330, right: 60 } : 40, maxZoom: 11, duration: 800 });
}

function avmarkera() {
  karta.setLayoutProperty('markerade', 'visibility', 'none');
  $('markering').hidden = true;
}

function kopplaSok() {
  byggSokindex();
  karta.addLayer({ id: 'markerade', type: 'circle', source: 'runor', layout: { visibility: 'none' },
    paint: { 'circle-color': css('--text'), 'circle-opacity': 0.15, 'circle-stroke-color': css('--text'), 'circle-stroke-width': 2,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 9, 9, 14, 13] } });
  karta.on('click', 'markerade', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;   // synliga stenar hanteras av sitt eget lager
    gaTillInskrift(runor[e.features[0].properties.i]);
  });
  $('sok').addEventListener('input', visaSoktraffar);
  $('sok').addEventListener('focus', visaSoktraffar);
  $('sok').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('traffar').hidden = true; }
    if (e.key === 'Enter') $('traffar').querySelector('button')?.click();
  });
  $('traffar').addEventListener('click', (e) => {
    const knapp = e.target.closest('button');
    if (knapp) valjSoktraff(knapp.dataset.typ, knapp.dataset.nyckel);
  });
  $('avmarkera').addEventListener('click', avmarkera);
  $('farg').addEventListener('change', (e) => { lage.farg = e.target.value; ritaFarglegend(); uppdatera(); });
}
