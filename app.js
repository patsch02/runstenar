// Runstenar i tid och rum
// Kartan ritar tre lager ovanpå en bakgrundskarta utan moderna ortnamn:
// inskrifter (ett cirkellager som filtreras på år), orter (HTML-markörer)
// och en tidslinje med histogram som styr vilket år som visas.

const AR_MIN = 150, AR_MAX = 1550;
const SNAV = 120;            // största spann (år) som räknas som snäv datering
const EPOKER = [
  [375, 'Romersk järnålder'], [550, 'Folkvandringstid'], [800, 'Vendeltid'],
  [1050, 'Vikingatid'], [1520, 'Medeltid'], [Infinity, 'Nyare tid'],
];
const ORTTYPER = { stad: 'Stad', handelsplats: 'Handelsplats', kungsgård: 'Kungsgård / maktcentrum', ringborg: 'Ringborg' };

const $ = (id) => document.getElementById(id);
const satt = (id, text) => { const el = $(id); if (el) el.textContent = text; };
const css = (namn) => getComputedStyle(document.documentElement).getPropertyValue(namn).trim();
const mork = matchMedia('(prefers-color-scheme: dark)').matches;

const lage = {
  ar: 1030, typer: new Set(['R']), sedan: true, grov: true, orter: true,
  bevarade: true, forsvunna: true, leder: true, spelar: false,
  resor: false, broar: false, vagar: false, bygd: false, gravar: false, ode: false,
};
// Från start visas bara inskrifterna, strandlinjen, orter och leder; övriga lager slås på i panelen.
let gravfalt = [], odegardar = [], kult = [], kyrkor = [], fardnamn = [];
lage.fardnamn = false;
let sjofart = [], forsvar = [], skatter = [];
lage.skatter = false;
let mynt = [];
let bilder = {};          // signum (versaler) → Commons-filnamn eller RAÄ-arkivbild, se bildHtml()
lage.mynt = false;
lage.forsvar = false;
lage.sjofart = false; lage.batarAlla = false;
lage.kult = false; lage.kyrkor = false;
lage.fokus = null;      // index för inskrifterna i en pågående berättelse, se gaTillSteg()
// Panelen är byggd kring frågorna var man bodde och hur man färdades. Några lager togs därför
// bort för tydlighetens skull; koden och datafilerna finns kvar. Öde-namn (lage.odenamn),
// husgrunder och ödetomter (odegardar.json), färdnamn (fardnamn.json) och skattfynd
// (skatter.json) laddas inte. Sjöspärrar och båtar, vårdkasar och offerplatser filtreras bort.
lage.odenamn = false;
const SJOFART_VISA = ['hamn'];

// Färgläggning: "tid" (ristas nu / finns sedan tidigare / grovt daterad), "stil" eller "ristare".
// Kategorifärgerna är åtta kulörer i fast ordning; allt utanför kategorierna blir grått.
lage.farg = 'tid';
const KULORER = mork
  ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
  : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const STILAR = [
  ['Rak', 'Rak (oornerad)', 'ca 980–1015'], ['Fp', 'Fp (fågelperspektiv)', 'ca 1010–1050'],
  ['Pr1', 'Pr 1', 'ca 1010–1040'], ['Pr2', 'Pr 2', 'ca 1020–1050'], ['Pr3', 'Pr 3', 'ca 1045–1075'],
  ['Pr4', 'Pr 4', 'ca 1070–1100'], ['Pr5', 'Pr 5', 'ca 1100–1130'], ['Kb', 'Kb (korsband)', ''],
];
let toppristare = [];   // de åtta ristare som har flest inskrifter
const forstaStil = (r) => (r.st || '').split(', ')[0].replace(/[^A-Za-z0-9]/g, '');
const forstaRistare = (r) => (r.c || '').split(', ')[0].replace(/\?$/, '');
// Kategori (0–7) för en inskrift i valt färgläge, 8 = annan, 9 = uppgift saknas
function kategori(r, lage_) {
  if (lage_ === 'stil') {
    const i = STILAR.findIndex(([k]) => k === forstaStil(r));
    return i >= 0 ? i : r.st ? 8 : 9;
  }
  const namn = forstaRistare(r);
  if (!namn) return 9;
  const i = toppristare.indexOf(namn);
  return i >= 0 ? i : 8;
}
let runor = [], orter = [], leder = [], resmal = {}, vagar = [], ortnamn = [], karta, tips, klar = false;

// Ortnamnstyper och den period då namnen i huvudsak bildades. Lagret tonas in
// över perioden: det säger något om bygden som helhet, inte om den enskilda gården.
const NAMNTYPER = {
  1: { n: '-inge, -hem, -lösa', p: 'äldre järnålder', a: 1, b: 550 },
  2: { n: '-sta, -tuna', p: 'yngre järnålder', a: 300, b: 800 },
  3: { n: '-by', p: 'yngre järnålder och vikingatid', a: 550, b: 1050 },
  4: { n: '-torp, -arp, -rup', p: 'sen vikingatid och tidig medeltid', a: 950, b: 1300 },
  5: { n: '-ryd, -röd, -boda, -måla, -säter, -böle', p: 'medeltida nyodling', a: 1050, b: 1400 },
  6: { n: 'Öde-', p: 'gård som övergetts, troligen under senmedeltidens kris', a: 1350, b: 1450 },
};
const RIKTNINGAR = { öst: 'färd österut', väst: 'färd västerut', syd: 'färd söderut' };

// ---------- Karta ----------

