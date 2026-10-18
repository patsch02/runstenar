# Runstenar i tid och rum

En karta över runinskrifter med en tidslinje som visar när de kom till,
tillsammans med samtida orter.

## Köra lokalt

Sidan läser `data/*.json` med `fetch` och måste därför servas över http:

    ruby -run -e httpd . -p 8765

Öppna sedan http://localhost:8765.

## Filer

- `index.html`, `style.css`, `js/*.js` – själva sajten (ingen byggkedja); MapLibre ligger i `vendor/`.
- `scripts/kontroll.rb` – kontroller före publicering (se CLAUDE.md).
- `data/runor.json` – 6 590 inskrifter, byggd av `scripts/bygg-data.sh`.
- `data/orter.json` – handplockade orter med ungefärliga årtal. Redigeras för hand.
- `data/leder.json` – farleder och landvägar som schematiska linjer med ungefärliga årtal. Redigeras för hand.
- `data/resmal.json` – koordinater för resmål som nämns i runstenstexterna. Redigeras för hand.
- `data/tidsbild.json` – knappen Tidsbild vid tidslinjen: per period (`a`–`b`) en ingress, flikar (`grupper`),
  kort (`g` flik, `typ` fynd/rekonstruktion/teckning, `bild` filnamn på Wikimedia Commons, `fynd` och `plats`,
  `ungefar` om platsen är ungefärlig, `dom` för Myt eller sanning) och `drakt` med delarna till de schematiska
  figurerna (antingen `kort` = id för ett kort, eller `id`, `n`, `text`). Var siffrorna sitter på figurerna står i
  `TB_FIGURER` i js/tidsbild.js. Bildernas upphov och licens hämtas live från Commons API. Fyndplatserna för Historiska
  museets föremål är kontrollerade via K-samsök (förvärvsnummer 34000 och 5208 = Birka); museets periodfält där är
  inte pålitligt och används inte; registret ger heller sällan fyndplats för föremål utanför Birka. Perioder (tillsammans hela tidslinjen; `b` är exklusivt, och den sista perioden har `b` 1551 så att år 1550
  kommer med): romersk järnålder och folkvandringstid (150–550, huvudbilden är tunikan och byxorna från Thorsbergs
  mosse), vendeltid (550–800, där inga dräkter är bevarade: huvudbilden är en av Torslundaplåtarna, alltså tidens egen
  bild av människor), vikingatid (800–1050), tidig medeltid (1050–1250) och hög- och senmedeltid (1250–1550, med Bockstensmannen som
  huvudbild, Visby 1361, koggen och digerdöden). Kort kan ha `typ` fynd, rekonstruktion, teckning eller malning
  (senare målningar, som Hellqvists Visbymålning från 1882, märks så). Tidig medeltid bygger mest på daterade verk och platser
  (Baldisholtäcket, Lewis-pjäserna, Skogbonaden, Dalby kyrka, Hemse stavkyrka, Västgötalagen) eftersom Historiska
  museets fotograferade lösfynd på Commons nästan alla är vikingatida. `personer` kan ha valfri bildform; siffrornas
  `x` och `y` är procent av bildens bredd och höjd.
- `data/turer.json` – berättelseläget: guidade turer i steg. Varje tur har `id`, `n`, `kort` och `bild` (filnamn på
  Wikimedia Commons, visas i listan och överst i turen). Varje steg har `rubrik`, `text` och `ar` (tidslinjens år),
  och valfritt `s` (signum som markeras), `oppna` (inskrift som öppnas), `vy` (`c` mitt, `z` zoom), `platser`
  (namngivna punkter utan inskrift, t.ex. fyndplatsen i Salme; `liten` för en mindre markör, `vanster` för etikett
  till vänster), `linjer` (listor av koordinater som ritas streckade, t.ex. en tänkbar färdväg), `bild` och
  `bildtext` (ersätter turens bild i steget) och `lager` (id:n som i `visa-…`; slås av igen när turen lämnar dem).
  Texterna redovisar tolkningar och osäkra dateringar som sådana. Salmes fyndplats är 58,1675 N 22,2506 E enligt
  Wikipedia. Redigeras för hand.
- `data/vagar.json` – färdvägar, broar och vad ur fornlämningsregistret, byggd av `scripts/bygg-vagar.sh`.
- `data/ortnamn.json` – svenska byar med daterbara namnändelser, byggd av `scripts/bygg-ortnamn.sh`.
- `data/gravfalt.json`, `data/odegardar.json` – gravfält samt övergivna gårdstomter och husgrunder ur
  fornlämningsregistret, byggda av `scripts/bygg-bebyggelse.sh` (ca 15 minuter första gången).
- `data/kult.json`, `data/kyrkor.json` – sakrala ortnamn (OpenStreetMap), offerplatser (fornlämningsregistret)
  och kyrkor med tillkomstår före 1350 (Wikidata, CC0), byggda av `scripts/bygg-tro.sh`. Kyrkorna har också
  en bild på Wikimedia Commons (P18, 809 av 829) som visas i detaljrutan; fotot visar kyrkan i dag.
