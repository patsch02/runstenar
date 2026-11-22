#!/usr/bin/env ruby
# encoding: utf-8
# Lägger in norska gravar, bygdeborgar och hamnområden ur Riksantikvarens
# kulturminnesregister Askeladden i data/gravfalt.json, data/forsvar.json och data/sjofart.json.
#
#   ruby -Eutf-8:utf-8 scripts/bygg-askeladden.rb
#
# Källa: "Kulturminner – Lokaliteter, Enkeltminner og Sikringssoner" via Riksantikvarens
# OGC API (https://api.ra.no/LokaliteterEnkeltminnerOgSikringssoner), öppna data under
# NLOD 2.0. Kodlistorna (lokalitetsart, datering) kommer från register.geonorge.no.
#
# Körs EFTER de svenska byggskripten (bygg-bebyggelse.sh, bygg-forsvar.sh, bygg-sjofart.sh, bygg-vagar.sh),
# som skriver om filerna utan de norska posterna. Norska poster känns igen på id "no:…"
# och byts ut vid varje körning.
#
# Hämtningen är omkring 60 MB och cachas per sida i .cache/askeladden/ (nedkokad till de
# fält som används), så en avbruten körning fortsätter där den slutade.
#
# Vad som hämtas och hur det tolkas (antaganden, se förbehållen på sajten):
# - Gravar: lokaliteter av art Gravfelt (20109) och Gravminne (20164). Antalet gravar är
#   lokalitetens antal enkeltminnen. Åldern sätts ur enkeltminnenas datering (funktion
#   Gravminne, 1700): yngre järnålder om någon grav är daterad till yngre järnålder,
#   merovingertid eller vikingatid; äldre järnålder om någon är daterad till äldre järnålder;
#   "järnålder" om bara järnåldern i stort anges; "u" (förhistorisk, okänd ålder) om
#   ingen datering finns. Lokaliteter där gravarna bara är daterade till sten-, brons-
#   eller medeltid tas inte med.
# - Bygdeborgar: enkeltminnen av art Bygdeborg (1502), en punkt per lokalitet (mitten av
#   polygonen). De visas som fornborgar och följer samma tidsgränser som de svenska.
# - Hamnområden: lokaliteter av art Havneområde (20101) som är automatiskt fredade (äldre
#   än 1537), visade som hamnar oberoende av tidslinjen.
require 'json'
require 'net/http'
require 'uri'
require 'fileutils'

ROT = File.expand_path('..', __dir__)
CACHE = File.join(ROT, '.cache', 'askeladden')
FileUtils.mkdir_p(CACHE)
API = 'https://api.ra.no/LokaliteterEnkeltminnerOgSikringssoner/collections'
UA = { 'User-Agent' => 'runsten-karta/0.1', 'Accept' => 'application/geo+json' }
SIDA = 1000
# Fält som inte behövs (API:et avvisar namn som inte finns i samlingen, därav två listor)
ONODIGA = %w[informasjon opphav førsteDigitaliseringsdato linkAskeladden linkKulturminnesøk navnerom versjonId
  datafangstdato opprettet oppdateringsdato vernedato vernelov verneparagraf målemetode nøyaktighet synlig
  områdefredning nåværendeFunksjon lokalitetskategori].join(',')
ONODIGA_ENKELT = 'informasjon'

def hamta(samling, params)
  uri = URI("#{API}/#{samling}/items")
  uri.query = URI.encode_www_form(params.merge(f: 'json', limit: SIDA))
  4.times do |forsok|
    begin
      svar = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 300) { |h| h.get(uri.request_uri, UA) }
      return JSON.parse(svar.body.force_encoding('utf-8')) if svar.code == '200'
      warn "  #{svar.code}, försöker igen"
    rescue StandardError => e
      warn "  #{e.class}: #{e.message}, försöker igen"
    end
    sleep 5 * (forsok + 1)
  end
  raise "Askeladden svarar inte: #{uri}"
end

# Mitten av en (Multi)Polygon/Point: medelvärdet av hörnen, avrundat till 4 decimaler (ca 10 m)
def mitt(geom)
  return nil unless geom
  pkt = geom['coordinates'].flatten.each_slice(2).to_a
  return nil if pkt.empty?
  [pkt.sum(&:first) / pkt.size, pkt.sum(&:last) / pkt.size].map { |v| v.round(4) }
