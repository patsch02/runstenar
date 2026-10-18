// Start: hämtar data och kopplar ihop allt. Laddas sist.
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

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
  document.documentElement.dataset.start = 'klar';   // läses av scripts/kontroll.rb
  if (!harAdress) visaValkommen();   // en delad länk ska visa det som delades
  fetch('data/bilder.json', { cache: 'no-cache' }).then((s) => s.json()).then((d) => { for (const [k, f] of Object.entries(d)) bilder[k.toUpperCase()] = f; }).catch(() => {});
}

start().catch((fel) => {
  console.error(fel);
  noteraFel(fel.stack || fel);
  document.body.insertAdjacentHTML('beforeend',
    `<div class="ruta" style="top:40%;left:50%;transform:translateX(-50%);padding:16px">Kunde inte ladda data: ${esc(fel.message)}</div>`);
});
