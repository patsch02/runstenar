#!/bin/sh
# Bygger data/ortnamn.json: svenska byar och gårdar vars namnändelse går att
# knyta till en bebyggelseperiod. Källa: OpenStreetMap via Overpass.
#
#   sh scripts/bygg-ortnamn.sh
#
# Grupper (g): 1 = -inge/-hem/-lösa, 2 = -sta/-tuna, 3 = -by, 4 = -torp/-arp/-rup,
# 5 = -ryd/-röd/-boda/-måla/-säter/-böle, 6 = Öde- (övergiven gård).
set -e

ROT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROT/.cache/osm"
mkdir -p "$CACHE" "$ROT/data"
BY='[place~"^(village|hamlet)$"]'

hamta() {  # hamta <fil> <ändelser>
  [ -s "$CACHE/$1.json" ] && jq -e '.elements | length > 0' "$CACHE/$1.json" > /dev/null 2>&1 && return 0
  for server in https://overpass-api.de/api/interpreter https://overpass.private.coffee/api/interpreter; do
    curl -s -m 175 -H 'User-Agent: runsten-karta/0.1' "$server" -o "$CACHE/$1.json" \
      --data-urlencode "data=[out:json][timeout:160];area(3600052822)->.a;node(area.a)$2;out qt;"
    jq -e '.elements | length > 0' "$CACHE/$1.json" > /dev/null 2>&1 && return 0
    sleep 20
  done
  echo "Kunde inte hämta $1 (servern är upptagen). Kör skriptet igen senare; det som redan hämtats sparas." >&2
  rm -f "$CACHE/$1.json"
}

hamta a "$BY"'[name~"(inge|unge|hem|lösa|sta|stad|tuna)$"]'
hamta b "$BY"'[name~"(by|torp|arp|rup)$"]'
hamta c "$BY"'[name~"(ryd|röd|red|rud|boda|måla|säter|sätra|böle|bol)$"]'
hamta d '[place~"^(village|hamlet|isolated_dwelling|farm|locality)$"][name~"^Öde"]'

for f in "$CACHE"/*.json; do jq -e . "$f" > /dev/null 2>&1 && cat "$f"; done | jq -c '
  .elements[]? | select(.tags.name != null)
  | (.tags.name | ascii_downcase) as $n
  | (if   ($n | test("^[Öö]de"))                                  then 6
     elif ($n | test("(ryd|röd|red|rud|boda|måla|säter|sätra|böle|bol)$")) then 5
     elif ($n | test("(torp|arp|rup)$"))                       then 4
     elif ($n | test("(sta|stad|tuna)$"))                      then 2
     elif ($n | test("(inge|unge|hem|lösa)$"))                 then 1
     elif ($n | test("by$"))                                   then 3
     else null end) as $g
  | select($g != null)
  | [.tags.name, (.lon * 10000 | round / 10000), (.lat * 10000 | round / 10000), $g]
' | jq -s -c 'unique' > "$ROT/data/ortnamn.json"

jq -r '"Skrev \(length) ortnamn till data/ortnamn.json: " + (group_by(.[3]) | map("grupp \(.[0][3])=\(length)") | join(", "))' "$ROT/data/ortnamn.json"