end

# Hämtar alla sidor för en fråga och kokar ner varje objekt med block; sidorna cachas som jsonl.
def alla(namn, samling, params)
  rader = []
  offset = 0
  loop do
    fil = File.join(CACHE, "#{namn}-#{offset}.jsonl")
    unless File.exist?(fil)
      svar = hamta(samling, params.merge(offset: offset))
      sida = svar['features'].map { |f| yield(f['properties'] || {}, f['geometry']) }.compact
      File.write(fil, sida.map { |r| JSON.generate(r) }.join("\n") + "\n#{svar['numberReturned']}\n")
      warn "  #{namn}: #{offset + svar['numberReturned']} av #{svar['numberMatched']}"
    end
    innehall = File.readlines(fil, chomp: true)
    antal = innehall.pop.to_i
    rader.concat(innehall.reject(&:empty?).map { |r| JSON.parse(r) })
    break if antal < SIDA
    offset += SIDA
  end
  rader
end

# Fylke ur kommunnumret (indelningen 2024 och de sammanslagna fylkena 2020–2023)
FYLKE = { '03' => 'Oslo', '11' => 'Rogaland', '15' => 'Møre og Romsdal', '18' => 'Nordland', '30' => 'Viken',
  '31' => 'Østfold', '32' => 'Akershus', '33' => 'Buskerud', '34' => 'Innlandet', '38' => 'Vestfold og Telemark',
  '39' => 'Vestfold', '40' => 'Telemark', '42' => 'Agder', '46' => 'Vestland', '50' => 'Trøndelag',
  '54' => 'Troms og Finnmark', '55' => 'Troms', '56' => 'Finnmark' }.freeze
fylke = ->(kommune) { FYLKE[kommune.to_s.rjust(4, '0')[0, 2]] }

# 1. Gravar: lokaliteterna och gravarnas datering
warn 'Gravar'
lok = %w[20109 20164].flat_map do |art|
  alla("grav-#{art}", 'lokaliteter', lokalitetsart: art, 'exclude-properties': ONODIGA) do |p, _|
    xy = p.dig('senterpunkt', 'coordinates')
    next nil unless xy
    { 'id' => p['kulturminneId'], 'n' => p['navn'], 'k' => p['kommune'], 'e' => p['antallEnkeltminner'],
      'x' => xy[0].round(4), 'y' => xy[1].round(4) }
  end
end
dat = alla('gravdatering', 'enkeltminner', opprinneligFunksjon: '1700', skipGeometry: true,
           properties: 'lokalitetId,datering') { |p, _| [p['lokalitetId'].to_s, p['datering']] }
datering = Hash.new { |h, k| h[k] = [] }
dat.each { |id, d| datering[id] << d.to_s.sub(/\A0+(?=\d)/, '') if d }   # API:et skriver "040", kodlistan "40"

YNGRE = %w[45 46 47 74 75].freeze           # yngre järnålder, merovinger-, vikingatid (och därifrån in i medeltiden)
ALDRE = %w[41 42 43 44].freeze              # äldre järnålder, förromersk och romersk järnålder, folkvandringstid
JARN = %w[40 72 73 62].freeze               # järnålder i stort (också brons–järnålder, samisk järnålder)
ANNAN = %w[20 21 22 23 30 31 32 70 71 50 51 52 53 60 61].freeze   # sten-, brons- och medeltid
grav_nya = lok.uniq { |l| l['id'] }.map do |l|
  d = datering[l['id'].to_s.split('-').first]
  g = if (d & YNGRE).any? then 'y'
      elsif (d & ALDRE).any? then 'a'
      elsif (d & JARN).any? then 'o'
      elsif d.any? && (d - ANNAN - %w[0 999 63]).empty? && (d & ANNAN).any? then nil
      else 'u' end
  next nil unless g
  [l['x'], l['y'], l['e'] || 0, g, l['n'] || '', "Askeladden #{l['id']}", "no:#{l['id']}"]
end.compact

# 2. Bygdeborgar
warn 'Bygdeborgar'
borgar = alla('bygdeborg', 'enkeltminner', enkeltminneart: '1502', 'exclude-properties': ONODIGA_ENKELT) do |p, geom|
  xy = mitt(geom)
  next nil unless xy
  { 'id' => p['lokalitetId'].to_s, 'n' => p['navn'], 'k' => p['kommune'], 'x' => xy[0], 'y' => xy[1] }