// Bakgrundskartan är OpenFreeMaps vektorstil, rensad på allt som inte fanns
// på runstenarnas tid: vägar, järnvägar, bebyggelse, gränser och ortnamn.
async function skapaKarta() {
  const stil = await fetch(`https://tiles.openfreemap.org/styles/${mork ? 'dark' : 'positron'}`).then((s) => s.json());
  stil.layers = stil.layers.filter((l) => /^(background|water|waterway|park|landcover.*|landuse_park)$/.test(l.id));
  const farg = mork
    ? { land: '#1d1d1b', vatten: '#0d1720', skog: '#212520' }
    : { land: '#ece3d0', vatten: '#a9c1d0', skog: '#dfe0c6' };
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

// ---------- Resor och brostenar ----------

// En linje per sten och resmål som nämns i texten, plus en ring kring stenar
// som nämner brobygge. Båda följer samma filter och färger som stenarna.
function laggTillResor() {
  const features = [];
  runor.forEach((r, i) => {
    for (const k of r.rs || []) {
      const m = resmal[k];
      if (!m) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[r.x, r.y], [m.x, m.y]] },
        properties: { i, a: r.a, b: r.b, k: r.k, snav: r.b - r.a <= SNAV, borta: !!r.fs, m: k },
      });
    }
  });
  karta.addSource('resor', { type: 'geojson', data: { type: 'FeatureCollection', features } });
  karta.addLayer({ id: 'resor', type: 'line', source: 'resor', layout: { 'line-cap': 'round' }, paint: { 'line-width': 1 } });
  karta.addSource('resmal', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  karta.addLayer({ id: 'resmal', type: 'symbol', source: 'resmal',
    layout: { 'text-field': ['get', 't'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true },
    paint: { 'text-color': css('--nu'), 'text-halo-color': css('--yta'), 'text-halo-width': 2 } });
}

function laggTillBroringar() {
  karta.addLayer({ id: 'bro', type: 'circle', source: 'runor',
    paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': css('--text'), 'circle-stroke-width': 1.5,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4.5, 9, 9, 14, 13] } });
}

function ritaResor(filter, nu, farg) {
  if (!karta.getLayer('resor')) return;
  karta.setFilter('resor', filter);
  karta.setLayoutProperty('resor', 'visibility', lage.resor ? 'visible' : 'none');
  karta.setLayoutProperty('resmal', 'visibility', lage.resor ? 'visible' : 'none');
  karta.setPaintProperty('resor', 'line-color', farg);
  karta.setPaintProperty('resor', 'line-opacity', lage.fokus ? 0.6 : ['case', nu, 0.4, 0.07]);
  karta.setFilter('bro', [...filter, ['get', 'bro']]);
  karta.setLayoutProperty('bro', 'visibility', lage.broar ? 'visible' : 'none');
}

// ---------- Lokala vägar ur fornlämningsregistret ----------

function laggTillVagar() {
  const linjer = [], punkter = [];
  vagar.forEach((v, i) => {
    if (v.l) linjer.push({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: v.l }, properties: { i } });
    punkter.push({ type: 'Feature', geometry: { type: 'Point', coordinates: v.m }, properties: { i, t: v.t } });
  });
  karta.addSource('vag-linjer', { type: 'geojson', data: { type: 'FeatureCollection', features: linjer } });
  karta.addSource('vag-punkter', { type: 'geojson', data: { type: 'FeatureCollection', features: punkter } });
  const under = karta.getLayer('leder-hav') ? 'leder-hav' : undefined;
  // Utzoomat syns varje lämning som en liten prick, inzoomat som sin verkliga sträckning.
  karta.addLayer({ id: 'vag-prick', type: 'circle', source: 'vag-punkter', maxzoom: 10, filter: ['==', ['get', 't'], 'väg'],
    paint: { 'circle-color': css('--led-land'), 'circle-opacity': 0.55,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 9, 2.2] } }, under);
  karta.addLayer({ id: 'vag-linje', type: 'line', source: 'vag-linjer', minzoom: 8,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': css('--led-land'), 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 14, 3.5] } }, under);
  karta.addLayer({ id: 'vag-bro', type: 'circle', source: 'vag-punkter', minzoom: 7, filter: ['!=', ['get', 't'], 'väg'],
    paint: { 'circle-color': css('--yta'), 'circle-stroke-color': css('--led-land'), 'circle-stroke-width': 1.5,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 1.5, 12, 4.5] } }, under);
  karta.addLayer({ id: 'vag-traff', type: 'line', source: 'vag-linjer', minzoom: 8, paint: { 'line-width': 12, 'line-opacity': 0 } }, under);
  for (const id of ['vag-traff', 'vag-bro']) {
    karta.on('click', id, (e) => {
      if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
      visaVag(vagar[e.features[0].properties.i]);
    });
    karta.on('mouseenter', id, () => { karta.getCanvas().style.cursor = 'pointer'; });
    karta.on('mouseleave', id, () => { karta.getCanvas().style.cursor = ''; });
  }
  ritaVagar();
}

function ritaVagar() {
  for (const id of ['vag-prick', 'vag-linje', 'vag-bro', 'vag-traff']) {
    if (karta.getLayer(id)) karta.setLayoutProperty(id, 'visibility', lage.vagar ? 'visible' : 'none');
  }
}

function visaVag(v) {
  visaFlytt(null);
  const typ = { väg: 'Färdväg', bro: 'Bro', vad: 'Vadställe' }[v.t];
  visaRuta(`
    <h2>${esc(v.n || typ)}</h2>
    <p class="under">${typ}${v.nr ? ` · ${esc(v.nr)}` : ''} · ${esc([v.so, v.la].filter(Boolean).join(', '))}</p>
    ${v.d ? `<p>${esc(v.d)}${v.d.length >= 400 ? '…' : ''}</p>` : ''}
    <p class="not">Ur fornlämningsregistret. Lämningen är odaterad: den kan vara förhistorisk, medeltida eller yngre, och visas därför oberoende av tidslinjen.</p>
    ${v.u ? `<p><a href="${esc(v.u)}" target="_blank" rel="noopener">Öppna posten hos Riksantikvarieämbetet</a></p>` : ''}`);
}

// ---------- Bebyggelse enligt ortnamn ----------

function laggTillBygd() {
  karta.addSource('ortnamn', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: ortnamn.map(([n, x, y, g]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { n, g } })),
    },
  });
  const under = karta.getLayer('vag-prick') ? 'vag-prick' : karta.getLayer('leder-hav') ? 'leder-hav' : undefined;
  // En prick per namn i alla zoomnivåer, färgad efter namntypens period (--namn-1 äldst … --namn-5 yngst).
  karta.addLayer({ id: 'bygd-punkt', type: 'circle', source: 'ortnamn',
    paint: { 'circle-color': ['match', ['get', 'g'], 1, css('--namn-1'), 2, css('--namn-2'), 3, css('--namn-3'), 4, css('--namn-4'), css('--namn-5')],
      'circle-stroke-color': css('--yta'), 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 0, 8, 0.5],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 7, 2.2, 10, 3.5, 13, 5] } }, under);
  karta.addLayer({ id: 'bygd-ode', type: 'symbol', source: 'ortnamn', filter: ['==', ['get', 'g'], 6],
    layout: { 'text-field': '×', 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 18], 'text-allow-overlap': true },
    paint: { 'text-color': css('--text'), 'text-halo-color': css('--yta'), 'text-halo-width': 1 } }, under);
  for (const id of ['bygd-punkt', 'bygd-ode']) {
    karta.on('mousemove', id, (e) => {
      if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
      const p = e.features[0].properties, typ = NAMNTYPER[p.g];
      const nar = p.g < 6 ? ` · år ${lage.ar}: ${namnLage(p.g, lage.ar)}` : '';
      tips.setLngLat(e.lngLat).setHTML(`<b>${esc(p.n)}</b><small>Namntyp ${typ.n}: ${typ.p}, ca ${typ.a}–${typ.b}${nar}</small>`).addTo(karta);
    });
    karta.on('mouseleave', id, () => tips.remove());
  }
  ritaBygd();
}

// Namntypens läge år Y: hela bildningsperioden har passerat, pågår eller har inte börjat.
const namnLage = (g, Y) => (andel(g, Y) >= 1 ? 'äldre' : andel(g, Y) > 0 ? 'bildas nu' : 'ännu inte');

// Hur stor del av en namntyps bildningsperiod som har passerat år Y (0–1)
const andel = (g, Y) => Math.min(1, Math.max(0, (Y - NAMNTYPER[g].a) / (NAMNTYPER[g].b - NAMNTYPER[g].a)));

function ritaBygd() {
  if (!karta.getLayer('bygd-punkt')) return;
  const Y = lage.ar;
  const vikt = ['match', ['get', 'g'], 1, andel(1, Y), 2, andel(2, Y), 3, andel(3, Y), 4, andel(4, Y), 5, andel(5, Y), 0];
  const aktiva = [1, 2, 3, 4, 5].filter((g) => andel(g, Y) > 0);
  karta.setFilter('bygd-punkt', ['in', ['get', 'g'], ['literal', aktiva]]);
  karta.setPaintProperty('bygd-punkt', 'circle-opacity', vikt);
  karta.setPaintProperty('bygd-punkt', 'circle-stroke-opacity', vikt);
  karta.setPaintProperty('bygd-ode', 'text-opacity', andel(6, Y));
  karta.setLayoutProperty('bygd-punkt', 'visibility', lage.bygd ? 'visible' : 'none');
  $('namnlegend').hidden = !lage.bygd;
  $('namnlegend').innerHTML = [1, 2, 3, 4, 5].map((g) => `
    <li class="${namnLage(g, Y) === 'ännu inte' ? 'senare' : ''}"><i style="background:var(--namn-${g})"></i><span>${NAMNTYPER[g].n}<br><small>${NAMNTYPER[g].p}, ca ${NAMNTYPER[g].a}–${NAMNTYPER[g].b}</small></span><em>${namnLage(g, Y)}</em></li>`).join('');
  karta.setLayoutProperty('bygd-ode', 'visibility', lage.bygd && lage.odenamn && andel(6, Y) > 0 ? 'visible' : 'none');
  satt('antal-bygd', Math.round(ortnamn.reduce((s, o) => s + (o[3] < 6 ? andel(o[3], Y) : 0), 0)).toLocaleString('sv-SE'));
  satt('antal-ode', Math.round(ortnamn.filter((o) => o[3] === 6).length * andel(6, Y)).toLocaleString('sv-SE'));
}

// ---------- Gravfält och övergivna bosättningar ur fornlämningsregistret ----------

// Ett järnåldersgravfält hörde i regel till en gård eller by, så gravfälten
// visar var folk bodde före kristnandet. Åldern (g) är en tumregel utifrån
// gravtyperna: "a" äldre järnålder, "y" yngre järnålder, "o" okänt.
const GRAVALDER = {
  a: { n: 'troligen äldre järnålder (resta stenar, domarringar)', fran: -500, in: 0, ut: 550, till: 700 },
  y: { n: 'troligen yngre järnålder (högar)', fran: 400, in: 600, ut: 1050, till: 1150 },
  o: { n: 'järnålder, inte närmare bestämd', fran: -500, in: 0, ut: 1050, till: 1150 },
};
// Hur starkt ett gravfält i åldersgruppen g ska synas år Y (0–1)
function gravstyrka(g, Y) {
  const a = GRAVALDER[g];
  if (Y <= a.fran || Y >= a.till) return 0;
  if (Y < a.in) return (Y - a.fran) / (a.in - a.fran);
  if (Y > a.ut) return (a.till - Y) / (a.till - a.ut);
  return 1;
}
function laggTillGravfalt() {
  karta.addSource('gravfalt', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: gravfalt.map(([x, y, n, g], i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { i, n, g } })),
    },
  });
  const under = ['bygd-ode', 'vag-prick', 'leder-hav'].find((id) => karta.getLayer(id));
  const storlek = ['sqrt', ['max', 1, ['min', 200, ['get', 'n']]]];   // 1–14, växer med antalet gravar
  karta.addLayer({ id: 'gravfalt', type: 'circle', source: 'gravfalt',
    paint: { 'circle-color': css('--grav'), 'circle-stroke-color': css('--yta'),
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, 0, 10, 0.75],
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        4, ['+', 0.6, ['*', 0.08, storlek]],
        8, ['+', 1.4, ['*', 0.3, storlek]],
        13, ['+', 3, ['*', 0.9, storlek]]] } }, under);
  karta.on('click', 'gravfalt', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
    visaGravfalt(gravfalt[e.features[0].properties.i]);
  });
  karta.on('mouseenter', 'gravfalt', () => { karta.getCanvas().style.cursor = 'pointer'; });
  karta.on('mouseleave', 'gravfalt', () => { karta.getCanvas().style.cursor = ''; });
  ritaGravfalt();
}

