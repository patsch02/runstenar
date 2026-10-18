# Rättar dateringen i runor.json efter att bygg-data.sh har byggt den (jq -c -f scripts/datering.jq).
#
# 1. Danska stenar (även i Skåne, Blekinge och Sydslesvig) dateras i databasen efter den danska
#    periodindelningen (Helnæs-Gørlev, för-Jelling, Jelling, efter-Jelling). Gräslunds
#    stilkronologi gäller Mälardalen och ska inte användas på dem. Årtalen per period är
#    ungefärliga; Helnæs-Gørlev och efter-Jelling har samma gränser som databasen. e = 2.
# 2. Stenar som kan dateras med historiska uppgifter om de personer som nämns. e = 3.

{ "hg": [750, 900], "fj": [900, 950], "j": [950, 1000], "ej": [1000, 1050] } as $period
| { "DR 41": [940, 958],     # Gorm reste den; han dog 958/959 (dendrodatering av gravkammaren i Nordhögen)
    "DR 42": [960, 986] }    # Harald Blåtands kristnande på 960-talet till hans död omkring 986
  as $historisk
| map(
    ((.d // "") | ascii_downcase) as $d
    | ([ (if ($d | test("helnæs|gørlev")) then "hg" else empty end),
         (if ($d | test("f[öø]r-jelling")) then "fj" else empty end),
         (if ($d | test("efter-jelling")) then "ej" else empty end),
         (if ($d | gsub("f[öø]r-jelling|efter-jelling"; "") | test("jelling")) then "j" else empty end) ]) as $p
    | if ($p | length) > 0
      then .a = ($p | map($period[.][0]) | min) | .b = ($p | map($period[.][1]) | max) | .e = 2
      else . end
    | if $historisk[.s] then .a = $historisk[.s][0] | .b = $historisk[.s][1] | .e = 3 else . end
  )
| sort_by(.a, .b, .s)