end
borg_nya = borgar.uniq { |b| b['id'] }.map do |b|
  { 't' => 'borg', 'x' => b['x'], 'y' => b['y'], 'n' => b['n'], 'nr' => "Askeladden #{b['id']}", 'id' => "no:#{b['id']}",
    'la' => fylke.(b['k']), 'land' => 'Norge' }.reject { |_, v| v.nil? || v == '' }
end

# 3. Hamnområden (automatiskt fredade)
warn 'Hamnområden'
hamnar = alla('hamn', 'lokaliteter', lokalitetsart: '20101', vernetype: 'AUT', 'exclude-properties': ONODIGA) do |p, _|
  xy = p.dig('senterpunkt', 'coordinates')
  next nil unless xy
  { 'id' => p['kulturminneId'], 'n' => p['navn'], 'k' => p['kommune'], 'x' => xy[0].round(4), 'y' => xy[1].round(4) }
end
hamn_nya = hamnar.uniq { |h| h['id'] }.map do |h|
  { 't' => 'hamn', 'x' => h['x'], 'y' => h['y'], 'n' => h['n'], 'nr' => "Askeladden #{h['id']}", 'id' => "no:#{h['id']}",
    'la' => fylke.(h['k']), 'land' => 'Norge' }.reject { |_, v| v.nil? || v == '' }
end

# 4. Vägar, broar och vadställen (automatiskt fredade enkeltminnen). Registret ritar dem som
# ytor. En avlång yta görs om till en mittlinje: ringen delas vid de två punkter som ligger längst
# ifrån varandra, båda sidorna läggs ut med 24 jämnt fördelade punkter och mittlinjen är medelvärdet
# parvis. Ytor som inte är avlånga (längd under tre gånger bredden) behålls som ytor.
VAGART = { '2016' => ['väg', 'Hålväg'], '2070' => ['väg', 'Vägfar'], '2021' => ['väg', 'Väg'],
           '2071' => ['väg', 'Ridväg'], '2001' => ['bro', 'Bro'], '2002' => ['bro', 'Kavelbro'],
           '2022' => ['vad', 'Vadställe'] }.freeze
METER_X = ->(lat) { 111_320 * Math.cos(lat * Math::PI / 180) }
def avstand(a, b, mx)
  Math.hypot((a[0] - b[0]) * mx, (a[1] - b[1]) * 110_540)
end

# Lägger ut en bana med n jämnt fördelade punkter längs dess längd
def jamna(bana, n, mx)
  langd = [0.0]
  bana.each_cons(2) { |a, b| langd << langd.last + avstand(a, b, mx) }
  return Array.new(n) { bana.first } if langd.last.zero?
  (0...n).map do |i|
    mal = langd.last * i / (n - 1)
    j = (langd.bsearch_index { |l| l >= mal } || langd.size - 1)
    j = 1 if j.zero?
    t = langd[j] == langd[j - 1] ? 0 : (mal - langd[j - 1]) / (langd[j] - langd[j - 1])
    [bana[j - 1][0] + t * (bana[j][0] - bana[j - 1][0]), bana[j - 1][1] + t * (bana[j][1] - bana[j - 1][1])]
  end
end

