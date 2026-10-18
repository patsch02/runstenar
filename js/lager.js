// Lagren i panelen: resor, vägar, bebyggelse, gravfält, färdnamn, sjöfart, försvar, skatter, mynt, strandlinje, kult och kyrkor.
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

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
