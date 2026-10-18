// Kartan, inskrifternas lager med kluster, leder och linjen för flyttade stenar.
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

// ---------- Karta ----------

// Bakgrundskartan är OpenFreeMaps vektorstil, rensad på allt som inte fanns
// på runstenarnas tid: vägar, järnvägar, bebyggelse, gränser och ortnamn.
// Svarar OpenFreeMap inte inom åtta sekunder används en enfärgad reservbakgrund,
// så att inskrifterna och lagren ändå syns (utan kustlinjer).
const KARTSTIL = `https://tiles.openfreemap.org/styles/${mork ? 'dark' : 'positron'}`;
async function hamtaStil(farg) {
  try {
    const stopp = new AbortController();
    const timer_ = setTimeout(() => stopp.abort(), 8000);
    const svar = await fetch(KARTSTIL, { signal: stopp.signal });
    clearTimeout(timer_);
    if (!svar.ok) throw new Error(`HTTP ${svar.status}`);
    return await svar.json();
  } catch (fel) {
    console.warn('Bakgrundskartan:', fel);
    meddela('karta', 'Bakgrundskartan kunde inte hämtas från OpenFreeMap. Inskrifterna visas ändå, på en enkel bakgrund utan kustlinjer.');
    return { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': farg.land } }] };
  }
}

async function skapaKarta() {
  const farg = mork
    ? { land: '#1d1d1b', vatten: '#0d1720', skog: '#212520' }
    : { land: '#ece3d0', vatten: '#a9c1d0', skog: '#dfe0c6' };
  const stil = await hamtaStil(farg);
  stil.layers = stil.layers.filter((l) => /^(background|water|waterway|park|landcover.*|landuse_park)$/.test(l.id));
  for (const l of stil.layers) {
    if (l.id === 'background') l.paint = { 'background-color': farg.land };
    else if (l.id === 'water') l.paint = { 'fill-color': farg.vatten };
    else if (l.id === 'waterway') l.paint = { ...l.paint, 'line-color': farg.vatten };
    else if (/wood|park/.test(l.id)) l.paint = { 'fill-color': farg.skog };
    else l.paint = { 'fill-color': farg.land };
  }
  karta = new maplibregl.Map({
    container: 'karta',
    style: stil,
    center: [15.2, 58.6],
    zoom: 4.7,
    maxZoom: 16,
    attributionControl: false,
  });
  karta.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: 'Inskrifter: Samnordisk runtextdatabas / RAÄ',
  }), 'bottom-right');
  karta.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  // Fel från kartans källor: strandlinjen (SGU) och kartrutorna får ett meddelande, resten loggas.
  karta.on('error', (e) => {
    const kalla = e.sourceId || '';
    if (kalla.startsWith('strand-')) meddela('strand', 'Strandlinjen kunde inte hämtas från SGU just nu. Övriga lager fungerar.');
    else if (kalla === 'openmaptiles' || kalla === 'ne2_shaded') meddela('karta', 'Delar av bakgrundskartan kunde inte hämtas från OpenFreeMap.');
    else console.error(e.error || e);
  });
  return new Promise((redo) => karta.once('style.load', redo));   // vänta på stilen, inte på alla kartrutor
}

// På avstånd (zoom under KLUSTER_ZOOM) slås täta stenar ihop till ringar med antal. MapLibre klustrar
// innan lagrets filter tillämpas, så klustren räknas om ur de stenar som syns det valda året.
// Ringens färg går från blått till rött med andelen som ristades kring året. Under en berättelse och
// i stil- och ristarläge ritas alla stenar som prickar, eftersom färgen där bär annan information.
const KLUSTER_ZOOM = 7;
const STENLAGER = ['runor', 'runor-ensam', 'kluster'];
let stenpunkter = [], klusterNyckel = '';

