#!/bin/sh
# Bygger data/kult.json (förkristna kultplatser) och data/kyrkor.json (tidiga kyrkor).
#
#   sh scripts/bygg-tro.sh
#
# Källor:
#   - sakrala ortnamn i Sverige ur OpenStreetMap (gudanamn + -vi, -harg, -hov, -lund, -åker ...)
#   - offerplatser ur Riksantikvarieämbetets fornlämningsregister via K-samsök
#   - kyrkor med byggnadsår före 1350 i Sverige, Danmark och Norge ur Wikidata
set -e

ROT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROT/.cache/tro"
mkdir -p "$CACHE" "$ROT/data"
UA='User-Agent: runsten-karta/0.1'
giltig() { [ -s "$1" ] && jq -e "$2" "$1" > /dev/null 2>&1; }

# 1. Sakrala ortnamn
NAMN='^((Odens?|Ons|Tors?|Frös?|Fröj[ae]?|Ull[ae]?n?s?|När|Njärd[ae]?|Närd|Gud[ae]?|Sked[ae])(vi|harg|hov|lunda?|åker|tuna|sala?|ala?|hem)|Vi|Hov|Harg)$'
for server in https://overpass-api.de/api/interpreter https://overpass.private.coffee/api/interpreter https://overpass-api.de/api/interpreter; do
  giltig "$CACHE/namn.json" '.elements | length > 0' && break
  curl -s -m 175 -H "$UA" "$server" -o "$CACHE/namn.json" \
    --data-urlencode "data=[out:json][timeout:160];area(3600052822)->.a;node(area.a)[place][name~\"$NAMN\"];out qt;" || true
  giltig "$CACHE/namn.json" '.elements | length > 0' || sleep 15
done
giltig "$CACHE/namn.json" '.elements | length > 0' || { echo "Kunde inte hämta sakrala ortnamn (servern upptagen); kör igen senare." >&2; echo '{"elements":[]}' > "$CACHE/namn-tom.json"; }

# 2. Offerplatser ur fornlämningsregistret
giltig "$CACHE/offer.json" '.result.records' || curl -s -m 120 --retry 3 -G 'https://kulturarvsdata.se/ksamsok/api' \
  -H 'Accept: application/json' -H "$UA" --data-urlencode 'method=search' --data-urlencode 'version=1.1' \
  --data-urlencode 'hitsPerPage=500' --data-urlencode 'query=itemClassName="Offerplats" AND serviceOrganization=raä AND geoDataExists=j' \
  -o "$CACHE/offer.json"