function ritaGravfalt() {
  if (!karta.getLayer('gravfalt')) return;
  const Y = lage.ar;
  const styrka = ['match', ['get', 'g'], 'a', gravstyrka('a', Y), 'y', gravstyrka('y', Y), gravstyrka('o', Y)];
  const aktiva = ['a', 'y', 'o'].filter((g) => gravstyrka(g, Y) > 0);
  karta.setLayoutProperty('gravfalt', 'visibility', lage.gravar && aktiva.length ? 'visible' : 'none');
  karta.setFilter('gravfalt', ['in', ['get', 'g'], ['literal', aktiva]]);
  karta.setPaintProperty('gravfalt', 'circle-opacity', ['*', 0.6, styrka]);
  karta.setPaintProperty('gravfalt', 'circle-stroke-opacity', styrka);
  $('antal-gravar').textContent = lage.gravar
    ? Math.round(gravfalt.reduce((s, g) => s + gravstyrka(g[3], Y), 0)).toLocaleString('sv-SE') : 0;
}

function visaGravfalt([, , n, g, namn, nr, id]) {
  visaFlytt(null);
  visaRuta(`
    <h2>${esc(namn || 'Gravfält')}</h2>
    <p class="under">Gravfält${nr ? ` · ${esc(nr)}` : ''}</p>
    <dl>
      <dt>Gravar</dt><dd>${n || 'antal anges inte'}</dd>
      <dt>Ålder</dt><dd>${GRAVALDER[g].n}</dd>
    </dl>
    <p class="not">Ur fornlämningsregistret. Åldern är en tumregel utifrån vilka gravtyper som ingår, inte en datering av just det här gravfältet.</p>
    ${id ? `<p><a href="https://kulturarvsdata.se/raa/lamning/${esc(id)}" target="_blank" rel="noopener">Öppna posten hos Riksantikvarieämbetet</a></p>` : ''}`);
}

// Övergivna gårdar, byar och husgrunder. Registret anger inte när de övergavs,
// så de visas oberoende av tidslinjen.
function laggTillOdegardar() {
  karta.addSource('odegardar', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: odegardar.map((o, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [o.x, o.y] }, properties: { i } })),
    },
  });
  const under = ['vag-prick', 'leder-hav'].find((id) => karta.getLayer(id));
  karta.addLayer({ id: 'odegardar', type: 'symbol', source: 'odegardar',
    layout: { 'text-field': '×', 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true,
      'text-size': ['interpolate', ['linear'], ['zoom'], 4, 6, 8, 11, 12, 20] },
    paint: { 'text-color': css('--ode'), 'text-halo-color': css('--yta'), 'text-halo-width': 0.8,
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.55, 8, 1] } }, under);
  karta.on('click', 'odegardar', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
    visaOdegard(odegardar[e.features[0].properties.i]);
  });
  karta.on('mouseenter', 'odegardar', () => { karta.getCanvas().style.cursor = 'pointer'; });
  karta.on('mouseleave', 'odegardar', () => { karta.getCanvas().style.cursor = ''; });
  ritaOdegardar();
}

function ritaOdegardar() {
  if (!karta.getLayer('odegardar')) return;
  karta.setLayoutProperty('odegardar', 'visibility', lage.ode ? 'visible' : 'none');
  satt('antal-odereg', lage.ode ? odegardar.length.toLocaleString('sv-SE') : 0);
}

function visaOdegard(o) {
  visaFlytt(null);
  const typ = o.t === 'h' ? 'Husgrund från förhistorisk tid eller medeltid' : 'Ödetomt, övergiven by- eller gårdstomt';
  visaRuta(`
    <h2>${esc(o.n || (o.t === 'h' ? 'Husgrund' : 'Ödetomt'))}</h2>
    <p class="under">${typ}${o.nr ? ` · ${esc(o.nr)}` : ''} · ${esc([o.so, o.la].filter(Boolean).join(', '))}</p>
    ${o.d ? `<p>${esc(o.d)}${o.d.length >= 320 ? '…' : ''}</p>` : ''}
    ${o.bel ? `<p><b>Äldsta skriftliga belägg:</b> ${o.bel}</p>` : ''}
    <p class="not">Ur fornlämningsregistret. När platsen övergavs framgår inte av registret, så den visas oberoende av tidslinjen.</p>
    ${o.id ? `<p><a href="https://kulturarvsdata.se/raa/lamning/${esc(o.id)}" target="_blank" rel="noopener">Öppna posten hos Riksantikvarieämbetet</a></p>` : ''}`);
}

// ---------- Ortnamn som minner om färdvägar ----------

const FARDNAMN = {
  bro: ['Bro eller spång', 'Namnet pekar på en bro eller spång över vatten eller sankmark.'],
  vad: ['Vadställe', 'Namnet pekar på ett vad, en grund plats där man kunde ta sig över ett vattendrag.'],
  ed: ['Ed, dragställe', 'Ett ed är en landremsa mellan två vatten där båtar släpades eller lasten bars över.'],
  sund: ['Sund', 'Namnet pekar på ett sund, en trång farled mellan två vatten.'],
};
const LAND = { SE: 'Sverige', NO: 'Norge', DK: 'Danmark' };
// Dragstället heter eid på norska och drag på danska
const EDORD = { NO: 'Eid är norskans ord för ed', DK: 'Drag är danskans ord för ett dragställe' };

function laggTillFardnamn() {
  const streck = (rita) => (g) => {
    g.beginPath(); rita(g);
    g.lineWidth = 8; g.strokeStyle = css('--yta'); g.stroke();
    g.lineWidth = 3.5; g.strokeStyle = css('--led-land'); g.stroke();
  };
  ikon('fard-bro', streck((g) => { g.arc(18, 25, 12, Math.PI, 0); g.moveTo(3, 25); g.lineTo(33, 25); }));
  ikon('fard-vad', streck((g) => { for (const x of [7, 18, 29]) { g.moveTo(x, 18); g.lineTo(x + 0.1, 18); } }));
  ikon('fard-ed', streck((g) => { g.moveTo(6, 18); g.lineTo(30, 18); g.moveTo(11, 12); g.lineTo(5, 18); g.lineTo(11, 24); g.moveTo(25, 12); g.lineTo(31, 18); g.lineTo(25, 24); }));
  ikon('fard-sund', streck((g) => { g.moveTo(12, 6); g.lineTo(12, 30); g.moveTo(24, 6); g.lineTo(24, 30); }));
  karta.addSource('fardnamn', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: fardnamn.map(([n, x, y, g], i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { i, g } })),
    },
  });
  const under = ['kult', 'kyrkor'].find((id) => karta.getLayer(id));
  // Utzoomat små prickar, inzoomat en symbol per namntyp
  karta.addLayer({ id: 'fardnamn-prick', type: 'circle', source: 'fardnamn', maxzoom: 7.5,
    paint: { 'circle-color': css('--led-land'), 'circle-stroke-color': css('--yta'), 'circle-stroke-width': 0.5,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 7.5, 2.6] } }, under);
  karta.addLayer({ id: 'fardnamn', type: 'symbol', source: 'fardnamn', minzoom: 7.5,
    layout: { 'icon-image': ['concat', 'fard-', ['get', 'g']], 'icon-allow-overlap': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 7.5, 0.8, 12, 1.3] } }, under);
  karta.on('mousemove', 'fardnamn', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
    const [n, , , g] = fardnamn[e.features[0].properties.i];
    karta.getCanvas().style.cursor = 'pointer';
    tips.setLngLat(e.lngLat).setHTML(`<b>${esc(n)}</b><small>${FARDNAMN[g][0]}</small>`).addTo(karta);
  });
  karta.on('mouseleave', 'fardnamn', () => { karta.getCanvas().style.cursor = ''; tips.remove(); });
  karta.on('click', 'fardnamn', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
    const [n, , , g, land = 'SE'] = fardnamn[e.features[0].properties.i];
    visaFlytt(null);
    visaRuta(`
      <h2>${esc(n)}</h2>
      <p class="under">${FARDNAMN[g][0]} · ${LAND[land]}</p>
      <p>${g === 'ed' && EDORD[land] ? `${EDORD[land]}: en landremsa mellan två vatten där båtar släpades eller lasten bars över.` : FARDNAMN[g][1]}</p>
      <p class="not">Platsen är utpekad enbart utifrån namnets form, hämtat ur OpenStreetMap. Namnet är odaterat och kan vara yngre än vikingatiden.</p>`);
  });
  ritaFardnamn();
}

function ritaFardnamn() {
  for (const id of ['fardnamn', 'fardnamn-prick']) {
    if (karta.getLayer(id)) karta.setLayoutProperty(id, 'visibility', lage.fardnamn ? 'visible' : 'none');
  }
  satt('antal-fardnamn', lage.fardnamn ? fardnamn.length.toLocaleString('sv-SE') : 0);
}

