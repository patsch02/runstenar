# encoding: utf-8
# Lägger in svenska AI-översättningar i data/runor.json som fältet `ts`, för inskrifter där
# runtextdatabasen bara har engelsk översättning (tl = "en").
#
#   ruby scripts/ai-oversattning.rb
#
# Översättningarna står i scripts/ai-oversattningar.json (engelsk text → svensk). De är gjorda
# av en AI-modell (Claude) från databasens engelska översättning, inte från runtexten, och
# visas på sajten tydligt märkta som sådana. Namn står kvar i databasens fornnordiska form.
# Körs sist i bygg-data.sh; en engelsk text som saknas i filen får ingen svensk översättning.
require 'json'

ROT = File.expand_path('..', __dir__)
FIL = File.join(ROT, 'data', 'runor.json')
ai = JSON.parse(File.read(File.join(ROT, 'scripts', 'ai-oversattningar.json')))
runor = JSON.parse(File.read(FIL))
antal = 0
# Några inskrifter från Hedeby har en dansk översättning (med källhänvisning till DK) som databasen
# märkt som svensk. De får tl = "da" och översätts till svenska på samma sätt som de engelska.
DANSK = /\[Källa: DK nr\.:[^\]]*\]\s*\z/
runor.each do |r|
  r.delete('ts')
  r['tl'] = 'da' if r['tl'] == 'sv' && r['t'] =~ DANSK
  next unless %w[en da].include?(r['tl']) && ai[r['t']]
  r['ts'] = ai[r['t']]
  antal += 1
end
File.write(FIL, JSON.generate(runor))
puts "Svensk AI-översättning för #{antal} inskrifter"
