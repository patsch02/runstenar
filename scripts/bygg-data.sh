#!/bin/sh
# Bygger data/runor.json från Riksantikvarieämbetets öppna Runor-API
# (Samnordisk runtextdatabas, utgåva "latest").
#
#   sh scripts/bygg-data.sh [cache-katalog]
#
# Steg 1 hämtar en lista över alla inskrifter som har koordinater.
# Steg 2 hämtar detaljposten för var och en (cachas, så en omkörning är snabb).
# Steg 3 plockar ut de fält sajten använder och skriver en kompakt JSON-fil.
set -e

API="https://runor.raa.se/api/snrd"
UA="User-Agent: runsten-karta/0.1"
ROT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${1:-$ROT/.cache}"
mkdir -p "$CACHE/details" "$ROT/data"

# 1. Alla inskrifter med koordinater
if [ ! -s "$CACHE/map.json" ]; then
  curl -s -m 120 -H "$UA" "$API/map?edition_id=latest&bbox=-180,-90,180,90" -o "$CACHE/map.json"
fi
jq -r '.[].inscription_id' "$CACHE/map.json" | sort -u > "$CACHE/ids.txt"

# 2. Detaljposter, fem åt gången för att inte belasta servern
cd "$CACHE"
export API UA
xargs -P 5 -n 1 sh -c '
  f="details/$0.json"
  [ -s "$f" ] || curl -s -m 40 --retry 3 --retry-delay 2 -H "$UA" "$API/inscriptions/$0?edition_id=latest" -o "$f"
' < ids.txt

# 3. Kompakt datafil
find details -name '*.json' -size +0 -print0 | xargs -0 cat | jq -c '
  def ren: if . == null then null else (gsub("\\s+"; " ") | sub("^ "; "") | sub(" $"; "")) end;
  {"Rak": [980, 1015], "Fp": [1010, 1050], "Pr1": [1010, 1040], "Pr2": [1020, 1050],
   "Pr3": [1045, 1075], "Pr4": [1070, 1100], "Pr5": [1100, 1130]} as $stil |
  select(type == "object" and .inscription_id != null)
  | select((.period.period // "") != "UTGÅR")
  | (.position.oldest_known // .position.current) as $pos
  | select($pos != null and .termini != null and .termini.tpq != null and .termini.taq != null)
  | (.runic_texts[0] // null) as $t
  | ([$t.translations[]? | select(.language.language_code == "sv-se") | .translation][0]) as $sv
  | ([$t.translations[]? | select(.language.language_code == "en-gb") | .translation][0]) as $en
  | ((.artefact // "") | ascii_downcase) as $f
  # Resmål och broar som nämns i texten. Sökningen görs i den engelska
  # översättningen eftersom den finns för flest inskrifter och har enhetliga namn.
  | ([.runic_texts[]?.translations[]? | select(.language.language_code == "en-gb") | .translation] | join(" ")) as $alla
  | .signum1 as $sig
  | ([ {k: "england", r: "England", ej: ["E"]}, {k: "london", r: "London"}, {k: "bath", r: "\bBath\b"},
       {k: "grekland", r: "Greece|Greeks"}, {k: "sarkland", r: "Serkland|with Ingvarr|Ingvarr.s retinue"},
       {k: "gardarike", r: "Garðar"}, {k: "holmgard", r: "Holmgarð"}, {k: "jerusalem", r: "Jerusalem"},
       {k: "langbardaland", r: "Lombardy|Langbarðaland"}, {k: "saxland", r: "Saxony|Saxland"},
       {k: "danmark", r: "Denmark", ej: ["DR"]}, {k: "hedeby", r: "Hedeby|Heiðabý", ej: ["DR"]},
       {k: "gotland", r: "Gotland", ej: ["G"]}, {k: "finland", r: "Finland|Tafeistaland"},
       {k: "estland", r: "Estonia|Eistland|Virland"}, {k: "livland", r: "Lífland|Livonia|Seimgal|Dómisnes"},
       {k: "öst", r: "in the east|eastwards|to the east"}, {k: "väst", r: "in the west|westwards|to the west"},
       {k: "syd", r: "in the south|southwards"} ]
     | map(select(.r as $r | ($alla | test($r))) | select((.ej // []) | index($sig) | not) | .k)) as $resmal
  # Flyttad = nuvarande plats ligger mer än ca 50 m från den äldsta kända
  | (.position.current != null and .position.oldest_known != null and
     (((.position.current.coordinates[0] - $pos.coordinates[0]) | fabs) > 0.001 or
      ((.position.current.coordinates[1] - $pos.coordinates[1]) | fabs) > 0.0005)) as $flyttad
  | {
      s: ((.signum1 + " " + .signum2) | ren),
      x: $pos.coordinates[0], y: $pos.coordinates[1],
      a: .termini.tpq, b: .termini.taq,
      k: (if ($f | test("runsten|berghäll|runhäll|stenblock|flyttblock|ristad sten")) then "R"
          elif ($f | test("grav|kummel|kistlock|gavelhäll")) then "G"
          else "O" end),
      f: .artefact,
      p: .period.sv,
      d: (.dating.dating // null),
      st: ([.profile_style[]? | .style + (if .certainty then "" else "?" end)] | join(", ")),
      c: ([.carver[]? | .name + (if .certainty then "" else "?" end)] | unique | join(", ")),
      pl: (.provenance.place.place | ren),
      so: .provenance.parish.parish,
      la: .provenance.province.province,
      co: .provenance.country.sv,
      t: ($sv // $en | ren),
      tl: (if $sv then "sv" elif $en then "en" else null end),
      r: ($t.reading | ren),
      u: .uri,
      rs: $resmal,
      br: (if ($alla | test("bridge|causeway|\bford\b")) then 1 else null end),
      fs: (if .extant == false then 1 else null end),
      bn: ([.alternative_signa[]? | select(test("^B [0-9]"))][0]),
      ln: ([.alternative_signa[]? | select(test("^L [0-9]"))][0]),
      pm: (.placement | ren),
      cx: (if $flyttad then .position.current.coordinates[0] else null end),
      cy: (if $flyttad then .position.current.coordinates[1] else null end)
    }
  # Databasen daterar Rak och Fp snävt men lämnar ofta Pr 1–Pr 5 på hela
  # vikingatiden. Då används Gräslunds stilkronologi i stället (e = 1), utom för stenar som
  # databasen daterar efter den danska periodindelningen; dem rättar scripts/datering.jq.
  | ([.st | split(", ")[] | gsub("[^A-Za-z0-9]"; "") | select(. != "") | $stil[.]]) as $ar
  | if (.b - .a > 120) and ($ar | length > 0) and ($ar | all(. != null))
       and ((.d // "") | test("jelling|helnæs|gørlev"; "i") | not)
    then .a = ($ar | map(.[0]) | min) | .b = ($ar | map(.[1]) | max) | .e = 1
    else . end
  | with_entries(select(.value != null and .value != "" and .value != []))
' | jq -s -c -f "$ROT/scripts/datering.jq" > "$ROT/data/runor.json"

echo "Skrev $(jq length "$ROT/data/runor.json") inskrifter till data/runor.json"

# 4. Normaliserad text, personnamn och släktband ur samma detaljposter
ruby "$ROT/scripts/bygg-namn.rb" "$CACHE"

# 5. Svenska AI-översättningar där databasen bara har engelska (se scripts/ai-oversattning.rb)
ruby "$ROT/scripts/ai-oversattning.rb"
