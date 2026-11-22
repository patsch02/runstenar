# encoding: utf-8
# Bygger data/ordbok.json, som "Läs ord för ord" (js/lasning.js) använder:
#
#   ruby scripts/bygg-ordbok.rb
#
# ord  – de handskrivna ordförklaringarna i scripts/glosor.json (ordform → betydelse).
# namn – ordformer som står med stor bokstav inne i en mening någonstans i de normaliserade texterna
#        i data/runor.json, alltså person- och ortnamn. Listan behövs för att skilja ett namn från ett
#        vanligt ord när ordet står först i en mening. Former som finns i ordlistan räknas inte som namn.
#
# Kör om skriptet när glosor.json eller runor.json har ändrats (scripts/kontroll.rb säger till).
require 'json'
Encoding.default_external = Encoding::UTF_8
Dir.chdir(File.expand_path('..', __dir__))

# Samma rensning som lasGlosa() i js/lasning.js.
def nyckel(ord)
  ord.gsub(/[\[\](){}<>?^|¶]/, '').gsub(/[.,;:!…"]/, '').split('/').first.to_s
end

def bygg_ordbok
  ord = JSON.parse(File.read('scripts/glosor.json')).reject { |k, _| k == '_' }
  namn = {}
  JSON.parse(File.read('data/runor.json')).each do |r|
    forst = true
    (r['n'] || '').split(/\s+/).each do |t|
      if t.start_with?('§') then forst = true; next end
      rent = nyckel(t)
      next if rent.empty? || rent =~ /\A[\/-]+\z/
      liten = rent.downcase
      namn[liten] = true if !forst && rent[0] != liten[0] && !ord.key?(liten)
      forst = t.match?(/[.!?]\z/)
    end
  end
  { 'ord' => ord, 'namn' => namn.keys.sort }
end

if $PROGRAM_NAME == __FILE__
  bok = bygg_ordbok
  File.write('data/ordbok.json', JSON.generate(bok) + "\n")
  puts "data/ordbok.json: #{bok['ord'].size} ordförklaringar, #{bok['namn'].size} namnformer"
end
