// Detaljrutorna: inskrift med översättning, personer och bild, leder och orter.
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

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
      <a class="ram" href="${sida}" target="_blank" rel="noopener"><img src="https://pub.raa.se/dokumentation/${encodeURIComponent(b.r)}/visning/1/miniatyr" alt="${b.d ? 'Teckning' : 'Foto'}: ${esc(signum)}" loading="lazy" onerror="this.closest('figure').outerHTML = '<p class=&quot;not bildfel&quot;>Bilden kunde inte hämtas från Riksantikvarieämbetets arkiv just nu.</p>'"></a>
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
    if (fig.isConnected) fig.outerHTML = '<p class="not bildfel">Bilden kunde inte hämtas från Wikimedia Commons just nu.</p>';
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
