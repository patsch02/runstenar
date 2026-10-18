// Berättelser (guidade turer ur data/turer.json).
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

// ---------- Berättelser ----------

// Guidade turer ur data/turer.json. Varje steg ställer in år, kartläge och markerade
// inskrifter, slår på de lager det nämner och kan öppna en inskrift eller peka ut en plats
// som saknar runstenar (som Salme). Lager som turen själv slår på slås av igen när ett steg
// inte längre nämner dem och när turen avslutas.
let turer = [], tur = null, turSteg = 0, turMarkorer = [];
const turLager = new Set();
const sattLager = (namn, pa) => {
  const ruta = $(`visa-${namn}`);
  if (ruta && ruta.checked !== pa) { ruta.checked = pa; ruta.dispatchEvent(new Event('change', { bubbles: true })); }
};
const signumIndex = new Map();

function laggTillTurer() {
  runor.forEach((r, i) => signumIndex.set(r.s, i));
  $('turlista').innerHTML = turer.map((t, k) => `<li><button type="button" data-k="${k}">
    ${t.bild ? `<img class="tumme" data-fil="${esc(t.bild)}" alt="">` : '<span class="tumme"></span>'}
    <b>${esc(t.n)}</b><small>${esc(t.kort)}</small></button></li>`).join('');
  hamtaCommons(turer.flatMap((t) => [t.bild, ...t.steg.map((st) => st.bild)])).then(() => fyllCommons($('turlista')));
  karta.addSource('tur-linjer', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  karta.addLayer({ id: 'tur-linjer', type: 'line', source: 'tur-linjer', layout: { 'line-cap': 'round' },
    paint: { 'line-color': css('--accent'), 'line-width': 2.5, 'line-dasharray': [1.5, 2], 'line-opacity': 0.9 } });
  $('turlista').addEventListener('click', (e) => {
    const knapp = e.target.closest('button');
    if (knapp) startaTur(turer[+knapp.dataset.k]);
  });
  $('tur').addEventListener('click', (e) => {
    const knapp = e.target.closest('button');
    if (!knapp) return;
    if (knapp.dataset.steg) gaTillSteg(+knapp.dataset.steg);
    else if (knapp.dataset.sten) gaTillInskrift(runor[signumIndex.get(knapp.dataset.sten)]);
    else if (knapp.classList.contains('tillbaka')) avslutaTur();
  });
}

function startaTur(t) {
  tur = t;
  $('panel').classList.add('turlage');
  $('tur').hidden = false;
  gaTillSteg(0);
}

function gaTillSteg(n) {
  turSteg = Math.max(0, Math.min(tur.steg.length - 1, n));
  const st = tur.steg[turSteg];
  stoppa();
  for (const namn of [...turLager]) if (!(st.lager || []).includes(namn)) { sattLager(namn, false); turLager.delete(namn); }
  for (const namn of st.lager || []) if (!$(`visa-${namn}`)?.checked) { sattLager(namn, true); turLager.add(namn); }
  for (const [flagga, id] of [['sedan', 'visa-sedan'], ['grov', 'visa-grov'], ['bevarade', 'visa-bevarade'], ['forsvunna', 'visa-forsvunna']]) {
    lage[flagga] = true; $(id).checked = true;
  }
  if (!lage.typer.has('R')) { lage.typer.add('R'); document.querySelector('[data-typ="R"]').checked = true; ritaHistogram(); }
  const index = (st.s || []).map((s) => signumIndex.get(s)).filter((i) => i !== undefined);
  lage.fokus = index;   // övriga stenar tonas ner, även i steg utan egna stenar
  lage.ar = st.ar;
  uppdatera();

  if (index.length) markera(index, tur.n); else avmarkera();
  if (st.vy) karta.flyTo({ center: st.vy.c, zoom: st.vy.z, duration: 1200 });

  // Platser utan inskrifter (som fyndplatsen i Salme) och linjer (t.ex. färdvägar) för steget
  for (const m of turMarkorer) m.remove();
  turMarkorer = (st.platser || (st.plats ? [st.plats] : [])).map((pl) => {
    const el = document.createElement('div');
    el.className = `ort tur-plats${pl.liten ? ' liten' : ''}${pl.vanster ? ' vanster' : ''}`;
    el.innerHTML = `<i></i><span>${esc(pl.n)}</span>`;
    return new maplibregl.Marker({ element: el, anchor: pl.vanster ? 'right' : 'left', offset: [pl.vanster ? 6 : -6, 0] })
      .setLngLat([pl.x, pl.y]).addTo(karta);
  });
  karta.getSource('tur-linjer').setData({ type: 'FeatureCollection',
    features: (st.linjer || []).map((p) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p }, properties: {} })) });
  if (st.oppna && signumIndex.has(st.oppna)) visaInskrift(runor[signumIndex.get(st.oppna)]);
  else $('detalj').hidden = true;

  const sista = turSteg === tur.steg.length - 1;
  const stenar = (st.s || []).length && st.s.length <= 8
    ? `<div class="stenar">${st.s.map((s) => `<button type="button" data-sten="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '';
  $('tur').innerHTML = `
    <button type="button" class="tillbaka">← Alla berättelser</button>
    <h2>${esc(tur.n)}</h2>
    ${st.bild || tur.bild ? `<figure class="turbild"><img data-fil="${esc(st.bild || tur.bild)}" alt="">
      <figcaption>${st.bildtext ? `${esc(st.bildtext)} · ` : ''}<span class="upphov" data-fil="${esc(st.bild || tur.bild)}"></span></figcaption></figure>` : ''}
    <p class="stegnr">Steg ${turSteg + 1} av ${tur.steg.length} · år ${st.ar}</p>
    <h3>${esc(st.rubrik)}</h3>
    <p class="text">${esc(st.text)}</p>
    ${stenar}
    <div class="prickar">${tur.steg.map((_, k) => `<button type="button" data-steg="${k}" aria-label="Steg ${k + 1}"${k === turSteg ? ' aria-current="step"' : ''}></button>`).join('')}</div>
    <div class="knappar">
      <button type="button" data-steg="${turSteg - 1}"${turSteg === 0 ? ' disabled' : ''}>← Föregående</button>
      ${sista ? '<button type="button" class="tillbaka nasta">Avsluta</button>'
        : `<button type="button" class="nasta" data-steg="${turSteg + 1}">Nästa →</button>`}
    </div>`;
  $('panel').scrollTop = 0;
  hamtaCommons([st.bild || tur.bild]).then(() => fyllCommons($('tur')));
  skrivAdress(true);
}

function avslutaTur() {
  tur = null;
  for (const m of turMarkorer) m.remove();
  turMarkorer = [];
  karta.getSource('tur-linjer')?.setData({ type: 'FeatureCollection', features: [] });
  for (const namn of turLager) sattLager(namn, false);
  turLager.clear();
  lage.fokus = null;
  uppdatera();
  avmarkera();
  $('detalj').hidden = true;
  $('tur').hidden = true;
  $('panel').classList.remove('turlage');
  skrivAdress(true);
}