- `data/bilder.json` – en bild per inskrift för cirka 2 750 av 6 590, byggd av `scripts/bygg-bilder.sh`:
  - Wikimedia Commons-bild (P18) från Wikidata (cirka 2 100), lagrad som filnamn. Miniatyr, fotograf och licens
    hämtas från Commons API när en inskrift öppnas. Bilden är vald i Wikidata och visar ibland kyrkan eller
    platsen snarare än stenen.
  - Annars ett foto eller en teckning ur Riksantikvarieämbetets arkiv (ATA) via K-samsök (cirka 650), kopplad via
    runtextdatabasens id. Mest public domain, ofta 1700–1900-tal. Bara en miniatyr på 200 px visas; klick öppnar
    originalet på pub.raa.se.
- `data/fardnamn.json` – ortnamn på -bro, -vad, -sund och Ed- (Sverige) samt bro/bru, vad, eid/drag och sund (Norge, Danmark) ur OpenStreetMap, byggd av `scripts/bygg-fardnamn.sh`.
- `data/sjofart.json` – fartygs- och båtlämningar, hamnområden och spärranordningar ur fornlämningsregistret,
  byggd av `scripts/bygg-sjofart.sh`.
- `data/forsvar.json` – fornborgar och vårdkasar ur fornlämningsregistret, byggd av `scripts/bygg-forsvar.sh`.
- `data/skatter.json` – depåfynd ur fornlämningsregistret, klassade efter period, byggd av `scripts/bygg-skatter.sh`.
- `data/mynt.json` – vikingatida mynt i Statens historiska museers samlingar, summerade per fyndplats,
  byggd av `scripts/bygg-mynt.rb` (kräver Ruby; exporten från samlingar.shm.se är ca 22 MB och CC0).
- `scripts/bygg-data.sh` – hämtar från RAÄ:s Runor-API och bygger om `runor.json`
  (kräver `curl` och `jq`; första körningen tar cirka fem minuter).

## Data

Inskrifterna kommer från Samnordisk runtextdatabas via
Riksantikvarieämbetets tjänst Runor (https://app.raa.se/open/runor/).
Kontrollera licensvillkoren där innan sajten publiceras.

Den dåtida strandlinjen hämtas direkt i webbläsaren från SGU:s strandförskjutningsmodell
(WMS på maps3.sgu.se, en karta per hundra år). Inget av den lagras i projektet, så lagret
kräver nätuppkoppling och SGU:s villkor för tjänsten gäller.

Vägar, broar och vad kommer från Riksantikvarieämbetets fornlämningsregister via
K-samsök (https://kulturarvsdata.se). Ortnamnen kommer från OpenStreetMap (ODbL,
kräver attribution). Fälten `rs` (resmål) och `br` (nämner bro) i `runor.json` är
framsökta ur de engelska översättningarna av inskrifterna.

`scripts/bygg-namn.rb` (körs sist i bygg-data.sh, eller ensamt på den cachade rådatan) lägger till
`n` normaliserad text och `nl` dess språk (runsvenska i första hand, annars rundanska, fornvästnordiska …),
`pn` personnamn och `sl` släktband `[[resare], [[minnesperson, relation], …]]`. Namnen är ord med stor
bokstav i den engelska översättningen som också finns i en normalisering; släktbanden tolkas ur formler som
”X raised this stone in memory of Y, his father”. Båda är automatiska förenklingar, och samma namn på
olika stenar kan vara olika personer. Databasen har svensk översättning för bara drygt 1 400 inskrifter;
övriga har engelsk. För dem finns `ts`, en svensk översättning gjord av en AI-modell (Claude) från databasens
engelska, inte från runtexten och inte granskad av runolog. Den står i `scripts/ai-oversattningar.json`
(engelsk text → svensk) och läggs in av `scripts/ai-oversattning.rb`; på sajten är den märkt och den engelska
visas under.

Fält i `runor.json`: `s` signum, `x`/`y` longitud/latitud (äldsta kända plats),
`a`/`b` tidigaste/senaste år, `k` typ (R runsten, G gravmonument, O övrigt),
`f` föremål, `p` period, `d` dateringstext, `st` stil, `c` ristare, `pl` plats,
`so` socken, `la` landskap, `co` land, `t` översättning (`tl` språk),
`r` translitterering, `u` länk, `e` = 1 om åren är härledda ur stilgruppen (Gräslund),
2 om de följer den danska periodindelningen i `d` (Helnæs-Gørlev 750–900, för-Jelling 900–950, Jelling
950–1000, efter-Jelling 1000–1050; ungefärligt), 3 om de bygger på historiska uppgifter (Jellingstenarna DR 41
940–958 och DR 42 960–986). Dessa sätts av `scripts/datering.jq`, som också kan köras ensam:
`jq -c -f scripts/datering.jq data/runor.json`.
`fs` = 1 om inskriften är försvunnen, `bn`/`ln` nummer i Bautil (1750) respektive
Liljegren (1833), `cx`/`cy` nuvarande plats om stenen flyttats, `pm` placeringstext.

## Analyser

`scripts/analys-strand.js` mäter avståndet från runstenar (eller valfria punkter) till närmaste
vatten i SGU:s strandförskjutningsmodell för två tidpunkter och jämför med punkter flyttade 2 km
åt slumpvis håll. Körs i webbläsaren på sajten:

    const a = await import('/scripts/analys-strand.js');
    const r = await a.analysera({ landskap: 'Uppland' });
    a.sammanfatta(r);

Resultat oktober 2026 (avstånd till vatten omkring år 1050, median):
Uppland 228 m för 1 100 runstenar mot 424 m för slumpade punkter och 416 m för 1 100 gravfält;
Södermanland 213 m mot 295 m.
