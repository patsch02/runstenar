#!/bin/sh
# Bygger data/sjofart.json: fartygs- och båtlämningar, hamnområden och
# spärranordningar ur Riksantikvarieämbetets fornlämningsregister (via K-samsök).
#
#   sh scripts/bygg-sjofart.sh
set -e

API="https://kulturarvsdata.se/ksamsok/api"
ROT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROT/.cache/sjofart"
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
      # "tidig" om beskrivningen nämner förhistorisk tid, vikingatid eller medeltid
      ald: (if ($d | test("[Ff]örhistorisk|[Jj]ärnålder|[Vv]ikingatid|[Mm]edeltid|[Ss]tockbåt|1[0-4][0-9][0-9]-tal|[0-9]00-tal(et)? e")) then "tidig" else null end),
      d: $d[0:280]
    }
  | with_entries(select(.value != null and .value != ""))
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

hamta hamn  'Hamnområde'
hamta sparr 'Spärranordning'
hamta bat   'Fartygs-/båtlämning'

cat "$CACHE"/*.jsonl | jq -s -c 'unique_by(.nr)' > "$ROT/data/sjofart.json"
jq -r '"Skrev \(length) poster till data/sjofart.json: " + (group_by(.t) | map("\(.[0].t)=\(length) (tidiga \(map(select(.ald)) | length))") | join(", "))' "$ROT/data/sjofart.json"
