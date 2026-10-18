# encoding: utf-8
# Lägger till normaliserad text och personer i data/runor.json ur de cachade detaljposterna
# från Runor-API:t (.cache/details, hämtade av bygg-data.sh). Körs efter bygg-data.sh:
#
#   ruby scripts/bygg-namn.rb [cache-katalog]
#
# Fält som skrivs:
#   n   normaliserad text (runsvenska om den finns, annars danska, fornvästnordiska …)
#   nl  språket för n, t.ex. "Runsvenska"
#   pn  personnamn i texten
#   sl  släktband: [[resare …], [[minnesperson, relation], …]]
#
# Personnamnen är ord med stor bokstav i den engelska översättningen som också står ordagrant
# i någon normalisering; så faller både ord som "And" och böjda ortnamn som "Englandi" bort.
# Släktbanden tolkas ur formler som "X raised this stone in memory of Y, his father" och är
# därför en förenkling: ovanliga formuleringar ger inga släktband, och samma namn på olika
# stenar kan vara olika personer.
require 'json'
require 'set'

ROT = File.expand_path('..', __dir__)
CACHE = ARGV[0] || File.join(ROT, '.cache')
FIL = File.join(ROT, 'data', 'runor.json')

SPRAK = %w[RSV RDA FDA FSV URN FVN]
RELATION = {
  'father' => 'far', 'mother' => 'mor', 'son' => 'son', 'sons' => 'söner', 'daughter' => 'dotter',
  'brother' => 'bror', 'brothers' => 'bröder', 'sister' => 'syster', 'husband' => 'make', 'wife' => 'hustru',
  'kinsman' => 'frände', 'partner' => 'kompanjon', 'comrade' => 'kamrat', 'foster-son' => 'fosterson',
  'foster-father' => 'fosterfar', 'foster-brother' => 'fosterbror', 'foster-mother' => 'fostermor',
  'foster-daughter' => 'fosterdotter', 'son-in-law' => 'måg', 'father-in-law' => 'svärfar',
  'mother-in-law' => 'svärmor', 'brother-in-law' => 'svåger', 'stepson' => 'styvson',
  'stepfather' => 'styvfar', 'grandfather' => 'farfar/morfar', 'grandson' => 'sonson/dotterson',
  'uncle' => 'farbror/morbror', 'nephew' => 'brorson/systerson', 'lord' => 'herre', 'master' => 'husbonde',
  'friend' => 'vän', 'husbandman' => 'make', 'husbandmen' => 'makar', 'housewife' => 'hustru', 'father-and-son' => 'far och son', 'sons-in-law' => 'mågar',
}
VERB = /\b(?:raised|had|made|placed|erected|cut|carved|built|laid|set up|arranged)\b/
MINNE = /\b(?:in memory of|after)\s+/
BOKSTAV = "A-Za-zÁÉÍÓÚÝÞÐÆØÅÄÖǪŒáéíóúýþðæøåäöǫœ"
NAMN = /\b[A-ZÁÉÍÓÚÝÞÐÆØÅÄÖǪ][#{BOKSTAV}\-]+/

ren = ->(t) { t.to_s.gsub(/\s+/, ' ').strip }
# Jämförelse utan diakritiska tecken och med runsvenskans ʀ och æ som r och e
vik = ->(t) { t.tr('ÁÉÍÓÚÝáéíóúýǫǪøØæÆœŒʀäÄöÖ', 'AEIOUYaeiouyoOoOeEoOrrAoO') }
gemensam = ->(a, b) { i = 0; i += 1 while i < a.length && i < b.length && a[i] == b[i]; i }
# Ord med stor bokstav som inte är personnamn trots att de liknar ett ord i normaliseringen
EJ_NAMN = %w[God Christ Mary Michael Saint Lord England Englandi Greece Greeks Denmark Gotland Jerusalem
  Saxony Finland Estonia Lombardy Serkland Sweden Swedes Norway Danes Frisians Holmr Garðar Garðaríki
  Sigtuna Uppsala Hedeby Rome Bath London Holmgarðr Tábýr Virland Langbarðaland Tafeistaland Lífland Eistland]
utanHak = ->(t) { t.gsub(/[\[\]()]/, '') }

poster = {}
Dir[File.join(CACHE, 'details', '*.json')].each do |f|
  next if File.zero?(f)
  d = JSON.parse(File.read(f)) rescue next
  next unless d.is_a?(Hash) && d['signum1']
  poster[ren.("#{d['signum1']} #{d['signum2']}")] = d
end

runor = JSON.parse(File.read(FIL))
antal = Hash.new(0)
runor.each do |r|
  d = poster[r['s']] or next
  %w[n nl pn sl].each { |k| r.delete(k) }
  texter = d['runic_texts'] || []
  tolkningar = texter.flat_map { |t| t['interpretations'] || [] }
  basta = SPRAK.lazy.map { |k| tolkningar.find { |i| i.dig('language', 'language_code') == k } }.find(&:itself)
  if basta && basta['text'].to_s =~ /[#{BOKSTAV}]{2}/
    r['n'] = ren.(basta['text'])
    r['nl'] = basta.dig('language', 'sv')
    antal[:n] += 1
  end

  normtext = utanHak.(tolkningar.map { |i| i['text'].to_s }.join(' '))
  normord = normtext.scan(NAMN).map { |v| vik.(v) }.uniq
  engelska = texter.flat_map { |t| (t['translations'] || []).select { |x| x.dig('language', 'language_code') == 'en-gb' }.map { |x| x['translation'].to_s } }
  # Ett namn i översättningen står i grundform, i normaliseringen ofta böjt (Haraldr – Harald, Ingvars):
  # det räcker att början stämmer, utom de tre sista bokstäverna, och minst tre bokstäver.
  ar_namn = lambda do |w|
    next false if w.length < 2 || EJ_NAMN.include?(w)
    v = vik.(w)
    normord.any? { |n| k = gemensam.(v, n); k >= [3, v.length - 3].max || (k == v.length && k == n.length) }
  end
  # Ord efter "in", "at" osv. är oftast ortnamn (died in Eið)
  namn = engelska.flat_map { |e| t = utanHak.(e); t.to_enum(:scan, NAMN).map { [$&, $~.pre_match] } }
    .reject { |_, fore| fore =~ /\b(?:in|at|from|to|towards|on|by)\s+\z|(?<!memory )\bof\s+\z/ }.map(&:first).select(&ar_namn).uniq
  if namn.any?
    r['pn'] = namn
    antal[:pn] += 1
  end

  # Släktband ur första meningen med en resarformel: "A and B raised this stone in memory of C, their father"
  # eller "… in memory of her son C". "Himself" blir en sten rest över sig själv i livstiden.
  mening = engelska.flat_map { |e| utanHak.(e).split(/(?<=[.;!])\s+/) }.find { |m| m =~ VERB && m =~ MINNE }
  if mening && namn.any?
    fore, efter = mening.split(MINNE, 2)
    resare = fore.split(VERB).first.to_s.to_enum(:scan, NAMN).map { [$&, $~.post_match] }
      .reject { |_, sen| sen =~ /\A['’]s?\b/ }.map(&:first).select { |w| namn.include?(w) }
    minne = []
    rel = "(?:good\\s+|own\\s+|two\\s+|dear\\s+)?([a-z\\-]+(?:\\s+and\\s+[a-z\\-]+)?)"
    svensk = ->(x) { x.to_s.split(/\s+and\s+/).map { |y| RELATION[y] }.compact.join(' och ') }
    if efter =~ /\A(?:himself|herself|themselves)\b/
      minne << ['sig själv']
    else
      # Fler minnespersoner än den första räknas bara när de räknas upp ("…, and B, their brother"),
      # inte när namnet står i genitiv (Ingvarr's brother) eller efter en preposition.
      efter.to_s.scan(/(?:(?:his|her|their)\s+#{rel}\s+(#{NAMN}))|(?:(#{NAMN})(?:,?\s+(?:his|her|their)\s+#{rel})?)/) do |rel1, w1, w2, rel2|
        w = w1 || w2
        fore, efter_ = $~.pre_match, $~.post_match
        next unless namn.include?(w)
        next if w2 && efter_ =~ /\A['’]s\b/
        next if minne.any? && fore !~ /(?:,|\band)\s*(?:(?:his|her|their)\s+[a-z\- ]+\s+)?\z/
        next if fore =~ /\b(?:in|at|from|to|on|by)\s+\z/
        sv = svensk.(rel1 || rel2)
        minne << [w, sv.empty? ? nil : sv].compact
      end
    end
    if resare.any? && minne.any?
      r['sl'] = [resare, minne.uniq]
      antal[:sl] += 1
    end
  end
end

File.write(FIL, JSON.generate(runor))
puts "Normaliserad text: #{antal[:n]}, personnamn: #{antal[:pn]}, släktband: #{antal[:sl]} av #{runor.size} inskrifter"