// ---------- Båtlämningar, hamnar och spärrar ----------

const SJOFART = {
  bat: ['Fartygs- eller båtlämning', 'fartyg'],
  hamn: ['Hamn', 'hamn'],
  sparr: ['Sjöspärr', 'spärr'],
};

// De flesta båtlämningar i registret är odaterade och ofta sentida. Från start
// visas därför bara de vars beskrivning nämner förhistorisk tid eller medeltid.
function laggTillSjofart() {
  const streck = (rita) => (g) => {
    g.beginPath(); rita(g);
    g.lineWidth = 8; g.strokeStyle = css('--yta'); g.stroke();
    g.lineWidth = 3.5; g.strokeStyle = css('--sjo'); g.stroke();
  };
  ikon('sjo-bat', streck((g) => { g.moveTo(4, 15); g.quadraticCurveTo(18, 33, 32, 15); g.closePath(); g.moveTo(18, 15); g.lineTo(18, 5); }));
  ikon('sjo-hamn', streck((g) => { g.moveTo(18, 7); g.lineTo(18, 29); g.moveTo(11, 13); g.lineTo(25, 13); g.moveTo(7, 20); g.quadraticCurveTo(18, 36, 29, 20); }));
  ikon('sjo-sparr', streck((g) => { for (const x of [9, 18, 27]) { g.moveTo(x, 8); g.lineTo(x, 29); } g.moveTo(4, 15); g.lineTo(32, 15); }));
  karta.addSource('sjofart', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: sjofart.map((p, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.x, p.y] },
        properties: { i, t: p.t, tidig: !!p.ald } })),
    },
  });
  const under = ['fardnamn-prick', 'kult', 'kyrkor'].find((id) => karta.getLayer(id));
  const odaterad = ['all', ['==', ['get', 't'], 'bat'], ['!', ['get', 'tidig']]];
  karta.addLayer({ id: 'sjofart-ovriga', type: 'circle', source: 'sjofart', filter: odaterad,
    paint: { 'circle-color': css('--sjo'), 'circle-opacity': 0.45,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1, 9, 2.5, 13, 5] } }, under);
  karta.addLayer({ id: 'sjofart', type: 'symbol', source: 'sjofart', filter: ['in', ['get', 't'], ['literal', SJOFART_VISA]],
    layout: { 'icon-image': ['concat', 'sjo-', ['get', 't']], 'icon-allow-overlap': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 0.85, 12, 1.3] } }, under);
  for (const id of ['sjofart', 'sjofart-ovriga']) {
    karta.on('click', id, (e) => {
      if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
      visaSjofart(sjofart[e.features[0].properties.i]);
    });
    karta.on('mouseenter', id, () => { karta.getCanvas().style.cursor = 'pointer'; });
    karta.on('mouseleave', id, () => { karta.getCanvas().style.cursor = ''; });
  }
  satt('n-batar', sjofart.filter((p) => p.t === 'bat' && !p.ald).length.toLocaleString('sv-SE'));
  ritaSjofart();
}

function ritaSjofart() {
  if (!karta.getLayer('sjofart')) return;
  karta.setLayoutProperty('sjofart', 'visibility', lage.sjofart ? 'visible' : 'none');
  karta.setLayoutProperty('sjofart-ovriga', 'visibility', lage.sjofart && lage.batarAlla ? 'visible' : 'none');
  const antal = (villkor) => (lage.sjofart ? sjofart.filter(villkor).length.toLocaleString('sv-SE') : 0);
  satt('antal-hamnar', antal((p) => p.t === 'hamn'));
  satt('antal-batar', antal((p) => p.t === 'bat' && (p.ald || lage.batarAlla)));
}

function visaSjofart(p) {
  visaFlytt(null);
  const not = p.t !== 'bat' ? 'Lämningen är odaterad i registret och visas därför oberoende av tidslinjen.'
    : p.ald ? 'Visas eftersom beskrivningen nämner förhistorisk tid eller medeltid. Det är en ordmatchning, inte en datering, så läs beskrivningen.'
    : 'Lämningen är odaterad. De flesta odaterade fartygslämningar i registret är från nyare tid.';
  visaRuta(`
    <h2>${esc(p.n || SJOFART[p.t][0])}</h2>
    <p class="under">${SJOFART[p.t][0]}${p.nr ? ` · ${esc(p.nr)}` : ''} · ${esc([p.so, p.la].filter(Boolean).join(', '))}</p>
    ${p.d ? `<p>${esc(p.d)}${p.d.length >= 280 ? '…' : ''}</p>` : ''}
    <p class="not">Ur fornlämningsregistret. ${not}</p>
    ${p.id ? `<p><a href="https://kulturarvsdata.se/raa/lamning/${esc(p.id)}" target="_blank" rel="noopener">Öppna posten hos Riksantikvarieämbetet</a></p>` : ''}`);
}

// ---------- Fornborgar och vårdkasar ----------

// Fornborgarna är odaterade i registret. De flesta som undersökts är från
// 300–600-talen, men en del användes in i vikingatiden; lagret tonas därför
// bort först 1050–1150. Vårdkasarna visas oberoende av tidslinjen.
const borgstyrka = (Y) => Math.min(1, Math.max(0, (1150 - Y) / 100));

function laggTillForsvar() {
  const streck = (rita) => (g) => {
    g.beginPath(); rita(g);
    g.lineWidth = 8; g.strokeStyle = css('--yta'); g.stroke();
    g.lineWidth = 3.5; g.strokeStyle = css('--forsvar'); g.stroke();
  };
  ikon('forsvar-borg', streck((g) => { g.arc(18, 19, 11, Math.PI * 0.75, Math.PI * 2.25); }));   // ringmur med öppning
  ikon('forsvar-kase', streck((g) => { g.moveTo(18, 31); g.lineTo(18, 17); g.moveTo(11, 6); g.lineTo(18, 17); g.lineTo(25, 6); g.moveTo(18, 5); g.lineTo(18, 11); }));
  karta.addSource('forsvar', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: forsvar.map((p, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.x, p.y] }, properties: { i, t: p.t } })),
    },
  });
  const under = ['sjofart-ovriga', 'fardnamn-prick', 'kult', 'kyrkor'].find((id) => karta.getLayer(id));
  karta.addLayer({ id: 'forsvar', type: 'symbol', source: 'forsvar',
    layout: { 'icon-image': ['concat', 'forsvar-', ['get', 't']], 'icon-allow-overlap': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 0.8, 12, 1.3] } }, under);
  karta.on('click', 'forsvar', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
    visaForsvar(forsvar[e.features[0].properties.i]);
  });
  karta.on('mouseenter', 'forsvar', () => { karta.getCanvas().style.cursor = 'pointer'; });
  karta.on('mouseleave', 'forsvar', () => { karta.getCanvas().style.cursor = ''; });
  ritaForsvar();
}

function ritaForsvar() {
  if (!karta.getLayer('forsvar')) return;
  const s = borgstyrka(lage.ar);
  karta.setLayoutProperty('forsvar', 'visibility', lage.forsvar ? 'visible' : 'none');
  karta.setFilter('forsvar', ['==', ['get', 't'], s > 0 ? 'borg' : 'ingen']);   // vårdkasarna är borttagna ur panelen
  karta.setPaintProperty('forsvar', 'icon-opacity', ['match', ['get', 't'], 'borg', Math.max(s, 0.01), 1]);
  satt('antal-borgar', lage.forsvar ? Math.round(forsvar.filter((p) => p.t === 'borg').length * s).toLocaleString('sv-SE') : 0);
  satt('antal-kasar', lage.forsvar ? forsvar.filter((p) => p.t === 'kase').length.toLocaleString('sv-SE') : 0);
}

function visaForsvar(p) {
  visaFlytt(null);
  const borg = p.t === 'borg';
  visaRuta(`
    <h2>${esc(p.n || (borg ? 'Fornborg' : 'Vårdkase'))}</h2>
    <p class="under">${borg ? 'Fornborg' : 'Vårdkase'}${p.nr ? ` · ${esc(p.nr)}` : ''} · ${esc([p.so, p.la].filter(Boolean).join(', '))}</p>
    ${p.d ? `<p>${esc(p.d)}${p.d.length >= 280 ? '…' : ''}</p>` : ''}
    <p class="not">Ur fornlämningsregistret. ${borg
      ? 'Fornborgar är sällan daterade var för sig. De flesta som undersökts är från 300–600-talen, så borgen kan ha varit övergiven långt före runstenarnas tid.'
      : 'Vårdkasar är eldar som tändes för att varna längs kusten. Systemet är belagt från medeltiden och användes in på 1700-talet; platsen är odaterad och visas oberoende av tidslinjen.'}</p>
    ${p.id ? `<p><a href="https://kulturarvsdata.se/raa/lamning/${esc(p.id)}" target="_blank" rel="noopener">Öppna posten hos Riksantikvarieämbetet</a></p>` : ''}`);
}

// ---------- Skattfynd ----------

