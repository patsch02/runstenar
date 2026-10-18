# Runstenar i tid och rum

Interaktiv karta över nordiska runinskrifter med en tidslinje (år 150–1550) och lager
som visar bebyggelse, färdvägar, tro, försvar och handel under vikingatid och medeltid.
Användaren skriver på svenska; svara på svenska och förklara vad du gör.

## Köra

Statisk sajt utan byggsteg (ingen node, ingen python på datorn; ruby 2.6, jq och curl finns).

    ruby -run -e httpd . -p 8765      # öppna http://localhost:8765

Förhandsvisningen startas med `.claude/launch.json` (namn "runstenar"). Datafilerna hämtas med
`fetch(..., { cache: 'no-cache' })`; bumpa `?v=N` på `style.css` och `app.js` i `index.html`
när de ändras, annars kan webbläsaren visa gamla versioner.

## Filer

- `index.html` – panel (berättelser överst; en vald tur tar över panelen via klassen `turlage`. Sök, lagergrupperna Runinskrifter, "Var bodde man?", "Hur färdades man?" och "Makt och tro"; varje rad har kryssruta, symbol, antal och en i-knapp med lagrets förbehåll, och lager som inte följer tidslinjen märks "alltid"), detaljruta, tidslinje. Från start visas bara inskrifter, strandlinje, orter och leder (förvalen står i `lage` i app.js).
- Borttagna ur panelen för tydlighetens skull (kod och data finns kvar, se kommentaren vid `lage` i app.js): Öde-namn, husgrunder och ödetomter, färdnamn, sjöspärrar och båtar, vårdkasar, skattfynd, offerplatser.
- `style.css` – färger som CSS-variabler, ljust och mörkt läge (`--nu`, `--sedan`, `--accent` …). Formgivningen
  "museum i kvällsljus" (pergament/natt, rödockra som accent, Fraunces för rubriker och Inter för text från Google Fonts)
  ligger i avsnittet Formgivning sist i filen och går före de enklare reglerna ovanför.
- Panelen har också utfällbara rutor med museitips ("Museer och platser att besöka", handskrivna i index.html) och ordlista.
- Välkomstrutan (`visaValkommen()` i app.js) visas en gång per besök. Bilder från Commons hämtas med
  `hamtaCommons()` och fylls i med `fyllCommons()` (upphov och licens visas alltid).
- `app.js` – all logik, uppdelad i avsnitt med rubriker `// ---------- … ----------`.
  Mönster per lager: `laggTillX()` (källa + kartlager; tunga lager hämtas först när de slås på, via `LATA_LAGER`/`laddaLager()`, och flyttas in under runstenarna),
  `ritaX()` (filter och synlighet för valt år, anropas från `uppdatera()`), `visaX()` (detaljruta).
  Tillstånd i `lage` (år, kryssrutor, färgläge). Kryssrutor kopplas i listan i `start()`.
  Kartbibliotek: MapLibre GL 5.6.0 från unpkg. Bakgrund: OpenFreeMap, rensad på vägar och namn.
  Kartsymboler ritas på canvas med `ikon()`.
  Adressens hash (avsnittet Adress) speglar år, kartvy, lager som avviker från förvalen (`l=+gravar,-leder`),
  färgläge, öppen inskrift (`s=`) eller pågående tur (`tur=…&steg=…`); nya lager ska läggas i listan `LAGER`.
  Utzoomat (under `KLUSTER_ZOOM`) slås stenarna ihop i källan `runor-kluster`, som byggs om i `ritaKluster()`;
  klickhanterare som ska ge stenen företräde frågar `STENLAGER`.
  Facktermer förklaras via `ORDLISTA` (avsnittet Ordlista): `ordKnapp(text, nyckel)` ger en klickbar term, och
  hela listan visas under "Ordlista" i panelen.
- `data/*.json` – byggda datafiler, se nedan.
- `scripts/bygg-*.sh|rb` – hämtar och bygger datafilerna; rådata cachas i `.cache/` (rör inte i onödan).
- `scripts/analys-strand.js` – mäter avstånd till dåtida strand, körs i webbläsaren (se README).
- `README.md` – källor, fältbeskrivning för `runor.json`, analysresultat.

