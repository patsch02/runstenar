#!/bin/sh
# Bygger data/bilder.json: signum → en bild av inskriften.
#
#   sh scripts/bygg-bilder.sh
#
# Källor, i den ordningen:
#   1. Wikidata: inskrifter med Samnordisk runtextdatabas-signum (P1261) och bild (P18) på Wikimedia Commons.
#      Värdet är filnamnet (sträng); fotograf och licens hämtas från Commons när en inskrift öppnas.
#      Bilden är vald av Wikidatas skribenter och visar ibland kyrkan stenen sitter i snarare än stenen.
#   2. Riksantikvarieämbetets arkivbilder (ATA) via K-samsök, för inskrifter som saknar bild i Wikidata.
#      Posterna länkar till runtextdatabasens id (fältet u i runor.json). Värdet är ett objekt:
#      {r: dokument-id på pub.raa.se, t: bildtext, b: fotograf/tecknare, a: år, l: licens, d: 1 om teckning}.
set -e

ROT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROT/.cache/bilder"
mkdir -p "$CACHE" "$ROT/data"
UA='User-Agent: runsten-karta/0.1'
giltig() { [ -s "$1" ] && jq -e "$2" "$1" > /dev/null 2>&1; }

# 1. Wikidata
giltig "$CACHE/wikidata.json" '.results.bindings | length > 0' || curl -s -m 120 --retry 3 -G 'https://query.wikidata.org/sparql' \
  -H 'Accept: application/sparql-results+json' -H "$UA" -o "$CACHE/wikidata.json" --data-urlencode 'query=
    SELECT ?id ?bild WHERE { ?s wdt:P1261 ?id ; wdt:P18 ?bild }'

# 2. RAÄ:s arkivbilder märkta "Runsignum …", 500 per sida
start=1
while :; do
  sida="$CACHE/raa-$start.json"
  giltig "$sida" '.result.records' || { curl -s -m 180 --retry 3 -G 'https://kulturarvsdata.se/ksamsok/api' \
    -H 'Accept: application/json' -H "$UA" -o "$sida" --data-urlencode 'method=search' --data-urlencode 'version=1.1' \
    --data-urlencode 'hitsPerPage=500' --data-urlencode "startRecord=$start" \
    --data-urlencode 'query=text=Runsignum AND serviceName="arkiv-bilder"'; sleep 2; }
  giltig "$sida" '.result.records' || { echo "Kunde inte hämta $sida från K-samsök; kör igen senare." >&2; exit 1; }
  start=$((start + 500))
  [ "$start" -gt "$(jq '.result.totalHits' "$sida")" ] && break
done

# Commons-filnamnet sparas URL-kodat som i Wikidata. Har en inskrift flera bilder väljs en vars filnamn
# innehåller signumets nummer, annars en som inte ser ut att visa en kyrka.
jq -c '
  [.results.bindings[] | {s: (.id.value | gsub("\\s+"; " ")), f: (.bild.value | sub(".*/Special:FilePath/"; ""))}]
  | group_by(.s)
  | map(
      (.[0].s | capture("(?<n>[0-9]+)[A-Za-z]?$").n? // "") as $nr
      | (map(.f) | sort_by(
          (gsub("%20|_"; " ") | if $nr != "" and test("(^|[^0-9])\($nr)([^0-9]|$)") then 0 else 1 end),
          (if test("kyrka|church|kirke"; "i") then 1 else 0 end)
        ) | .[0]) as $f
      | {key: .[0].s, value: $f})
  | from_entries' "$CACHE/wikidata.json" > "$CACHE/wikidata-val.json"

# RAÄ-bilderna kopplas till signum via runtextdatabasens id. Har en inskrift flera bilder väljs helst
# ett foto (inte teckning eller karta) som bara visar den inskriften.
jq -s -c --slurpfile runor "$ROT/data/runor.json" --slurpfile wd "$CACHE/wikidata-val.json" '
  ($runor[0] | map({key: (.u | sub(".*/"; "")), value: .s}) | from_entries) as $sig
  | ($wd[0] | keys | map({key: ascii_upcase, value: 1}) | from_entries) as $harbild
  | {pdmark: "Public domain", cc0: "CC0", by: "CC BY", "by-sa": "CC BY-SA"} as $lic
  | [ .[].result.records[].record["@graph"] as $g
      | ($g[] | select(.["@type"] == "ksam:Entity")) as $e
      | ($g[] | select(.["@type"] == "ksam:Image")) as $bild
      | ($e["ksam:itemType"]["@id"] | sub(".*#"; "")) as $typ
      | select($typ == "photo" or $typ == "drawing")
      | ([$g | .. | strings | select(test("kulturarvsdata.se/uu/srdb/")) | sub(".*/"; "")] | unique | map($sig[.] // empty)) as $s
      | {
          r: ($bild["ksam:thumbnailSource"]["@value"] | capture("dokumentation/(?<id>[^/]+)/").id),
          t: $e["ksam:itemLabel"]["@value"],
          b: ($bild["ksam:byline"]["@value"] // null),
          a: ([$g[] | select(.["ksam:contextLabel"]["@value"]? == "Tillkomst") | .["ksam:fromTime"]["@value"] // empty | .[0:4]] | first // null),
          l: ($lic[($bild["ksam:mediaLicense"]["@id"] // $e["ksam:itemLicense"]["@id"] // "") | sub(".*#"; "")] // null),
          d: (if $typ == "drawing" then 1 else null end),
          s: $s
        }
      | select(.r and (.s | length > 0))
      | . as $p | $p.s[] | {s: ., p: ($p | del(.s) | with_entries(select(.value != null))), n: ($p.s | length)}
    ]
  | map(select($harbild[.s | ascii_upcase] | not))
  | group_by(.s)
  | map({key: .[0].s, value: (sort_by((.p.d // 0), .n) | .[0].p)})
  | from_entries' "$CACHE"/raa-*.json > "$CACHE/raa-val.json"

jq -s -c '.[0] + .[1]' "$CACHE/wikidata-val.json" "$CACHE/raa-val.json" > "$ROT/data/bilder.json"
echo "data/bilder.json: $(jq 'length' "$CACHE/wikidata-val.json") från Wikidata, $(jq 'length' "$CACHE/raa-val.json") från RAÄ:s arkiv"