// Depåfynd ur fornlämningsregistret. Perioden är utläst ur beskrivningen och
// styr när fyndet syns; fynd utan känd period visas svagt hela tiden. Har
// beskrivningen ett slutmyntsår visas skatten först från det året.
const SKATTPERIOD = {
  jarn: ['äldre järnålder till vendeltid', 150, 800],
  vik: ['vikingatid', 780, 1100],
  med: ['medeltid', 1050, 1550],
  ok: ['okänd period', -Infinity, Infinity],
};

function laggTillSkatter() {
  // Slutmyntsåret går före ordmatchningen; fynd från sten- och bronsålder eller nyare tid tas inte med.
  skatter = skatter.map((s) => ({ ...s, p: !s.ar ? s.p : s.ar > 1550 ? 'ovr' : s.ar >= 1100 ? 'med' : s.ar >= 780 ? 'vik' : 'jarn' }))
    .filter((s) => s.p !== 'ovr');
  ikon('skatt', (g) => {
    g.beginPath(); g.arc(18, 18, 11, 0, Math.PI * 2);
    g.fillStyle = css('--skatt'); g.fill(); g.lineWidth = 3; g.strokeStyle = css('--text'); g.stroke();
    g.beginPath(); g.arc(18, 18, 5, 0, Math.PI * 2); g.lineWidth = 2; g.stroke();
  });
  karta.addSource('skatter', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: skatter.map((s, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.x, s.y] },
        properties: { i, p: s.p, fran: Math.max(s.ar || -9999, SKATTPERIOD[s.p][1] === -Infinity ? -9999 : SKATTPERIOD[s.p][1]),
          till: SKATTPERIOD[s.p][2] === Infinity ? 9999 : SKATTPERIOD[s.p][2] } })),
    },
  });
  const under = ['forsvar', 'sjofart-ovriga', 'fardnamn-prick', 'kult', 'kyrkor'].find((id) => karta.getLayer(id));
  karta.addLayer({ id: 'skatter', type: 'symbol', source: 'skatter',
    layout: { 'icon-image': 'skatt', 'icon-allow-overlap': true, 'symbol-sort-key': ['match', ['get', 'p'], 'ok', 0, 1],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, ['match', ['get', 'p'], 'ok', 0.3, 0.5], 9, ['match', ['get', 'p'], 'ok', 0.55, 0.85], 13, 1.2] },
    paint: { 'icon-opacity': ['match', ['get', 'p'], 'ok', 0.45, 1] } }, under);
  karta.on('click', 'skatter', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
    visaSkatt(skatter[e.features[0].properties.i]);
  });
  karta.on('mouseenter', 'skatter', () => { karta.getCanvas().style.cursor = 'pointer'; });
  karta.on('mouseleave', 'skatter', () => { karta.getCanvas().style.cursor = ''; });
  ritaSkatter();
}

function ritaSkatter() {
  if (!karta.getLayer('skatter')) return;
  const Y = lage.ar;
  karta.setLayoutProperty('skatter', 'visibility', lage.skatter ? 'visible' : 'none');
  karta.setFilter('skatter', ['all', ['<=', ['get', 'fran'], Y], ['>=', ['get', 'till'], Y]]);
  const syns = (s) => Math.max(s.ar || -Infinity, SKATTPERIOD[s.p][1]) <= Y && SKATTPERIOD[s.p][2] >= Y;
  satt('antal-skatter', lage.skatter ? skatter.filter((s) => s.p !== 'ok' && syns(s)).length.toLocaleString('sv-SE') : 0);
  satt('antal-skatter-ok', lage.skatter ? skatter.filter((s) => s.p === 'ok').length.toLocaleString('sv-SE') : 0);
}

function visaSkatt(s) {
  visaFlytt(null);
  visaRuta(`
    <h2>${esc(s.n || 'Depåfynd')}</h2>
    <p class="under">Skattfynd${s.nr ? ` · ${esc(s.nr)}` : ''} · ${esc([s.so, s.la].filter(Boolean).join(', '))}</p>
    ${s.d ? `<p>${esc(s.d)}${s.d.length >= 420 ? '…' : ''}</p>` : ''}
    <dl>
      <dt>Period</dt><dd>${SKATTPERIOD[s.p][0]}</dd>
      ${s.ar ? `<dt>Slutmynt</dt><dd>${s.ar} (skatten lades ner tidigast då)</dd>` : ''}
      ${s.u ? `<dt>Mynt</dt><dd>${esc(s.u)}</dd>` : ''}
    </dl>
    <p class="not">Ur fornlämningsregistret. Period och myntens ursprung är utlästa ur beskrivningen med ordmatchning och kan vara fel; fynd utan beskrivning hamnar under okänd period.</p>
    ${s.id ? `<p><a href="https://kulturarvsdata.se/raa/lamning/${esc(s.id)}" target="_blank" rel="noopener">Öppna posten hos Riksantikvarieämbetet</a></p>` : ''}`);
}

// ---------- Vikingatida mynt per fyndplats ----------

// Mynt i Historiska museets och Myntkabinettets samlingar, summerade per
// fyndplats. Cirkelns yta följer antalet mynt och färgen det vanligaste
// ursprunget bland de mynt som har en angiven valör.
const MYNTURSPRUNG = [
  ['ara', 'arabiska (dirham)', '#1baf7a'], ['eng', 'engelska (penny)', '#e34948'], ['tys', 'tyska (pfennig)', '#eda100'],
  ['nor', 'nordiska (penning)', '#4a3aa7'], ['bys', 'bysantinska', '#e87ba4'],
];
const MYNT_FRAN = 780, MYNT_TILL = 1100;
// Vanligaste ursprung bland mynt med angiven valör; "ovr" bara om ingen valör alls är angiven
const vanligast = (m) => MYNTURSPRUNG.reduce((bast, [k]) => ((m[k] || 0) > (bast === "ovr" ? 0 : m[bast]) ? k : bast), "ovr");

function laggTillMynt() {
  karta.addSource('mynt', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: mynt.map((m, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [m.x, m.y] },
        properties: { i, r: Math.sqrt(m.n), u: vanligast(m), exakt: m.exakt === 1 } })),
    },
  });
  const farg = ['match', ['get', 'u'], ...MYNTURSPRUNG.flatMap(([k, , f]) => [k, f]), css('--annan')];
  const under = ['skatter', 'forsvar', 'sjofart-ovriga', 'fardnamn-prick', 'kult', 'kyrkor'].find((id) => karta.getLayer(id));
  karta.addLayer({ id: 'mynt', type: 'circle', source: 'mynt',
    layout: { 'circle-sort-key': ['-', 0, ['get', 'r']] },   // små cirklar överst så att de går att klicka på
    paint: { 'circle-color': farg, 'circle-opacity': ['case', ['get', 'exakt'], 0.4, 0.18],
      'circle-stroke-color': farg, 'circle-stroke-width': 1.5, 'circle-stroke-opacity': ['case', ['get', 'exakt'], 1, 0.6],
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        4, ['+', 1.5, ['*', 0.08, ['get', 'r']]],
        8, ['+', 3, ['*', 0.28, ['get', 'r']]],
        12, ['+', 5, ['*', 0.7, ['get', 'r']]]] } }, under);
  karta.on('click', 'mynt', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
    visaMynt(mynt[e.features[0].properties.i]);
  });
  karta.on('mouseenter', 'mynt', () => { karta.getCanvas().style.cursor = 'pointer'; });
  karta.on('mouseleave', 'mynt', () => { karta.getCanvas().style.cursor = ''; });
  $('myntlegend').innerHTML = [...MYNTURSPRUNG, ['ovr', 'utan angiven valör', css('--annan')]].map(([k, namn, f]) => `
    <li><i style="background:${f}"></i><span>${namn}</span><small>${mynt.reduce((s, m) => s + (m[k] || 0), 0).toLocaleString('sv-SE')}</small></li>`).join('');
  ritaMynt();
}

function ritaMynt() {
  if (!karta.getLayer('mynt')) return;
  const syns = lage.mynt && lage.ar >= MYNT_FRAN && lage.ar <= MYNT_TILL;
  karta.setLayoutProperty('mynt', 'visibility', syns ? 'visible' : 'none');
  satt('antal-mynt', syns ? mynt.reduce((s, m) => s + m.n, 0).toLocaleString('sv-SE') : 0);
  $('myntlegend').hidden = !syns;
}

