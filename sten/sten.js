// Inskriftens egen sida (sten/*.html, byggda av scripts/bygg-sidor.rb): läsning ord för ord
// och bild från Wikimedia Commons. Texten på sidan är färdig utan JavaScript.

(async () => {
  const las = document.querySelector('.lasning');
  if (!las) return;
  const text = (klass) => document.querySelector(`${klass} .txt`)?.textContent || '';
  const bok = await hamtaOrdbok('../data/ordbok.json');
  const html = lasningHtml(text('.runor'), text('.norm'), las.dataset.period, bok);
  if (html) las.querySelector('.las-yta').innerHTML = html; else las.remove();
})();

// Miniatyr, fotograf och licens hämtas från Commons API, som i detaljrutan på kartan.
(async () => {
  const fig = document.querySelector('figure[data-commons]');
  if (!fig) return;
  const ren = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };
  try {
    const titel = `File:${decodeURIComponent(fig.dataset.commons)}`;
    const svar = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=${encodeURIComponent(titel)}`).then((s) => s.json());
    const info = Object.values(svar.query.pages)[0].imageinfo[0];
    const meta = info.extmetadata || {};
    const upphov = [ren(meta.Artist?.value), ren(meta.LicenseShortName?.value)].filter(Boolean);
    const bild = Object.assign(document.createElement('img'), { src: info.thumburl, alt: `Foto: ${fig.dataset.namn}` });
    const lank = Object.assign(document.createElement('a'), { className: 'ram', href: info.descriptionurl, rel: 'noopener' });
    lank.appendChild(bild);
    fig.querySelector('.ram').replaceWith(lank);
    const text = fig.querySelector('figcaption');
    text.textContent = `${upphov.join(' · ')}${upphov.length ? ' · ' : ''}`;
    text.appendChild(Object.assign(document.createElement('a'), { href: info.descriptionurl, rel: 'noopener', textContent: 'Wikimedia Commons' }));
    text.append('. Bilden är vald i Wikidata och visar ibland platsen snarare än inskriften.');
  } catch {
    fig.outerHTML = '<p class="not bildfel">Bilden kunde inte hämtas från Wikimedia Commons just nu.</p>';
  }
})();
