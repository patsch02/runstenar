#!/bin/sh
# Bygger data/skatter.json: depåfynd (skattfynd) ur Riksantikvarieämbetets
# fornlämningsregister (via K-samsök).
#
#   sh scripts/bygg-skatter.sh
set -e

API="https://kulturarvsdata.se/ksamsok/api"
ROT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROT/.cache/skatter"
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
      d: $d[0:600]
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

hamta depa 'Depåfynd'

cat "$CACHE"/*.jsonl | jq -s -c 'unique_by(.nr)' > "$CACHE/alla.json"
jq length "$CACHE/alla.json"

# Klassning utifrån beskrivningen:
#   p (period): "vik" vikingatid, "jarn" äldre järnålder–vendeltid, "med" medeltid,
#               "ovr" stenålder, bronsålder eller nyare tid (utanför tidslinjen), "ok" okänd
#   ar: slutmyntets år (terminus post quem) när det anges
#   u:  myntens ursprung enligt texten
jq -c '
  map(
    (.d // "") as $d
    | (if   ($d | test("[Vv]ikingatid|[Aa]rabisk|[Kk]ufisk|[Kk]alifat|[Bb]itsilver")) then "vik"
       elif ($d | test("[Mm]edeltid"))                                                  then "med"
       elif ($d | test("[Ff]olkvandring|[Vv]endeltid|[Rr]omersk|[Jj]ärnålder|[Dd]enar|[Ss]olid")) then "jarn"
       elif ($d | test("[Ss]tenålder|[Nn]eolit|[Bb]ronsålder|1[5-9][0-9][0-9]-tal|nyare tid")) then "ovr"
       else "ok" end) as $p
    | ($d | capture("(terminus post quem|t\\.? ?p\\.? ?q\\.?|[Ss]lutmynt)[^0-9]{0,40}(?<y>[0-9]{3,4})").y? // null) as $ar
    | {x, y, n, nr, id, so, la, p: $p,
       ar: (if $ar then ($ar | tonumber) else null end),
       u: ([ (if ($d | test("[Aa]rabisk|[Kk]ufisk|[Kk]alifat")) then "arabiska" else empty end),
             (if ($d | test("[Ee]ngelsk|[Aa]nglosax|England")) then "engelska" else empty end),
             (if ($d | test("[Tt]ysk")) then "tyska" else empty end),
             (if ($d | test("[Bb]ysantin|[Bb]ysans")) then "bysantinska" else empty end),
             (if ($d | test("[Rr]omersk|[Dd]enar")) then "romerska" else empty end) ] | join(", ")),
       d: $d[0:420]}
    | with_entries(select(.value != null and .value != ""))
  )' "$CACHE/alla.json" > "$ROT/data/skatter.json"

jq -r '"Skrev \(length) depåfynd till data/skatter.json: " + (group_by(.p) | map("\(.[0].p)=\(length)") | join(", ")) + "; med slutmyntsår: \(map(select(.ar)) | length)"' "$ROT/data/skatter.json"