function visaMynt(m) {
  visaFlytt(null);
  const tal = (n) => n.toLocaleString('sv-SE');
  visaRuta(`
    <h2>${esc(m.pl || m.so || 'Myntfynd')}</h2>
    <p class="under">Vikingatida mynt · ${esc([m.so, m.la].filter(Boolean).join(', '))}${m.nr ? ` · ${esc(m.nr)}` : ''}</p>
    <dl>
      <dt>Mynt</dt><dd>${tal(m.n)}${m.fynd > 1 ? ` i ${m.fynd} förvärv` : ''}</dd>
      ${[...MYNTURSPRUNG, ['ovr', 'utan angiven valör']].filter(([k]) => m[k]).map(([k, namn]) => `<dt>${namn}</dt><dd>${tal(m[k])}</dd>`).join('')}
    </dl>
    <p class="not">${m.exakt ? 'Läget är fyndplatsens fornlämning i registret.'
      : 'Läget är ungefärligt: fynden saknar fornlämningsnummer och är samlade i socknens mitt. Flera skilda fynd i socknen kan vara sammanslagna.'}
      Mynten är daterade till vikingatid som period, inte år för år, och visas därför under hela ${MYNT_FRAN}–${MYNT_TILL}.
      Källa: Statens historiska museer (Historiska museet och Kungliga myntkabinettet), CC0.</p>`);
}

// ---------- Dåtida strandlinje ----------

// Landhöjningen efter istiden gör att havet stod högre förr. Lagret kommer från
// SGU:s strandförskjutningsmodell, som har en karta per hundra år räknat bakåt
// från 1950 ("BP"). Tidslinjens år avrundas till närmaste tillgängliga karta.
lage.strand = true;
const STRAND_BP = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1300, 1400, 1500, 1600, 1700, 1800];
const strandBP = (Y) => STRAND_BP.reduce((bast, bp) => (Math.abs(bp - (1950 - Y)) < Math.abs(bast - (1950 - Y)) ? bp : bast));
let strandVisad = null, strandTimer;

function laggTillStrand() {
  // Osynligt ankarlager: strandkartorna läggs alltid strax under det, och därmed under allt annat.
  karta.addLayer({ id: 'strand-tak', type: 'background', paint: { 'background-opacity': 0 } });
  // Dagens vatten ritas en gång till ovanpå strandkartan. Då syns bara det vatten
  // som har blivit land sedan dess i den mörkare färgen.
  const vatten = karta.getStyle().layers.find((l) => l.id === 'water');
  if (vatten) karta.addLayer({ ...vatten, id: 'vatten-idag' });
}

function visaStrand(bp) {
  const id = `strand-${bp}`;
  if (!karta.getSource(id)) {
    karta.addSource(id, { type: 'raster', tileSize: 512, minzoom: 5,
      tiles: ['https://maps3.sgu.se/geoserver/ows?service=WMS&version=1.3.0&request=GetMap'
        + `&layers=strand:SE.GOV.SGU.STRANDFORSKJUTNINGSMODELL.${bp}BP&styles=&crs=EPSG:3857`
        + '&bbox={bbox-epsg-3857}&width=512&height=512&format=image/png&transparent=true'],
      attribution: 'Strandlinje: © Sveriges geologiska undersökning (SGU)' });
    karta.addLayer({ id, type: 'raster', source: id, minzoom: 5,
      paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 500 },
        'raster-brightness-max': mork ? 0.5 : 0.72, 'raster-saturation': 0.55 } }, 'strand-tak');
  }
  for (const annan of STRAND_BP) {
    const lager = `strand-${annan}`;
    if (!karta.getLayer(lager)) continue;
    karta.setLayoutProperty(lager, 'visibility', annan === bp || annan === strandVisad ? 'visible' : 'none');
    karta.setPaintProperty(lager, 'raster-opacity', annan === bp ? 0.95 : 0);
  }
  strandVisad = bp;
}

// Kartan byts först när tidslinjen har stått still en stund, så att uppspelning
// inte skickar en ny omgång förfrågningar till SGU för varje århundrade.
function ritaStrand() {
  if (!karta.getLayer('strand-tak')) return;
  const bp = strandBP(lage.ar);
  satt('strand-ar', 1950 - bp);
  clearTimeout(strandTimer);
  if (karta.getLayer('vatten-idag')) karta.setLayoutProperty('vatten-idag', 'visibility', lage.strand ? 'visible' : 'none');
  if (!lage.strand) {
    for (const annan of STRAND_BP) if (karta.getLayer(`strand-${annan}`)) karta.setLayoutProperty(`strand-${annan}`, 'visibility', 'none');
    strandVisad = null;
    return;
  }
  if (bp !== strandVisad) strandTimer = setTimeout(() => visaStrand(bp), strandVisad === null ? 0 : 700);
}

// ---------- Kultplatser och kyrkor ----------

// Små kartsymboler ritas på en canvas så att de inte är beroende av typsnitt.
function ikon(namn, rita) {
  const c = document.createElement('canvas');
  c.width = c.height = 36;
  const g = c.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  rita(g);
  karta.addImage(namn, g.getImageData(0, 0, 36, 36), { pixelRatio: 2 });
}
function triangel(g) { g.beginPath(); g.moveTo(18, 6); g.lineTo(31, 29); g.lineTo(5, 29); g.closePath(); }
function kors(g) { g.beginPath(); g.moveTo(18, 4); g.lineTo(18, 32); g.moveTo(9, 13); g.lineTo(27, 13); }

const GUDAR = [[/^(Oden|Ons)/, 'Oden'], [/^Tor/, 'Tor'], [/^Frö/, 'Frö eller Fröja'], [/^Ull/, 'Ull'], [/^(När|Njärd)/, 'Njärd'], [/^Gud/, 'gudarna']];
const KULTLED = [[/vi$/i, 'vi, helgedom'], [/harg$/i, 'harg, stenaltare eller offerplats'], [/hov$/i, 'hov, kultbyggnad'],
  [/lunda?$/, 'lund, helig lund'], [/åker$/, 'åker, helig åker'], [/tuna$/, 'tuna, inhägnad centralplats'], [/sala?$/, 'sal, hall'], [/ala?$/, 'al, helgedom']];
// Kulten antas upphöra med kristnandet: namnen tonas bort 1000–1150.
const kultstyrka = (Y) => Math.min(1, Math.max(0, (1150 - Y) / 150));

function laggTillKult() {
  ikon('kult', (g) => { triangel(g); g.fillStyle = css('--kult'); g.fill(); g.lineWidth = 3; g.strokeStyle = css('--yta'); g.stroke(); });
  ikon('offer', (g) => { triangel(g); g.lineWidth = 7; g.strokeStyle = css('--yta'); g.stroke(); g.lineWidth = 3.5; g.strokeStyle = css('--kult'); g.stroke(); });
  karta.addSource('kult', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: kult.map((k, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [k.x, k.y] }, properties: { i, t: k.t } })),
    },
  });
  karta.addLayer({ id: 'kult', type: 'symbol', source: 'kult',
    layout: { 'icon-image': ['match', ['get', 't'], 'namn', 'kult', 'offer'], 'icon-allow-overlap': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.55, 9, 0.9, 13, 1.2] } });
  karta.on('click', 'kult', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
    visaKult(kult[e.features[0].properties.i]);
  });
  karta.on('mouseenter', 'kult', () => { karta.getCanvas().style.cursor = 'pointer'; });
  karta.on('mouseleave', 'kult', () => { karta.getCanvas().style.cursor = ''; });
  ritaKult();
}

function ritaKult() {
  if (!karta.getLayer('kult')) return;
  const s = kultstyrka(lage.ar);
  karta.setLayoutProperty('kult', 'visibility', lage.kult ? 'visible' : 'none');
  karta.setFilter('kult', ['==', ['get', 't'], s > 0 ? 'namn' : 'ingen']);   // offerplatserna är borttagna ur panelen
  karta.setPaintProperty('kult', 'icon-opacity', ['match', ['get', 't'], 'namn', Math.max(s, 0.01), 1]);
  satt('antal-kult', lage.kult ? Math.round(kult.filter((k) => k.t === 'namn').length * s).toLocaleString('sv-SE') : 0);
  satt('antal-offer', lage.kult ? kult.filter((k) => k.t === 'offer').length.toLocaleString('sv-SE') : 0);
}

function visaKult(k) {
  visaFlytt(null);
  if (k.t === 'namn') {
    const gud = GUDAR.find(([re]) => re.test(k.n))?.[1], led = KULTLED.find(([re]) => re.test(k.n))?.[1];
    return visaRuta(`
      <h2>${esc(k.n)}</h2>
      <p class="under">Hedniskt kultnamn</p>
      <p>${gud ? `Förleden syftar troligen på ${esc(gud)}. ` : ''}${led ? `Efterleden är ${esc(led)}.` : 'Namnet betyder i sig helgedom eller kultplats.'}</p>
      <p class="not">Platsen är utpekad enbart utifrån namnets form, hämtat ur OpenStreetMap. Varje namn behöver prövas mot äldre skrivformer innan det räknas som säkert sakralt.</p>`);
  }
  visaRuta(`
    <h2>${esc(k.n || 'Offerplats')}</h2>
    <p class="under">Offerplats${k.nr ? ` · ${esc(k.nr)}` : ''}${k.la ? ` · ${esc(k.la)}` : ''}</p>
    ${k.d ? `<p>${esc(k.d)}${k.d.length >= 320 ? '…' : ''}</p>` : ''}
    <p class="not">Ur fornlämningsregistret. Kategorin rymmer både förhistoriska offerfynd och samiska offerplatser som använts in i historisk tid, och den är odaterad.</p>
    ${k.id ? `<p><a href="https://kulturarvsdata.se/raa/lamning/${esc(k.id)}" target="_blank" rel="noopener">Öppna posten hos Riksantikvarieämbetet</a></p>` : ''}`);
}