# 3. Kyrkor ur Wikidata, ett land i taget för att hålla frågorna små
for land in Q34 Q35 Q20; do
  giltig "$CACHE/kyrkor-$land.json" '.results.bindings' || curl -s -m 120 --retry 3 -G 'https://query.wikidata.org/sparql' \
    -H 'Accept: application/json' -H "$UA" -o "$CACHE/kyrkor-$land.json" --data-urlencode "query=
      SELECT ?k ?kLabel ?c ?d ?p ?art WHERE {
        ?k wdt:P17 wd:$land ; wdt:P31/wdt:P279* wd:Q16970 ; wdt:P625 ?c ;
           p:P571/psv:P571 [ wikibase:timeValue ?d ; wikibase:timePrecision ?p ] .
        FILTER(YEAR(?d) < 1350 && YEAR(?d) > 700)
        OPTIONAL { ?art schema:about ?k ; schema:isPartOf <https://sv.wikipedia.org/> }
        SERVICE wikibase:label { bd:serviceParam wikibase:language \"sv,da,nb,nn,en\" }
      }"
  sleep 2
done

# kult.json: {t: "namn" | "offer", x, y, n, ...}
{
  NF="$CACHE/namn.json"; giltig "$NF" '.elements' || NF="$CACHE/namn-tom.json"
  # Former på -lund (Odenslund, Torslund) är oftast 1800-talsnamn och tas inte med; -lunda behålls.
  jq -c '.elements[] | select(.tags.name | test("lund$") | not) | {t: "namn", x: (.lon * 10000 | round / 10000), y: (.lat * 10000 | round / 10000), n: .tags.name}' "$NF"
  jq -c '
    .result.records[].record["@graph"] as $g
    | ($g[] | select(.["@type"] == "ksam:Entity")) as $e
    | ($e["ksam:presentation"]["@value"] // "") as $pres
    | ($pres | capture("<gml:Point[^>]*><gml:coordinates[^>]*>(?<v>[^<]+)<").v? // "" | split(",") | map(tonumber? | . * 10000 | round / 10000)) as $p
    | select($p | length == 2)
    | {
        t: "offer", x: $p[0], y: $p[1],
        n: ($e["ksam:itemKeyword"] | if type == "array" then .[0] else . end | .["@value"]? // null),
        nr: ($pres | capture("<pres:idLabel>(?<v>[^<]*)</pres:idLabel>").v? // null),
        id: ($pres | capture("<pres:id>(?<v>[^<]*)</pres:id>").v? // null),
        la: ([$g[] | select(.["@type"] == "ksam:Context") | .["ksam:provinceName"]["@value"]?][0]),
        d: ([$g[] | select(.["@type"] == "ksam:ItemDescription" and (.["ksam:type"]["@value"]? == "Beskrivning")) | .["ksam:desc"]["@value"]][0]
            | if . == null or test("inte kvalitetssäkrad") then null else (gsub("\\s+"; " ") | .[0:320]) end)
      }
    | with_entries(select(.value != null and .value != ""))' "$CACHE/offer.json"
} | jq -s -c 'unique_by([.t, .n, .x, .y])' > "$ROT/data/kult.json"

# 4. Bild (P18) på Wikimedia Commons för kyrkorna ovan, en fråga för alla
IDS=$(cat "$CACHE"/kyrkor-Q*.json | jq -r '.results.bindings[].k.value | sub(".*/"; "wd:")' | sort -u | tr '\n' ' ')
giltig "$CACHE/kyrkbilder.json" '.results.bindings' || curl -s -m 120 --retry 3 -X POST 'https://query.wikidata.org/sparql' \
  -H 'Accept: application/sparql-results+json' -H "$UA" -o "$CACHE/kyrkbilder.json" \
  --data-urlencode "query=SELECT ?k (SAMPLE(?b) AS ?bild) WHERE { VALUES ?k { $IDS } ?k wdt:P18 ?b } GROUP BY ?k"
jq -c '.results.bindings | map({key: (.k.value | sub(".*/"; "")), value: (.bild.value | sub(".*/Special:FilePath/"; ""))}) | from_entries' \
  "$CACHE/kyrkbilder.json" > "$CACHE/kyrkbilder-val.json"

# kyrkor.json: [lon, lat, från år, till år, namn, Wikidata-id, svensk Wikipedia-artikel, bildfil på Commons (URL-kodad) eller ""]
# Wikidatas precision avgör spannet: 9 = år, 8 = årtionde, 7 = århundrade.
cat "$CACHE"/kyrkor-Q*.json | jq -c '
  .results.bindings[]
  | (.d.value | capture("^[+]?(?<y>[0-9]{4})").y | tonumber) as $y
  | (.p.value | tonumber) as $p
  | select($p >= 7)
  | (if $p >= 9 then [$y, $y]
     elif $p == 8 then [($y - $y % 10), ($y - $y % 10 + 9)]
     else ((($y + 99) / 100 | floor) as $c | [($c - 1) * 100, $c * 100 - 1]) end) as $ar
  | (.c.value | capture("Point\\((?<x>[-0-9.]+) (?<y>[-0-9.]+)\\)")) as $pt
  | {id: (.k.value | sub(".*/"; "")), x: ($pt.x | tonumber | . * 10000 | round / 10000), y: ($pt.y | tonumber | . * 10000 | round / 10000),
     a: $ar[0], b: $ar[1], n: .kLabel.value, art: (.art.value // "")}
' | jq -s -c --slurpfile bild "$CACHE/kyrkbilder-val.json" \
  'group_by(.id) | map(min_by(.a)) | map([.x, .y, .a, .b, .n, .id, .art, ($bild[0][.id] // "")]) | sort_by(.[2])' > "$ROT/data/kyrkor.json"

jq -r '"Skrev \(length) kultplatser till data/kult.json: " + (group_by(.t) | map("\(.[0].t)=\(length)") | join(", "))' "$ROT/data/kult.json"
jq -r '"Skrev \(length) kyrkor till data/kyrkor.json, äldsta: \(.[0][4]) (\(.[0][2]))"' "$ROT/data/kyrkor.json"