function laggTillInskrifter() {
  const antal = new Map();
  for (const r of runor) { const n = forstaRistare(r); if (n) antal.set(n, (antal.get(n) || 0) + 1); }
  toppristare = [...antal].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);

  stenpunkter = runor.map((r, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.x, r.y] },
        properties: { i, a: r.a, b: r.b, k: r.k, snav: r.b - r.a <= SNAV, borta: !!r.fs, bro: !!r.br,
          stil: kategori(r, 'stil'), rist: kategori(r, 'ristare') },
  }));
  karta.addSource('runor', { type: 'geojson', data: { type: 'FeatureCollection', features: stenpunkter } });
  karta.addLayer({ id: 'runor', type: 'circle', source: 'runor', paint: { 'circle-stroke-color': css('--yta') } });

  karta.addSource('runor-kluster', {
    type: 'geojson', data: { type: 'FeatureCollection', features: [] },
    cluster: true, clusterRadius: 28, clusterMaxZoom: KLUSTER_ZOOM - 1, clusterMinPoints: 6,
    clusterProperties: { nu: ['+', ['case', ['get', 'nu'], 1, 0]] },
  });
  karta.addLayer({ id: 'runor-ensam', type: 'circle', source: 'runor-kluster', maxzoom: KLUSTER_ZOOM,
    filter: ['!', ['has', 'point_count']], paint: { 'circle-stroke-color': css('--yta') } });
  // Ringens yta följer antalet; den röda kärnan har samma yta som andelen som ristades kring året.
  const radie = ['interpolate', ['linear'], ['get', 'point_count'], 6, 10, 100, 16, 1000, 26];
  karta.addLayer({ id: 'kluster', type: 'circle', source: 'runor-kluster', maxzoom: KLUSTER_ZOOM, filter: ['has', 'point_count'],
    paint: { 'circle-color': css('--sedan'), 'circle-opacity': 0.35, 'circle-radius': radie,
      'circle-stroke-color': css('--sedan'), 'circle-stroke-width': 1.2, 'circle-stroke-opacity': 0.9 } });
  karta.addLayer({ id: 'kluster-nu', type: 'circle', source: 'runor-kluster', maxzoom: KLUSTER_ZOOM,
    filter: ['all', ['has', 'point_count'], ['>', ['get', 'nu'], 0]],
    paint: { 'circle-color': css('--nu'), 'circle-opacity': 0.9,
      'circle-radius': ['*', radie, ['sqrt', ['/', ['get', 'nu'], ['get', 'point_count']]]] } });
  karta.addLayer({ id: 'kluster-tal', type: 'symbol', source: 'runor-kluster', maxzoom: KLUSTER_ZOOM, filter: ['has', 'point_count'],
    layout: { 'text-field': ['to-string', ['get', 'point_count']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': true },
    paint: { 'text-color': css('--text'), 'text-halo-color': css('--yta'), 'text-halo-width': 1.4 } });
  karta.on('zoomend', () => { if (karta.getZoom() < KLUSTER_ZOOM) ritaKluster(); });

  tips = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  for (const lager of ['runor', 'runor-ensam']) {
  karta.on('mousemove', lager, (e) => {
    const r = runor[e.features[0].properties.i];
    karta.getCanvas().style.cursor = 'pointer';
    tips.setLngLat([r.x, r.y])
      .setHTML(`<b>${esc(r.s)}</b> · ${datering(r)}<small>${esc([r.pl, r.la].filter(Boolean).join(', '))}</small>`)
      .addTo(karta);
  });
  karta.on('mouseleave', lager, () => { karta.getCanvas().style.cursor = ''; tips.remove(); });
  karta.on('click', lager, (e) => visaInskrift(runor[e.features[0].properties.i]));
  }

  karta.on('mousemove', 'kluster', (e) => {
    const { point_count: n, nu } = e.features[0].properties;
    karta.getCanvas().style.cursor = 'pointer';
    tips.setLngLat(e.features[0].geometry.coordinates)
      .setHTML(`<b>${n.toLocaleString('sv-SE')} inskrifter</b>${nu ? ` · ${nu} ristade kring ${lage.ar}` : ''}<small>Klicka för att zooma in</small>`)
      .addTo(karta);
  });
  karta.on('mouseleave', 'kluster', () => { karta.getCanvas().style.cursor = ''; tips.remove(); });
  karta.on('click', 'kluster', async (e) => {
    const f = e.features[0];
    const zoom = await karta.getSource('runor-kluster').getClusterExpansionZoom(f.properties.cluster_id);
    karta.easeTo({ center: f.geometry.coordinates, zoom: Math.max(zoom, karta.getZoom() + 1), duration: 600 });
  });
}

// Klustren byggs bara om när något som påverkar dem har ändrats och kartan är utzoomad.
function ritaKluster() {
  const pa = !lage.fokus && lage.farg === 'tid';
  karta.setLayerZoomRange('runor', pa ? KLUSTER_ZOOM : 0, 24);
  for (const id of ['runor-ensam', 'kluster', 'kluster-nu', 'kluster-tal']) karta.setLayoutProperty(id, 'visibility', pa ? 'visible' : 'none');
  if (!pa || karta.getZoom() >= KLUSTER_ZOOM) return;
  const Y = lage.ar;
  const nyckel = [Y, ...lage.typer, lage.sedan, lage.grov, lage.bevarade, lage.forsvunna].join();
  if (nyckel === klusterNyckel) return;
  klusterNyckel = nyckel;
  const features = [];
  for (const f of stenpunkter) {
    const p = f.properties, inom = p.b >= Y;
    if (p.a > Y || !lage.typer.has(p.k)) continue;
    if ((!lage.sedan && !inom) || (!lage.grov && inom && !p.snav)) continue;
    if (p.borta ? !lage.forsvunna : !lage.bevarade) continue;
    features.push({ type: 'Feature', geometry: f.geometry, properties: { ...p, nu: inom && p.snav } });
  }
  karta.getSource('runor-kluster').setData({ type: 'FeatureCollection', features });
}

// Tillstånd för en inskrift år Y: ännu inte ristad (filtreras bort),
// "nu" (Y inom ett snävt spann), "grov" (Y inom ett brett spann) eller "sedan".
function ritaInskrifter() {
  const Y = lage.ar;
  const inom = ['>=', ['get', 'b'], Y];
  const nu = ['all', inom, ['get', 'snav']];
  const filter = ['all', ['<=', ['get', 'a'], Y], ['in', ['get', 'k'], ['literal', [...lage.typer]]]];
  if (!lage.sedan) filter.push(inom);
  if (!lage.grov) filter.push(['any', ['!', inom], ['get', 'snav']]);
  if (!lage.bevarade) filter.push(['get', 'borta']);
  if (!lage.forsvunna) filter.push(['!', ['get', 'borta']]);

  // Försvunna inskrifter ritas som ringar på sin äldsta kända plats.
  const borta = ['get', 'borta'];
  const tidfarg = ['case', nu, css('--nu'), inom, css('--grov'), css('--sedan')];
  // I stil- och ristarläge bär färgen kategorin; tiden syns då bara i storlek och styrka.
  const farg = lage.farg === 'tid' ? tidfarg
    : ['match', ['get', lage.farg === 'stil' ? 'stil' : 'rist'], ...KULORER.flatMap((k, i) => [i, k]), 8, css('--annan'), css('--grov')];

  const malaStenar = (egenskap, varde) => { for (const id of ['runor', 'runor-ensam']) karta.setPaintProperty(id, egenskap, varde); };
  const sorteraStenar = (varde) => { for (const id of ['runor', 'runor-ensam']) karta.setLayoutProperty(id, 'circle-sort-key', varde); };
  karta.setFilter('runor', filter);
  ritaKluster();
  sorteraStenar(['case', nu, 2, inom, 0, 1]);
  malaStenar('circle-color', farg);
  // Under en berättelse (lage.fokus = inskrifternas index) tonas alla andra stenar ner.
  const fokus = lage.fokus ? ['in', ['get', 'i'], ['literal', lage.fokus]] : true;
  const tona = (uttryck) => (lage.fokus ? ['case', fokus, uttryck, 0.08] : uttryck);
  if (lage.fokus) sorteraStenar(['case', fokus, 3, nu, 2, inom, 0, 1]);
  malaStenar('circle-opacity', tona(['case', borta, 0.12, nu, 0.95, inom, 0.4, 0.55]));
  malaStenar('circle-stroke-color', ['case', borta, farg, css('--yta')]);
  malaStenar('circle-stroke-width', ['case', borta, 1.6, nu, 1, lage.farg === 'tid' ? 0 : 0.75]);   // tunn kant i kategoriläge skiljer stenarna från bakgrundslagren
  malaStenar('circle-stroke-opacity', tona(['case', nu, 1, inom, 0.65, 0.85]));
  ritaResor(lage.fokus ? [...filter, fokus] : filter, nu, tidfarg);
  malaStenar('circle-radius', [
    'interpolate', ['linear'], ['zoom'],
    4, ['case', nu, 3.2, 1.8],
    9, ['case', nu, 6, 4],
    14, ['case', nu, 9, 7],
  ]);
}

// Farleder och landvägar: schematiska linjer som visas de år leden var i bruk.
function laggTillLeder() {
  karta.addSource('leder', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: leder.map((l, i) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: l.p },
        properties: { i, n: l.n, t: l.t, a: l.a, b: l.b ?? 9999 },
      })),
    },
  });
  const ar = { 'line-join': 'round', 'line-cap': 'round' };
  karta.addLayer({ id: 'leder-hav', type: 'line', source: 'leder', layout: ar,
    paint: { 'line-color': css('--led-hav'), 'line-width': 1.6, 'line-dasharray': [1, 2.5] } });
  karta.addLayer({ id: 'leder-land', type: 'line', source: 'leder', layout: ar,
    paint: { 'line-color': css('--led-land'), 'line-width': 2 } });
  karta.addLayer({ id: 'leder-namn', type: 'symbol', source: 'leder',
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'],
      'text-size': 11, 'text-offset': [0, -0.9], 'symbol-spacing': 420, 'text-max-angle': 35 },
    paint: { 'text-color': css('--text-2'), 'text-halo-color': css('--yta'), 'text-halo-width': 1.5 } });
  karta.addLayer({ id: 'leder-traff', type: 'line', source: 'leder', paint: { 'line-width': 14, 'line-opacity': 0 } });

  karta.on('click', 'leder-traff', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;   // stenen går före
    visaLed(leder[e.features[0].properties.i]);
  });
  karta.on('mouseenter', 'leder-traff', () => { karta.getCanvas().style.cursor = 'pointer'; });
  karta.on('mouseleave', 'leder-traff', () => { karta.getCanvas().style.cursor = ''; });

  // Linje från en flyttad stens äldsta kända plats till där den står i dag
  karta.addSource('flytt', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  karta.addLayer({ id: 'flytt-linje', type: 'line', source: 'flytt', filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': css('--text'), 'line-width': 1.5, 'line-dasharray': [2, 2] } });
  karta.addLayer({ id: 'flytt-punkt', type: 'circle', source: 'flytt', filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 6, 'circle-color': css('--yta'), 'circle-stroke-color': css('--text'), 'circle-stroke-width': 2 } });
  karta.addLayer({ id: 'flytt-namn', type: 'symbol', source: 'flytt', filter: ['==', ['geometry-type'], 'Point'],
    layout: { 'text-field': 'Står i dag', 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-allow-overlap': true },
    paint: { 'text-color': css('--text'), 'text-halo-color': css('--yta'), 'text-halo-width': 1.5 } });
}

function ritaLeder() {
  const Y = lage.ar;
  const iBruk = ['all', ['<=', ['get', 'a'], Y], ['>=', ['get', 'b'], Y]];
  const syns = lage.leder ? 'visible' : 'none';
  for (const [id, typ] of [['leder-hav', 'farled'], ['leder-land', 'landväg'], ['leder-namn', null], ['leder-traff', null]]) {
    karta.setFilter(id, typ ? ['all', iBruk, ['==', ['get', 't'], typ]] : iBruk);
    karta.setLayoutProperty(id, 'visibility', syns);
  }
}

function visaFlytt(r) {
  const features = r && r.cx ? [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[r.x, r.y], [r.cx, r.cy]] }, properties: {} },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [r.cx, r.cy] }, properties: {} },
  ] : [];
  karta.getSource('flytt').setData({ type: 'FeatureCollection', features });
}

function avstandKm(x1, y1, x2, y2) {
  const rad = Math.PI / 180, dy = (y2 - y1) * rad, dx = (x2 - x1) * rad;
  const h = Math.sin(dy / 2) ** 2 + Math.cos(y1 * rad) * Math.cos(y2 * rad) * Math.sin(dx / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
