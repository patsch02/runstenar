// Mäter avståndet från runstenar till närmaste vatten enligt SGU:s
// strandförskjutningsmodell, för två tidpunkter, och jämför med slumpvis
// flyttade punkter. Körs i webbläsaren på sajten (SGU:s kartor är bilder):
//
//   const a = await import('/scripts/analys-strand.js');
//   const r = await a.analysera({ landskap: 'Uppland' });
//
// Metod: landskapet delas i rutor om ca 10 km. För varje ruta hämtas SGU-kartan
// med 5 km marginal i ca 20 m upplösning, och för varje punkt söks närmaste
// vattenpixel inom 3 km. Vatten = pixel som inte är genomskinlig.

const UPPLOSNING = 20;      // meter på marken per pixel (ungefär)
const RUTA = 10000;         // rutans sida i meter på marken
const MARGINAL = 5000;      // marginal runt rutan, räcker för 3 km sökning + 2 km förskjutning
const MAXAVSTAND = 3000;    // längre än så räknas som "över 3 km"

const R = 6378137;
const tillMerc = (lon, lat) => [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];

async function hamtaVatten(bp, minX, minY, maxX, maxY, bredd, hojd) {
  const url = 'https://maps3.sgu.se/geoserver/ows?service=WMS&version=1.3.0&request=GetMap'
    + `&layers=strand:SE.GOV.SGU.STRANDFORSKJUTNINGSMODELL.${bp}BP&styles=&crs=EPSG:3857`
    + `&bbox=${minX},${minY},${maxX},${maxY}&width=${bredd}&height=${hojd}&format=image/png&transparent=true`;
  for (let forsok = 0; forsok < 3; forsok++) {
    try {
      const svar = await fetch(url);
      if (!svar.ok) throw new Error(svar.status);
      const bild = await createImageBitmap(await svar.blob());
      const duk = new OffscreenCanvas(bredd, hojd), g = duk.getContext('2d', { willReadFrequently: true });
      g.drawImage(bild, 0, 0);
      const p = g.getImageData(0, 0, bredd, hojd).data;
      const vatten = new Uint8Array(bredd * hojd);
      for (let i = 0; i < vatten.length; i++) vatten[i] = p[i * 4 + 3] > 40 ? 1 : 0;
      return vatten;
    } catch (fel) {
      await new Promise((r) => setTimeout(r, 2000 * (forsok + 1)));
    }
  }
  throw new Error(`kunde inte hämta SGU-karta ${bp}BP`);
}

// Avstånd i pixlar till närmaste vattenpixel, sökt i växande kvadrater (Infinity om inget hittas)
function narmasteVatten(vatten, bredd, hojd, px, py, maxPx) {
  let bast = Infinity;
  for (let r = 0; r <= maxPx; r++) {
    if (r > bast) break;
    for (let dy = -r; dy <= r; dy++) {
      for (const dx of (Math.abs(dy) === r ? Array.from({ length: 2 * r + 1 }, (_, i) => i - r) : [-r, r])) {
        const x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= bredd || y >= hojd || !vatten[y * bredd + x]) continue;
        bast = Math.min(bast, Math.hypot(dx, dy));
      }
    }
  }
  return bast;
}

// lista: valfria punkter {x, y, s} i stället för landskapets runstenar, t.ex. gravfält som kontroll
export async function analysera({ landskap = 'Uppland', perioder = [900, 100], filtrera = (r) => r.k === 'R' && !r.fs, lista = null, framsteg = () => {} } = {}) {
  const stenar = lista || runor.filter((r) => r.la === landskap && filtrera(r));
  // Slumpvis förskjutning 2 km, samma för alla perioder
  let fro = 1;
  const slump = () => ((fro = (fro * 16807) % 2147483647) / 2147483647);
  const punkter = stenar.map((r) => {
    const v = slump() * 2 * Math.PI, dlat = 2000 * Math.sin(v) / 110570, dlon = 2000 * Math.cos(v) / (111320 * Math.cos(r.y * Math.PI / 180));
    return { r, sten: tillMerc(r.x, r.y), slump: tillMerc(r.x + dlon, r.y + dlat) };
  });
  // Rutor i mercatormeter; rutans sida skalas med 1/cos(lat) så att den blir ca 10 km på marken
  const skala = 1 / Math.cos((stenar.reduce((s, r) => s + r.y, 0) / stenar.length) * Math.PI / 180);
  const sida = RUTA * skala, marg = MARGINAL * skala, pix = UPPLOSNING * skala;
  const rutor = new Map();
  for (const p of punkter) {
    const nyckel = `${Math.floor(p.sten[0] / sida)}|${Math.floor(p.sten[1] / sida)}`;
    if (!rutor.has(nyckel)) rutor.set(nyckel, []);
    rutor.get(nyckel).push(p);
  }
  const resultat = Object.fromEntries(perioder.map((bp) => [bp, { sten: [], slump: [] }]));
  let klara = 0;
  for (const [nyckel, lista] of rutor) {
    const [ix, iy] = nyckel.split('|').map(Number);
    const minX = ix * sida - marg, minY = iy * sida - marg, maxX = (ix + 1) * sida + marg, maxY = (iy + 1) * sida + marg;
    const bredd = Math.round((maxX - minX) / pix), hojd = Math.round((maxY - minY) / pix);
    for (const bp of perioder) {
      const vatten = await hamtaVatten(bp, minX, minY, maxX, maxY, bredd, hojd);
      for (const p of lista) {
        for (const typ of ['sten', 'slump']) {
          const [x, y] = p[typ];
          const px = Math.floor((x - minX) / pix), py = Math.floor((maxY - y) / pix);
          const d = narmasteVatten(vatten, bredd, hojd, px, py, Math.ceil(MAXAVSTAND / UPPLOSNING)) * UPPLOSNING;
          resultat[bp][typ].push({ s: p.r.s, d });
        }
      }
    }
    framsteg(++klara, rutor.size);
  }
  return { landskap, antal: stenar.length, rutor: rutor.size, resultat };
}

// Sammanfattning: median och andel inom olika avstånd
export function sammanfatta(res) {
  const ut = {};
  for (const [bp, { sten, slump }] of Object.entries(res.resultat)) {
    const stat = (lista) => {
      const d = lista.map((x) => x.d).sort((a, b) => a - b);
      const andel = (m) => Math.round((100 * d.filter((x) => x <= m).length) / d.length);
      return { median: d[Math.floor(d.length / 2)], inom100: andel(100), inom250: andel(250), inom500: andel(500), inom1000: andel(1000), over3km: Math.round((100 * d.filter((x) => x === Infinity).length) / d.length) };
    };
    ut[`${1950 - bp} (${bp}BP)`] = { stenar: stat(sten), slumpade: stat(slump) };
  }
  return ut;
}