# Returnerar [:linje, punkter] eller [:yta, ring]
def mittlinje(ring)
  ring = ring[0...-1] if ring.first == ring.last
  return [:yta, ring] if ring.size < 4
  mx = METER_X.(ring[0][1])
  urval = ring.size > 300 ? ring.each_slice((ring.size / 300.0).ceil).map(&:first) : ring
  a, b = urval.combination(2).max_by { |p, q| avstand(p, q, mx) }
  i, j = [ring.index(a), ring.index(b)].sort
  sida1 = ring[i..j]
  sida2 = (ring[j..-1] + ring[0..i]).reverse
  s1 = jamna(sida1, 24, mx)
  s2 = jamna(sida2, 24, mx)
  mitt = s1.zip(s2).map { |p, q| [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }
  langd = mitt.each_cons(2).sum { |p, q| avstand(p, q, mx) }
  bredd = s1.zip(s2)[3..-4].sum { |p, q| avstand(p, q, mx) } / 18.0
  return [:yta, ring] if langd < 3 * [bredd, 1].max
  [:linje, mitt]
end
rund = ->(pkt) { pkt.map { |p| p.map { |v| v.round(5) } }.chunk_while { |a, b| a == b }.map(&:first) }

# Förenklar en bana (Douglas–Peucker) med toleransen tol meter
def forenkla(bana, tol = 2.0)
  return bana if bana.size < 3
  mx = METER_X.(bana[0][1])
  a = bana.first
  b = bana.last
  dx = (b[0] - a[0]) * mx
  dy = (b[1] - a[1]) * 110_540
  l = Math.hypot(dx, dy)
  avv = bana.map do |p|
    px = (p[0] - a[0]) * mx
    py = (p[1] - a[1]) * 110_540
    l.zero? ? Math.hypot(px, py) : (px * dy - py * dx).abs / l
  end
  i = (1...bana.size - 1).max_by { |k| avv[k] }
  return [a, b] if avv[i] <= tol
  forenkla(bana[0..i], tol)[0...-1] + forenkla(bana[i..-1], tol)
end

warn 'Vägar'
vagdel = VAGART.keys.flat_map do |art|
  alla("vag-#{art}", 'enkeltminner', enkeltminneart: art, vernetype: 'AUT') do |p, geom|
    next nil unless geom
    ringar = geom['type'] == 'Polygon' ? [geom['coordinates'][0]] : geom['coordinates'].map(&:first)
    { 'id' => p['lokalitetId'].to_s, 'kid' => p['kulturminneId'], 'art' => art, 'n' => p['navn'], 'k' => p['kommune'],
      'd' => p['informasjon'].to_s.sub(/\Anull\z/, '')[0, 400], 'r' => ringar.map { |r| rund.(r) } }
  end
end
vag_nya = vagdel.uniq { |v| v['kid'] }.map do |v|
  t, typ = VAGART[v['art']]
  linjer = []
  ytor = []
  v['r'].each do |r|
    sort, pkt = mittlinje(r)
    sort == :linje ? linjer << forenkla(rund.(pkt)) : ytor << [forenkla(rund.(pkt + [pkt.first]), 1.0)]
  end
  alla_pkt = v['r'].flatten(1)
  m = [alla_pkt.sum(&:first) / alla_pkt.size, alla_pkt.sum(&:last) / alla_pkt.size].map { |x| x.round(5) }
  namn = v['n'].to_s.strip
  namn = '' if namn.casecmp?(typ) || namn =~ /\A(hulve[gi]|vegfar|ve[gi]|veianlegg|veganlegg|bru|vadested|rideve[gi]|kavlebru)\z/i
  { 't' => t, 'typ' => typ, 'n' => namn, 'nr' => "Askeladden #{v['kid']}", 'id' => "no:#{v['id']}",
    'la' => fylke.(v['k']), 'land' => 'Norge', 'd' => v['d'], 'm' => m,
    'l' => (linjer.empty? ? nil : linjer), 'y' => (ytor.empty? ? nil : ytor) }.reject { |_, x| x.nil? || x == '' }
end

# 5. In i datafilerna: gamla norska poster ut, nya in
norsk = ->(id) { id.to_s.start_with?('no:') }
skriv = lambda do |fil, nya, &id|
  sokvag = File.join(ROT, 'data', fil)
  gamla = JSON.parse(File.read(sokvag)).reject { |r| norsk.(id.(r)) }
  File.write(sokvag, JSON.generate(gamla + nya))
  puts "#{fil}: #{gamla.size} svenska + #{nya.size} norska"
end
skriv.('gravfalt.json', grav_nya) { |r| r[6] }
skriv.('forsvar.json', borg_nya) { |r| r['id'] }
skriv.('sjofart.json', hamn_nya) { |r| r['id'] }
skriv.('vagar.json', vag_nya) { |r| r['id'] }
puts 'Vägar: ' + vag_nya.group_by { |v| v['typ'] }.map { |k, x| "#{k}=#{x.size}" }.join(', ') + ", som linje #{vag_nya.count { |v| v['l'] }}, som yta #{vag_nya.count { |v| v['y'] }}"
puts 'Gravarnas ålder: ' + grav_nya.group_by { |g| g[3] }.map { |k, v| "#{k}=#{v.size}" }.join(', ')
