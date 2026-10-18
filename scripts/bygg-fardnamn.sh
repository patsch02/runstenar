#!/bin/sh
# Bygger data/fardnamn.json: ortnamn som minner om hur man färdades.
# Källa: OpenStreetMap via Overpass.
#
#   sh scripts/bygg-fardnamn.sh
#
# Grupper: "bro" (bro, spång; norska bru), "vad", "ed" (dragställe där båtar
# släpades över land: svenska Ed/Eds-/Edet, norska eid, danska drag) och "sund".
#
# Varje rad i utfilen: [namn, lon, lat, grupp, land]
set -e

ROT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROT/.cache/osm"
mkdir -p "$CACHE" "$ROT/data"
giltig() { [ -s "$1" ] && jq -e '.elements | length > 0' "$1" > /dev/null 2>&1; }

hamta() {  # hamta <fil> <område-id> <namnmönster>
  for server in https://overpass-api.de/api/interpreter https://overpass.private.coffee/api/interpreter \
                https://overpass-api.de/api/interpreter https://overpass.private.coffee/api/interpreter; do
    giltig "$CACHE/$1.json" && return 0
    curl -s -m 175 -H 'User-Agent: runsten-karta/0.1' "$server" -o "$CACHE/$1.json" \
      --data-urlencode "data=[out:json][timeout:160];area($2)->.a;node(area.a)[place][name~\"$3\"];out qt;" || true
    giltig "$CACHE/$1.json" || sleep 30
  done
  giltig "$CACHE/$1.json" || { echo "Kunde inte hämta $1 (servern upptagen). Kör skriptet igen senare." >&2; rm -f "$CACHE/$1.json"; return 1; }
}

hamta fard    3600052822 '(bro|spång|vad|vadet|sund|sundet|[Ee]det|stäket)$|^(Bro|Broby|Spånga|Vad|Vada|Sund|Ed|Eda|Edeby|Stäket)$|^Eds[a-zåäö]+$|^Snäck'
# Norge och Danmark delas upp i mindre frågor; en fråga som inte går att hämta hoppas över.
hamta fard-DK-ed   3600050046 '[Dd]rag(et)?$|^Drag(ør|et)?$' || true
hamta fard-DK-sund 3600050046 '[Ss]und(et)?$|^Sund(by|s)?$' || true
hamta fard-DK-bro  3600050046 '[Bb]ro(en)?$|^Bro(by|e)?$|[Vv]ad$|^Vad(um)?$' || true
hamta fard-NO-ed   3602978650 '(^|[^h])[Ee]id(et)?$|^Eid[a-zæøå]*$' || true
hamta fard-NO-sund 3602978650 '[Ss]und(et)?$' || true
hamta fard-NO-bro  3602978650 '[Bb]ru(a|en)?$|^Bru$|[Vv]ad(et)?$|^Vad$' || true

{
  jq -c '
    .elements[] | select(.tags.name != null) | .tags.name as $n
    # Snäck-namn hämtas men används inte: snäcka betyder oftare snigel än skepp.
    | (if ($n | test("^(Ed|Eda|Edeby)$|^Eds[a-zåäö]+$|(^| )Edet$"))    then "ed"
       elif ($n | test("(vad|vadet)$|^(Vad|Vada)$"))                     then "vad"
       elif ($n | test("(bro|spång)$|^(Bro|Broby|Spånga)$"))             then "bro"
       elif ($n | test("(sund|sundet|stäket)$|^(Sund|Stäket)$"))         then "sund"
       else null end) as $g
    | select($g != null)
    | [$n, (.lon * 10000 | round / 10000), (.lat * 10000 | round / 10000), $g, "SE"]
  ' "$CACHE/fard.json"
  for fil in "$CACHE"/fard-NO-*.json "$CACHE"/fard-DK-*.json; do
    giltig "$fil" || continue
    land=$(basename "$fil" | cut -d- -f2)
    jq -c --arg land "$land" '
      .elements[] | select(.tags.name != null) | .tags.name as $n
      # -breid (bred), höjddrag (höjdrygg) och tyska Stralsund är inte färdnamn
      | select($n | test("breid$|[Hh]øjdedrag|Stralsund") | not)
      | (if   ($n | test("(^|[^h])[Ee]id(et)?$|^Eid[a-zæøå]*$|[Dd]rag(et)?$|^Drag(ør|et)?$")) then "ed"
         elif ($n | test("[Ss]und(et)?$|^Sund(by|s)?$"))                                    then "sund"
         elif ($n | test("[Bb]ru(a|en)?$|^Bru$|[Bb]ro(en)?$|^Bro(by|e)?$"))                  then "bro"
         elif ($n | test("[Vv]ad(et)?$|^Vad(um)?$"))                                         then "vad"
         else null end) as $g
      | select($g != null)
      | [$n, (.lon * 10000 | round / 10000), (.lat * 10000 | round / 10000), $g, $land]
    ' "$fil"
  done
} | jq -s -c 'unique' > "$ROT/data/fardnamn.json"

jq -r '"Skrev \(length) namn till data/fardnamn.json: " + (group_by(.[4]) | map("\(.[0][4]): " + (group_by(.[3]) | map("\(.[0][3])=\(length)") | join(" "))) | join(", "))' "$ROT/data/fardnamn.json"
