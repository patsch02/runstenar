#!/bin/sh
# Bygger data/gravfalt.json och data/odegardar.json ur Riksantikvarieämbetets
# fornlämningsregister, hämtat via K-samsök (kulturarvsdata.se).
#
#   sh scripts/bygg-bebyggelse.sh
#
# Hämtningen är stor (drygt 50 000 poster). Varje sida om 500 poster kokas
# direkt ner till en rad per lämning i .cache/bebyggelse/, så en avbruten
# körning kan återupptas och rådatat behöver inte sparas.
set -e

API="https://kulturarvsdata.se/ksamsok/api"
ROT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROT/.cache/bebyggelse"
mkdir -p "$CACHE" "$ROT/data"

UTDRAG='
  .result.records[].record["@graph"] as $g
  | ($g[] | select(.["@type"] == "ksam:Entity")) as $e
  | ($e["ksam:presentation"]["@value"] // "") as $pres
  | ($pres | capture("<gml:Point[^>]*><gml:coordinates[^>]*>(?<v>[^<]+)<").v? // "" | split(",") | map(tonumber? | . * 10000 | round / 10000)) as $p
  | ([$g[] | select(.["@type"] == "ksam:ItemDescription" and (.["ksam:type"]["@value"]? == "Beskrivning")) | .["ksam:desc"]["@value"]][0]
      | if . == null or test("inte kvalitetssäkrad") then "" else gsub("\\s+"; " ") end) as $d
  | select($p | length == 2)
  | {
      t: $typ, x: $p[0], y: $p[1],
      n: ($e["ksam:itemKeyword"] | if type == "array" then .[0] else . end | .["@value"]? // null),
      nr: ($pres | capture("<pres:idLabel>(?<v>[^<]*)</pres:idLabel>").v? // null),
      id: ($pres | capture("<pres:id>(?<v>[^<]*)</pres:id>").v? // null),
      so: ([$g[] | select(.["@type"] == "ksam:Context") | .["ksam:parishName"]["@value"]?][0]),
      la: ([$g[] | select(.["@type"] == "ksam:Context") | .["ksam:provinceName"]["@value"]?][0]),
      ab: ([$g[] | select(.["@type"] == "ksam:ItemSpecification" and (.["ksam:type"]["@value"]? == "Antikvarisk bedömning")) | .["ksam:spec"]["@value"]][0]),
      il: ([$g[] | select(.["@type"] == "ksam:ItemDescription" and (.["ksam:type"]["@value"]? == "Ingående lämningar")) | .["ksam:desc"]["@value"]] | join(" ") | .[0:400]),
      d: $d[0:320]
    }
'

hamta() {  # hamta <kod> <lämningstyp>
  start=1
  while :; do
    f="$CACHE/$1-$start.jsonl"
    if [ ! -e "$f.klar" ]; then
      curl -s -m 180 --retry 4 --retry-delay 5 -G "$API" -H 'Accept: application/json' -H 'User-Agent: runsten-karta/0.1' \
        --data-urlencode 'method=search' --data-urlencode 'version=1.1' \
        --data-urlencode 'hitsPerPage=500' --data-urlencode "startRecord=$start" \
        --data-urlencode "query=itemClassName=\"$2\" AND serviceOrganization=raä AND geoDataExists=j" -o "$CACHE/sida.json"
      jq '.result.records | length' "$CACHE/sida.json" > "$f.klar.tmp"
      jq -c --arg typ "$1" "$UTDRAG" "$CACHE/sida.json" > "$f"
      mv "$f.klar.tmp" "$f.klar"
      rm -f "$CACHE/sida.json"
      sleep 1
    fi
    [ "$(cat "$f.klar")" -lt 500 ] && break
    start=$((start + 500))
  done
}

hamta gravfalt  'Gravfält'
hamta gravbo    'Grav- och boplatsområde'
hamta husgrund  'Husgrund, förhistorisk/medeltida'
hamta tomt      'Bytomt/gårdstomt'

# Gravfält: [lon, lat, antal gravar (0 = okänt), ålder, namn, lämningsnummer, id]
# Antalet summeras ur fältet "Ingående lämningar". Åldern är en tumregel:
#   "y" = innehåller högar, skeppssättningar eller treuddar (yngre järnålder),
#   "a" = resta stenar, domarringar eller stenkretsar men inga högar (äldre järnålder),
#   "o" = går inte att avgöra.
cat "$CACHE"/gravfalt-*.jsonl "$CACHE"/gravbo-*.jsonl | jq -c '
  ((.il // "") + " " + .d) as $allt
  | ([(.il // "") | scan("antal ([0-9]+)") | .[0] | tonumber] | add // 0) as $n
  | [.x, .y,
     (if $n > 0 then $n else ((.d | capture("bestående av (ca |omkring |minst )?(?<n>[0-9]+)").n? // "0") | tonumber) end),
     (if   ($allt | test("Hög -|\\bhögar\\b|[0-9] hög\\b|[Ss]keppssättning|[Tt]reudd")) then "y"
      elif ($allt | test("[Rr]est sten|resta stenar|[Dd]omarring|[Ss]tenkrets|[Jj]ärnåldersdös")) then "a"
      else "o" end),
     (.n // ""), .nr, .id]
' | jq -s -c 'unique_by(.[5])' > "$ROT/data/gravfalt.json"

# Övergiven bebyggelse: husgrunder från förhistorisk tid/medeltid, samt by- och
# gårdstomter vars beskrivning uttryckligen säger öde/övergiven och inte bebyggd.
# "bel" är äldsta skriftliga belägg om beskrivningen anger ett årtal.
cat "$CACHE"/husgrund-*.jsonl "$CACHE"/tomt-*.jsonl | jq -c '
  (.d | test("[Öö]degård|[Öö]deby|[Öö]detomt|[Öö]dehemman|[Öö]detorp|[Öö]delag|[Öö]de sedan|låg öde|ligger öde|öde redan|[Öö]vergiv|[Öö]dekyrk")) as $ode
  | (.d | test("^(Tomten är )?[Bb]ebyggd|\\. [Bb]ebyggd\\b|[Tt]omten är bebyggd|fortfarande bebyggd|[Nn]u bebyggd")) as $bebyggd
  | select(.t == "husgrund" or ($ode and ($bebyggd | not)))
  | {
      t: (if .t == "husgrund" then "h" else "t" end), x, y, n, nr, id, so, la, d,
      bel: ((.d | capture("belägg[^0-9]{0,60}(?<y>1[0-7][0-9][0-9])").y? // null) | if . then tonumber else null end)
    }
  | with_entries(select(.value != null and .value != ""))
' | jq -s -c 'unique_by(.nr)' > "$ROT/data/odegardar.json"

jq -r '"Skrev \(length) gravfält till data/gravfalt.json: " + (group_by(.[3]) | map("\(.[0][3])=\(length)") | join(", "))' "$ROT/data/gravfalt.json"
jq -r '"Skrev \(length) övergivna bosättningar till data/odegardar.json: " + (group_by(.t) | map("\(.[0].t)=\(length)") | join(", "))' "$ROT/data/odegardar.json"
