#!/bin/sh
# Bygger data/vagar.json: färdvägar (hålvägar, vägbankar m.m.), broar och
# vadställen ur Riksantikvarieämbetets fornlämningsregister, hämtade via
# K-samsök (kulturarvsdata.se).
#
#   sh scripts/bygg-vagar.sh
#
# Posterna hämtas 500 åt gången och cachas i .cache/ksamsok/.
set -e

API="https://kulturarvsdata.se/ksamsok/api"
ROT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROT/.cache/ksamsok"
mkdir -p "$CACHE" "$ROT/data"

hamta() {  # hamta <typ>
  start=1
  while :; do
    f="$CACHE/$1-$start.json"
    if [ ! -s "$f" ]; then
      curl -s -m 120 --retry 3 -G "$API" -H 'Accept: application/json' -H 'User-Agent: runsten-karta/0.1' \
        --data-urlencode 'method=search' --data-urlencode 'version=1.1' \
        --data-urlencode 'hitsPerPage=500' --data-urlencode "startRecord=$start" \
        --data-urlencode "query=itemClassName=\"$1\" AND serviceOrganization=raä AND geoDataExists=j" -o "$f"
      sleep 1
    fi
    n=$(jq '.result.records | length' "$f")
    [ "$n" -lt 500 ] && break
    start=$((start + 500))
  done
}

for typ in Färdväg Bro Vad; do hamta "$typ"; done

# Plocka ut geometri och beskrivning. Linjer glesas till högst ca 30 punkter
# per delsträcka och koordinater avrundas till fem decimaler (ungefär en meter).
for typ in Färdväg Bro Vad; do cat "$CACHE/$typ"-*.json | jq -c --arg typ "$typ" '
  def glesa: if length <= 30 then . else . as $p | (length / 30 | ceil) as $s
             | [range(0; length; $s) | $p[.]] + [$p[-1]] end;
  def punkter: [scan("[-0-9.]+,[-0-9.]+") | split(",") | map(tonumber | . * 100000 | round / 100000)];
  .result.records[].record["@graph"] as $g
  | ($g[] | select(.["@type"] == "ksam:Entity")) as $e
  | ([$g[] | select(.["@type"] == "ksam:Context") | .["ksam:coordinates"]["@value"]? | select(. != null)][0] // "") as $gml
  | ($e["ksam:presentation"]["@value"] // "") as $pres
  | ($pres | capture("<gml:Point[^>]*><gml:coordinates[^>]*>(?<v>[^<]+)<").v? // "" | punkter[0]) as $mitt
  | {
      t: ({"Färdväg": "väg", "Bro": "bro", "Vad": "vad"}[$typ]),
      n: ($e["ksam:itemKeyword"] | if type == "array" then .[0] else . end | .["@value"]? // null),
      nr: ($pres | capture("<pres:idLabel>(?<v>[^<]*)</pres:idLabel>").v? // null),
      d: ([$g[] | select(.["@type"] == "ksam:ItemDescription" and (.["ksam:type"]["@value"]? == "Beskrivning")) | .["ksam:desc"]["@value"]][0]
          | if . == null or test("inte kvalitetssäkrad") then null else (gsub("\\s+"; " ") | .[0:400]) end),
      so: ([$g[] | select(.["@type"] == "ksam:Context") | .["ksam:parishName"]["@value"]?][0]),
      la: ([$g[] | select(.["@type"] == "ksam:Context") | .["ksam:provinceName"]["@value"]?][0]),
      u: ($pres | capture("<pres:entityUri>(?<v>[^<]*)</pres:entityUri>").v? // null),
      m: $mitt,
      l: (if ($gml | test("LineString")) then
            [$gml | scan("<gml:LineString>.*?</gml:LineString>") | punkter | glesa | select(length > 1)]
          else null end)
    }
  | select(.m != null)
  | with_entries(select(.value != null and .value != "" and .value != []))
'; done | jq -s -c '.' > "$ROT/data/vagar.json"

jq -r '"Skrev \(length) poster till data/vagar.json: " + (group_by(.t) | map("\(.[0].t)=\(length)") | join(", "))' "$ROT/data/vagar.json"