## Data och källor

| Fil | Källa | Skript |
|---|---|---|
| runor.json (6 590 inskrifter) | RAÄ Runor-API (Samnordisk runtextdatabas) | bygg-data.sh + datering.jq (kan köras ensam på runor.json) + bygg-namn.rb (normaliserad text, personnamn och släktband ur cachen) + ai-oversattning.rb (fält `ts`: svensk AI-översättning ur `scripts/ai-oversattningar.json`, engelsk → svensk) |
| vagar.json, gravfalt.json, odegardar.json, sjofart.json, forsvar.json, skatter.json, kult.json (offerplatser) | RAÄ fornlämningsregister via K-samsök | bygg-vagar/bebyggelse/sjofart/forsvar/skatter/tro |
| ortnamn.json, fardnamn.json, kult.json (sakrala namn) | OpenStreetMap via Overpass (ofta överbelastad: frågorna är uppdelade och har omförsök) | bygg-ortnamn/fardnamn/tro |
| kyrkor.json (med bild på Commons) | Wikidata | bygg-tro.sh |
| bilder.json (signum → bild, ca 2 750 inskrifter) | Wikidata/Commons (sträng, fotograf och licens live från Commons API), annars RAÄ:s arkivbilder via K-samsök (objekt) | bygg-bilder.sh |
| mynt.json | CSV-export från samlingar.shm.se (CC0), fornlämningsnr → koordinater via K-samsök | bygg-mynt.rb |
| orter.json, leder.json, resmal.json | handskrivna, ungefärliga | – |
| tidsbild.json (hela tidslinjen: romersk järnålder och folkvandringstid 150–550, vendeltid 550–800, vikingatid 800–1050, tidig medeltid 1050–1250, hög- och senmedeltid 1250–1550; sorterad efter `a`, `b` är exklusivt) | handskrivna kort med foton på Commons (fynd, platser, tidens egna bilder; rekonstruktioner märkta), `personer` = foto av människor med siffror; schematiska figurer (`TB_FIGURER`) bara som reserv | – |
| turer.json (berättelser: Salme, Rök, Jelling, England, Ingvar, Jarlabanke, Hillersjö, kvinnor som reste stenar, kristnandet, väringar i Grekland) | handskrivna; `bild` per tur, steg med `ar`, `s` (signum att markera), `vy`, `oppna`, `platser`, `linjer`, `bild`, `lager` | – |
| strandlinje | SGU:s strandförskjutningsmodell, WMS live (en karta per 100 år BP) | – |

## Förbehåll som ska stå kvar på sajten

Många lager har tidsgränser eller klassningar som är våra antaganden, inte data: stildatering
Rak/Fp/Pr 1–5 enligt Gräslund (fält `e` = 1, ej för danska stenar), årtal för de danska perioderna
Helnæs-Gørlev–efter-Jelling (`e` = 2) och historisk datering av Jellingstenarna (`e` = 3), alla satta i
`scripts/datering.jq`, gravfältens ålder efter gravtyp, kultnamn och fornborgar som
tonas bort 1050–1150, ortnamnsperioder, ordmatchning i beskrivningar (resmål, "tidiga" båtar,
skatternas period), personnamn och släktband som tolkats automatiskt ur översättningarna, svenska AI-översättningar (märkta, med databasens engelska under). Var tydlig med sådant i texter och svar, och dra inte slutsatser av det som
är inbyggt i animationen.

## Arbetssätt

- Projektet ligger i git (gren `main`); `.cache/` är undantagen. Committa bara när användaren ber om det.

- Hämta inte stora mängder från externa tjänster utan att fråga; nedladdning av filer kräver ja.
- Pröva i webbläsarpanelen efter ändringar (sidan laddar långsamt när panelen är dold).
- macOS skyddar skrivbordet: projektet flyttades därför från `~/Desktop` till `~/Projekt/runstenar`.
