// Grund: konstanter, tillståndet `lage` och meddelanden när en extern tjänst inte svarar.
// Delar globalt omfång med de andra filerna i js/ (vanliga skript, laddas i ordning i index.html).

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

// ---------- Meddelanden ----------

// Fel som inte fångas någon annanstans skrivs i <html data-fel="…">, så att scripts/kontroll.rb
// kan se dem när sidan startas i Chrome utan fönster.
const noteraFel = (text) => { document.documentElement.dataset.fel = String(text).slice(0, 300); };
window.addEventListener('error', (e) => noteraFel(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
window.addEventListener('unhandledrejection', (e) => noteraFel(e.reason?.stack || e.reason));

// En kort rad längst ner när en extern tjänst inte svarar. Varje tjänst visas en gång
// (nyckel), och raden går att stänga.
const meddelade = new Set();
function meddela(nyckel, text) {
  if (meddelade.has(nyckel)) return;
  meddelade.add(nyckel);
  let lista = $('meddelanden');
  if (!lista) {
    lista = document.createElement('ul');
    lista.id = 'meddelanden';
    lista.setAttribute('role', 'status');
    lista.addEventListener('click', (e) => e.target.closest('button')?.closest('li').remove());
    document.body.appendChild(lista);
  }
  const rad = document.createElement('li');
  rad.innerHTML = `<span>${esc(text)}</span><button type="button" aria-label="Stäng meddelandet">×</button>`;
  lista.appendChild(rad);
}