function laggTillKyrkor() {
  ikon('kyrka', (g) => { kors(g); g.lineWidth = 8; g.strokeStyle = css('--yta'); g.stroke(); g.lineWidth = 4; g.strokeStyle = css('--text'); g.stroke(); });
  karta.addSource('kyrkor', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: kyrkor.map(([x, y, a, b], i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { i, a, b } })),
    },
  });
  karta.addLayer({ id: 'kyrkor', type: 'symbol', source: 'kyrkor',
    layout: { 'icon-image': 'kyrka', 'icon-allow-overlap': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.45, 9, 0.85, 13, 1.2] } });
  karta.on('click', 'kyrkor', (e) => {
    if (karta.queryRenderedFeatures(e.point, { layers: STENLAGER }).length) return;
    visaKyrka(kyrkor[e.features[0].properties.i]);
  });
  karta.on('mouseenter', 'kyrkor', () => { karta.getCanvas().style.cursor = 'pointer'; });
  karta.on('mouseleave', 'kyrkor', () => { karta.getCanvas().style.cursor = ''; });
  ritaKyrkor();
}

// En kyrka daterad till ett helt århundrade tonas in över det århundradet.
function ritaKyrkor() {
  if (!karta.getLayer('kyrkor')) return;
  const Y = lage.ar;
  karta.setLayoutProperty('kyrkor', 'visibility', lage.kyrkor ? 'visible' : 'none');
  karta.setFilter('kyrkor', ['<=', ['get', 'a'], Y]);
  karta.setPaintProperty('kyrkor', 'icon-opacity',
    ['min', 1, ['max', 0.3, ['/', ['-', Y, ['get', 'a']], ['+', 1, ['-', ['get', 'b'], ['get', 'a']]]]]]);
  satt('antal-kyrkor', lage.kyrkor ? kyrkor.filter((k) => k[2] <= Y).length.toLocaleString('sv-SE') : 0);
}

function visaKyrka([, , a, b, namn, id, art, bild]) {
  visaFlytt(null);
  const nar = a === b ? `omkring ${a}` : b - a < 15 ? `${a}-talet` : `${a}-talet (århundradet)`;
  visaRuta(`
    <h2>${esc(namn)}</h2>
    <p class="under">Kyrka · tillkomst ${nar}</p>
    ${bild ? COMMONS_PLATS : ''}
    <p class="not">Årtalet är Wikidatas uppgift om kyrkans tillkomst. Det avser oftast den äldsta bevarade stenkyrkan; en äldre träkyrka kan ha stått på platsen tidigare. Bara kyrkor med angivet årtal finns med.</p>
    <p><a href="${esc(art || `https://www.wikidata.org/wiki/${id}`)}" target="_blank" rel="noopener">${art ? 'Läs mer på Wikipedia' : 'Öppna posten i Wikidata'}</a></p>`);
  if (bild) visaBild(namn, bild, 'Fotot visar kyrkan i dag, ofta om- och tillbyggd sedan medeltiden.');
}

function laggTillOrter() {
  for (const o of orter) {
    const el = document.createElement('div');
    el.className = `ort ${o.t}`;
    el.innerHTML = `<i></i><span>${esc(o.n)}</span>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); visaOrt(o); });
    o.el = el;
    new maplibregl.Marker({ element: el, anchor: 'left', offset: [-5, 0] }).setLngLat([o.x, o.y]).addTo(karta);
  }
}

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

// ---------- Detaljrutor ----------

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const datering = (r) => (r.a === r.b ? `ca ${r.a}` : `${r.a}–${r.b}`);

function visaRuta(html) {
  const ruta = $('detalj');
  ruta.innerHTML = `<button class="stang" aria-label="Stäng">×</button>${html}`;
  ruta.hidden = false;
  ruta.scrollTop = 0;
  lage.vald = null;
  ruta.querySelector('.stang').addEventListener('click', () => { ruta.hidden = true; visaFlytt(null); skrivAdress(true); });
}

function visaInskrift(r) {
  const rad = (namn, varde, html) => (varde ? `<dt>${namn}</dt><dd>${html ?? esc(varde)}</dd>` : '');
  visaFlytt(r);
  let status = '';
  if (r.fs) {
    const kalla = r.bn
      ? `Avbildad i Bautil (${esc(r.bn)}), vars träsnitt bygger på Hadorphs och Peringskiölds inventeringar från 1600-talets slut.`
      : r.ln ? `Upptagen i Liljegrens Run-urkunder 1833 (${esc(r.ln)}), som bygger på äldre uppteckningar.`
      : 'Databasen anger ingen äldre förteckning.';
    status = `<p class="status borta"><b>Försvunnen.</b> Markerad på sin äldsta kända plats. ${kalla}</p>`;
  } else if (r.cx) {
    const km = avstandKm(r.x, r.y, r.cx, r.cy);
    const langd = km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toLocaleString('sv-SE', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
    status = `<p class="status"><b>Flyttad.</b> Markerad på sin äldsta kända plats, står i dag ${langd} därifrån (streckad linje).${r.pm ? ` ${esc(r.pm)}` : ''}</p>`;
  } else if (r.pm) {
    status = `<p class="status">${esc(r.pm)}</p>`;
  }
  let not = '';
  if (r.e === 1) not = 'Dateringen är härledd från ornamentikens stil (Gräslunds kronologi), inte hämtad ur databasen.';
  else if (r.e === 2) not = `Dateringen följer den danska periodindelningen (${esc(r.d)}). Periodens årtal är ungefärliga.`;
  else if (r.e === 3) not = 'Dateringen bygger på historiska uppgifter om personerna i texten, inte på stil.';
  else if (r.b - r.a > SNAV) not = 'Grovt daterad: bara perioden är känd.';
  visaRuta(`
    <h2>${ordKnapp(r.s, 'signum')}</h2>
    <p class="under">${esc(r.f || 'Inskrift')}</p>
    ${status}
    ${bildHtml(r.s)}
    ${oversattningHtml(r)}
    ${r.n ? `<p class="norm"><span class="sprak">${ordKnapp(r.nl, ORD_FOR_SPRAK[r.nl])}</span> ${esc(r.n)}</p>` : ''}
    ${r.r ? `<p class="runor"><span class="sprak">${ordKnapp('Translitterering', 'translitterering')}</span>${esc(r.r)}</p>` : ''}
    ${personerITexten(r)}
    <dl>
      ${rad('Datering', datering(r) + (r.d ? ` (${r.d})` : ''))}
      ${rad('Period', r.p, r.p && periodHtml(r.p))}
      ${rad('Stil', r.st, r.st && stilHtml(r.st))}
      ${rad(ordKnapp('Ristare', 'ristare'), r.c)}
      ${rad('Plats', r.pl)}
      ${rad('Socken', r.so)}
      ${rad('Landskap', [r.la, r.co].filter(Boolean).join(', '))}
      ${rad('Äldre nr', r.bn || r.ln, [r.bn && ordKnapp(r.bn, 'bautil'), r.ln && ordKnapp(r.ln, 'liljegren')].filter(Boolean).join(', '))}
      ${rad('Nämner', [...(r.rs || []).map((k) => resmal[k]?.n || RIKTNINGAR[k]), r.br ? 'brobygge' : null].filter(Boolean).join(', '))}
    </dl>
    ${not ? `<p class="not">${not}</p>` : ''}
    <p class="lankar"><a href="${esc(r.u)}" target="_blank" rel="noopener">Öppna posten i runtextdatabasen</a>
      <button type="button" class="dela">Kopiera länk</button></p>`);
  kopplaDela();
  lage.vald = r.s;
  skrivAdress(true);
  $('detalj').querySelectorAll('.person').forEach((knapp) => knapp.addEventListener('click', () => {
    const namn = knapp.dataset.namn;
    markera(sokindex.personer.find(([n]) => n === namn)[1], `Namnet ${namn}`);
  }));
  if (typeof bilder[r.s.toUpperCase()] === 'string') visaBild(r.s, bilder[r.s.toUpperCase()], 'Bilden är vald i Wikidata och visar ibland platsen snarare än inskriften.');
}

// Översättningen. Saknar runtextdatabasen svensk översättning visas en svensk AI-översättning
// (fältet ts, se scripts/ai-oversattning.rb) med tydlig märkning och databasens engelska under.
function oversattningHtml(r) {
  if (!r.t || !/[^…\s.§A-H]/.test(r.t)) return '';
  if (!r.ts) return `<blockquote>${esc(r.t)}${r.tl === 'en' ? ' <span class="not">(engelsk översättning)</span>' : ''}</blockquote>`;
  return `<blockquote class="ai">${esc(r.ts)}
      <span class="ai-marke">${ordKnapp('AI-översättning', 'ai')}</span></blockquote>
    <details class="engelsk"><summary>Databasens engelska översättning</summary><p>${esc(r.t)}</p></details>`;
}

// Personer i texten (fälten pn och sl, se scripts/bygg-namn.rb). Släktbanden är tolkade ur
// översättningens formler och förenklade; samma namn på olika stenar kan vara olika personer.
const PLURAL = /^(söner|bröder|makar|mågar)$/;
function personerITexten(r) {
  if (!r.pn) return '';
  const knapp = (n) => `<button type="button" class="person" data-namn="${esc(n)}">${esc(n)}</button>`;
  const lista = (delar) => (delar.length < 2 ? delar.join('') : `${delar.slice(0, -1).join(', ')} och ${delar.at(-1)}`);
  let slakt = '';
  if (r.sl) {
    const [resare, minne] = r.sl;
    const efter = minne.map(([n, rel]) => (n === 'sig själv' ? 'sig själv, medan de levde'
      : `${knapp(n)}${rel ? `, ${PLURAL.test(rel) ? 'sina' : 'sin'} ${esc(rel)}` : ''}`));
    if (resare.length === 1 && minne[0][0] === 'sig själv') efter[0] = 'sig själv i livstiden';
    slakt = `<dl class="slakt"><dt>Reste</dt><dd>${lista(resare.map(knapp))}</dd><dt>Till minne av</dt><dd>${lista(efter)}</dd></dl>`;
  }
  const ovriga = r.pn.filter((n) => !r.sl || ![...r.sl[0], ...r.sl[1].map(([m]) => m)].includes(n));
  return `<section class="personer"><h3>Personer i texten</h3>${slakt}
    ${ovriga.length ? `<p class="namn">${r.sl ? '<span>Nämns också:</span> ' : ''}${ovriga.map(knapp).join(' ')}</p>` : ''}
    <p class="not">Namn och släktband är tolkade automatiskt ur översättningen. Klicka på ett namn för att se andra
      inskrifter med samma namn – det är ofta helt andra personer.</p></section>`;
}

const COMMONS_PLATS = '<figure class="bild"><div class="ram"></div><figcaption class="not">Hämtar bild från Wikimedia Commons …</figcaption></figure>';

// Bild i detaljrutan. En sträng är ett filnamn på Commons (hämtas i visaBild), ett objekt en bild
// ur RAÄ:s arkiv (ATA) där bara en miniatyr på 200 px finns att visa; klick öppnar originalet hos RAÄ.
function bildHtml(signum) {
  const b = bilder[signum.toUpperCase()];
  if (!b) return '';
  if (typeof b === 'string') return COMMONS_PLATS;
  const sida = `https://pub.raa.se/visa/dokumentation/${encodeURIComponent(b.r)}`;
  const upphov = b.b && b.b.length > 70 ? `${b.b.slice(0, 70).replace(/,[^,]*$/, '')} m.fl.` : b.b;
  return `
    <figure class="bild raa">
      <a class="ram" href="${sida}" target="_blank" rel="noopener"><img src="https://pub.raa.se/dokumentation/${encodeURIComponent(b.r)}/visning/1/miniatyr" alt="${b.d ? 'Teckning' : 'Foto'}: ${esc(signum)}" loading="lazy" onerror="this.closest('figure').remove()"></a>
      <figcaption class="not">${esc(b.t.replace(/\.?\s*$/, '.'))}${upphov ? ` ${b.d ? 'Teckning' : 'Upphov'}: ${esc(upphov)}${b.a ? `, ${esc(b.a)}` : ''}.` : ''}${b.l ? ` ${esc(b.l)} ·` : ''} <a href="${sida}" target="_blank" rel="noopener">Riksantikvarieämbetets arkiv</a>, större bild där.</figcaption>
    </figure>`;
}

// Fyller platshållaren COMMONS_PLATS i detaljrutan med en bild från Wikimedia Commons (vald i Wikidata).
// Miniatyr, fotograf och licens hämtas från Commons API först när rutan öppnas; not står sist i bildtexten.
async function visaBild(namn, fil, not) {
  const titel = `File:${decodeURIComponent(fil)}`;
  const fig = $('detalj').querySelector('figure.bild');
  try {
    const svar = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&titles=${encodeURIComponent(titel)}`).then((s) => s.json());
    const info = Object.values(svar.query.pages)[0].imageinfo[0];
    // Rutan kan ha bytts till något annat medan vi väntade.
    if (!fig.isConnected) return;
    const meta = info.extmetadata || {};
    const text = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };
    const fotograf = text(meta.Artist?.value);
    const licens = text(meta.LicenseShortName?.value);
    fig.innerHTML = `
      <a class="ram" href="${esc(info.descriptionurl)}" target="_blank" rel="noopener"><img src="${esc(info.thumburl)}" alt="Foto: ${esc(namn)}" loading="lazy"></a>
      <figcaption class="not">${[fotograf, licens].filter(Boolean).map(esc).join(' · ')}${fotograf || licens ? ' · ' : ''}<a href="${esc(info.descriptionurl)}" target="_blank" rel="noopener">Wikimedia Commons</a>. ${esc(not)}</figcaption>`;
  } catch {
    if (fig.isConnected) fig.remove();
  }
}

function visaLed(l) {
  visaFlytt(null);
  visaRuta(`
    <h2>${esc(l.n)}</h2>
    <p class="under">${l.t === 'farled' ? 'Farled' : 'Landväg'} · ca ${l.a}${l.b ? `–${l.b}` : ' och framåt'}</p>
    <p>${esc(l.d)}</p>
    <p class="not">Sträckningen är schematisk och årtalen ungefärliga.</p>`);
}

function visaOrt(o) {
  visaFlytt(null);
  visaRuta(`
    <h2>${esc(o.n)}</h2>
    <p class="under">${ORTTYPER[o.t]} · ca ${o.a}${o.b ? `–${o.b}` : ' och framåt'}</p>
    <p>${esc(o.d)}</p>
    <p class="not">Årtalen är ungefärliga.</p>`);
}

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
    } catch { /* sidan fungerar utan bilder */ }
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

// ---------- Start ----------

async function start() {
  const [r, o, l, m] = await Promise.all([
    fetch('data/runor.json', { cache: 'no-cache' }).then((s) => s.json()),
    fetch('data/orter.json', { cache: 'no-cache' }).then((s) => s.json()),
    fetch('data/leder.json', { cache: 'no-cache' }).then((s) => s.json()),
    fetch('data/resmal.json', { cache: 'no-cache' }).then((s) => s.json()),
    skapaKarta(),
  ]);
  runor = r; orter = o; leder = l; resmal = m;

  for (const k of ['R', 'G', 'O']) $(`n-${k}`).textContent = runor.filter((x) => x.k === k).length.toLocaleString('sv-SE');
  document.querySelectorAll('[data-typ]').forEach((ruta) => (ruta.checked = lage.typer.has(ruta.dataset.typ)));
  document.querySelectorAll('[data-typ]').forEach((ruta) => ruta.addEventListener('change', () => {
    ruta.checked ? lage.typer.add(ruta.dataset.typ) : lage.typer.delete(ruta.dataset.typ);
    ritaHistogram(); ritaFarglegend(); uppdatera();
  }));
  for (const [id, nyckel] of LAGER) {
    $(id).checked = lage[nyckel];   // webbläsaren kan ha återställt gamla kryss vid omladdning
    $(id).addEventListener('change', (e) => {
      lage[nyckel] = e.target.checked;
      if (lage[nyckel] && LATA_LAGER[nyckel]) laddaLager(nyckel);   // försöker igen efter ett fel
      ritaVagar(); uppdatera();
    });
  }
  kopplaPanel();
  kopplaOrdlista();

  laggTillStrand();
  laggTillLeder();
  laggTillResor();
  laggTillInskrifter();
  laggTillBroringar();
  kopplaSok();
  laggTillOrter();
  ritaSkala();
  ritaHistogram();
  kopplaTidslinje();
  klar = true;
  lage.farg = $('farg').value;   // om valet ändrades medan sidan laddade
  ritaFarglegend();
  uppdatera();
  const harAdress = kopplaAdress();

  // Lagren i LATA_LAGER laddas först när de slås på, se laddaLager() (anropas från uppdatera()).
  fetch('data/turer.json', { cache: 'no-cache' }).then((s) => s.json()).then((d) => { turer = d; laggTillTurer(); }).catch(() => {});
  fetch('data/tidsbild.json', { cache: 'no-cache' }).then((s) => s.json()).then((d) => { tidsbilder = d; laggTillTidsbild(); }).catch(() => {});
  if (!harAdress) visaValkommen();   // en delad länk ska visa det som delades
  fetch('data/bilder.json', { cache: 'no-cache' }).then((s) => s.json()).then((d) => { for (const [k, f] of Object.entries(d)) bilder[k.toUpperCase()] = f; }).catch(() => {});
}

start().catch((fel) => {
  console.error(fel);
  document.body.insertAdjacentHTML('beforeend',
    `<div class="ruta" style="top:40%;left:50%;transform:translateX(-50%);padding:16px">Kunde inte ladda data: ${esc(fel.message)}</div>`);
});
