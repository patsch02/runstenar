# encoding: utf-8
# Bygger en egen sida per inskrift, så att sökmotorer och länkar hittar dem:
#
#   ruby scripts/bygg-sidor.rb
#
#   sten/<signum>.html      en sida per inskrift (U 344 → sten/u-344.html) med text, översättning, datering,
#                           personer, bild, inskrifter i närheten och en länk in i kartan
#   sten/index.html         register: landskap och länder
#   sten/landskap-<x>.html  alla inskrifter i ett landskap eller land
#   sitemap.xml             alla sidor, för sökmotorer
#
# Sidorna byggs ur data/runor.json, data/bilder.json och data/resmal.json och hämtar ingenting från nätet.
# Texterna (status, dateringens förbehåll, personer, AI-märkning) ska säga samma sak som detaljrutan i
# js/detalj.js; ändras den ena ska den andra följa med. Filnamnet räknas ut likadant i stenSida() där.
# Sidor för inskrifter som inte längre finns tas bort. Kör om skriptet när runor.json har ändrats
# (scripts/kontroll.rb säger till).
require 'json'
require 'uri'
Encoding.default_external = Encoding::UTF_8
Dir.chdir(File.expand_path('..', __dir__))

BAS = 'https://patsch02.github.io/runstenar/'
SNAV = 120   # som i js/grund.js
RIKTNINGAR = { 'öst' => 'färd österut', 'väst' => 'färd västerut', 'syd' => 'färd söderut' }
PLURAL = /\A(söner|bröder|makar|mågar)\z/
TYPSNITT = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600&family=Noto+Sans+Runic&display=swap'

def slug(text)
  text.unicode_normalize(:nfd).gsub(/[̀-ͯ]/, '').downcase.gsub(/[^a-z0-9]+/, '-').gsub(/\A-|-\z/, '')
end

def esc(text)
  text.to_s.gsub('&', '&amp;').gsub('<', '&lt;').gsub('>', '&gt;').gsub('"', '&quot;')
end

def datering(r)
  r['a'] == r['b'] ? "ca #{r['a']}" : "#{r['a']}–#{r['b']}"
end

def avstand_km(x1, y1, x2, y2)
  rad = Math::PI / 180
  a = Math.sin((y2 - y1) * rad / 2)**2 + Math.cos(y1 * rad) * Math.cos(y2 * rad) * Math.sin((x2 - x1) * rad / 2)**2
  12_742 * Math.asin(Math.sqrt(a))
end

def langd(km)
  return "#{(km * 100).round * 10} m" if km < 1
  km < 10 ? "#{km.round(1).to_s.sub('.', ',')} km" : "#{km.round} km"
end

def lista(delar)
  delar.size < 2 ? delar.join : "#{delar[0..-2].join(', ')} och #{delar[-1]}"
end

# Landskapskoder som "NO" och "GB-ENG" är inga namn; då räcker landet.
def landskap(r)
  r['la'] && r['la'] !~ /\A[A-Z-]+\z/ && r['la'] != 'Okänd' ? r['la'] : nil
end

def platsrad(r)
  [r['pl'], r['so'], landskap(r), r['co']].compact.uniq.join(', ')
end

# Registret: svenska och danska inskrifter per landskap, övriga per land.
def grupp(r)
  %w[Sverige Danmark].include?(r['co']) ? (landskap(r) || "#{r['co']}, okänt landskap") : (r['co'] || 'Okänt land')
end

def naturlig(signum)
  signum.scan(/\d+|\D+/).map { |d| d =~ /\d/ ? [0, d.to_i, ''] : [1, 0, d.downcase] }
end

def har_oversattning?(r)
  r['t'] && r['t'] =~ /[^…\s.§A-H]/
end

def huvud(titel, beskrivning, fil)
  <<~HTML
    <!doctype html>
    <html lang="sv">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>#{esc(titel)} | Runstenar i tid och rum</title>
    <meta name="description" content="#{esc(beskrivning)}">
    <link rel="canonical" href="#{BAS}sten/#{fil}">
    <meta property="og:title" content="#{esc(titel)}">
    <meta property="og:description" content="#{esc(beskrivning)}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="#{BAS}sten/#{fil}">
    <meta property="og:site_name" content="Runstenar i tid och rum">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="#{TYPSNITT}">
    <link rel="stylesheet" href="../style.css">
    <link rel="stylesheet" href="sten.css">
    </head>
    <body class="stensida">
  HTML
end

FOT = <<~HTML
  <footer class="fot">
  <p>Inskrifterna kommer från Samnordisk runtextdatabas via Riksantikvarieämbetets tjänst Runor. Årtal som är härledda
  ur stil eller period, personnamn och släktband som tolkats automatiskt och svenska AI-översättningar är märkta på
  sidorna. <a href="../">Till kartan och tidslinjen</a> · <a href="index.html">Alla inskrifter</a></p>
  </footer>
HTML

def stig(*led)
  delar = [['../', 'Runstenar i tid och rum'], ['index.html', 'Alla inskrifter'], *led]
  "<nav class=\"stig\" aria-label=\"Var du är\">#{delar.map { |href, text| href ? "<a href=\"#{href}\">#{esc(text)}</a>" : "<span>#{esc(text)}</span>" }.join(' › ')}</nav>\n"
end

def status_html(r)
  if r['fs']
    kalla = if r['bn'] then "Avbildad i Bautil (#{esc(r['bn'])}), vars träsnitt bygger på Hadorphs och Peringskiölds inventeringar från 1600-talets slut."
            elsif r['ln'] then "Upptagen i Liljegrens Run-urkunder 1833 (#{esc(r['ln'])}), som bygger på äldre uppteckningar."
            else 'Databasen anger ingen äldre förteckning.'
            end
    "<p class=\"status borta\"><b>Försvunnen.</b> Platsen nedan är den äldsta kända. #{kalla}</p>\n"
  elsif r['cx']
    "<p class=\"status\"><b>Flyttad.</b> Står i dag #{langd(avstand_km(r['x'], r['y'], r['cx'], r['cy']))} från sin äldsta kända plats.#{r['pm'] ? " #{esc(r['pm'])}" : ''}</p>\n"
  elsif r['pm']
    "<p class=\"status\">#{esc(r['pm'])}</p>\n"
  else
    ''
  end
end

def bild_html(r, bilder)
  b = bilder[r['s'].upcase]
  return '' unless b
  if b.is_a?(String)
    return "<figure class=\"bild\" data-commons=\"#{esc(b)}\" data-namn=\"#{esc(r['s'])}\"><div class=\"ram\"></div>" \
           "<figcaption class=\"not\">Bild från Wikimedia Commons (kräver JavaScript). Bilden är vald i Wikidata och visar ibland platsen snarare än inskriften.</figcaption></figure>\n"
  end
  sida = "https://pub.raa.se/visa/dokumentation/#{URI.encode_www_form_component(b['r'])}"
  upphov = b['b'] && b['b'].size > 70 ? "#{b['b'][0, 70].sub(/,[^,]*\z/, '')} m.fl." : b['b']
  text = esc(b['t'].sub(/\.?\s*\z/, '.'))
  text += " #{b['d'] ? 'Teckning' : 'Upphov'}: #{esc(upphov)}#{b['a'] ? ", #{esc(b['a'])}" : ''}." if upphov
  text += " #{esc(b['l'])} ·" if b['l']
  "<figure class=\"bild raa\"><a class=\"ram\" href=\"#{sida}\" rel=\"noopener\"><img src=\"https://pub.raa.se/dokumentation/#{URI.encode_www_form_component(b['r'])}/visning/1/miniatyr\" " \
    "alt=\"#{b['d'] ? 'Teckning' : 'Foto'}: #{esc(r['s'])}\" loading=\"lazy\"></a>" \
    "<figcaption class=\"not\">#{text} <a href=\"#{sida}\" rel=\"noopener\">Riksantikvarieämbetets arkiv</a>, större bild där.</figcaption></figure>\n"
end

def oversattning_html(r)
  return '' unless har_oversattning?(r)
  unless r['ts']
    return "<blockquote>#{esc(r['t'])}#{r['tl'] == 'en' ? ' <span class="not">(engelsk översättning)</span>' : ''}</blockquote>\n"
  end
  "<blockquote class=\"ai\">#{esc(r['ts'])}\n<span class=\"ai-marke\">AI-översättning från databasens engelska, inte granskad av runolog</span></blockquote>\n" \
    "<details class=\"engelsk\"><summary>Databasens engelska översättning</summary><p>#{esc(r['t'])}</p></details>\n"
end

def personer_html(r)
  return '' unless r['pn']
  slakt = ''
  kanda = []
  if r['sl']
    resare, minne = r['sl']
    kanda = resare + minne.map(&:first)
    efter = minne.map do |n, rel|
      next 'sig själv, medan de levde' if n == 'sig själv'
      "#{esc(n)}#{rel ? ", #{rel =~ PLURAL ? 'sina' : 'sin'} #{esc(rel)}" : ''}"
    end
    efter[0] = 'sig själv i livstiden' if resare.size == 1 && minne[0][0] == 'sig själv'
    slakt = "<dl class=\"slakt\"><dt>Reste</dt><dd>#{lista(resare.map { |n| esc(n) })}</dd><dt>Till minne av</dt><dd>#{lista(efter)}</dd></dl>\n"
  end
  ovriga = r['pn'] - kanda
  namn = ovriga.empty? ? '' : "<p class=\"namn\">#{r['sl'] ? '<span>Nämns också:</span> ' : ''}#{esc(ovriga.join(', '))}</p>\n"
  "<section class=\"personer\"><h2>Personer i texten</h2>\n#{slakt}#{namn}" \
    "<p class=\"not\">Namn och släktband är tolkade automatiskt ur översättningen. Samma namn på olika inskrifter är ofta helt andra personer.</p></section>\n"
end

def not_html(r)
  text = case r['e']
         when 1 then 'Dateringen är härledd från ornamentikens stil (Gräslunds kronologi), inte hämtad ur databasen.'
         when 2 then "Dateringen följer den danska periodindelningen (#{esc(r['d'])}). Periodens årtal är ungefärliga."
         when 3 then 'Dateringen bygger på historiska uppgifter om personerna i texten, inte på stil.'
         else r['b'] - r['a'] > SNAV ? 'Grovt daterad: bara perioden är känd.' : nil
         end
  text ? "<p class=\"not\">#{text}</p>\n" : ''
end

# Länk in i kartan: året då inskriften finns, vyn över platsen och inskriften öppen (se Adress i js/panel.js).
def kartlank(r)
  ar = [[((r['a'] + r['b']) / 2.0).round, 150].max, 1550].min
  typ = r['k'] == 'R' ? '' : "&typ=R#{r['k']}"
  "../#ar=#{ar}&s=#{URI.encode_www_form_component(r['s'])}&vy=#{r['x'].round(2)},#{r['y'].round(2)},11.0#{typ}"
end

def stensida(r, bilder, resmal, nara)
  fil = "#{slug(r['s'])}.html"
  sak = r['f'] || 'Inskrift'
  titel = "#{r['s']} – #{[sak, r['pl'], landskap(r) || r['co']].compact.join(', ')}"
  oversatt = har_oversattning?(r) ? (r['ts'] || r['t']).gsub(/§[A-Z]+\s*/, '').strip : nil
  beskrivning = [oversatt && "”#{oversatt.size > 150 ? "#{oversatt[0, 150].sub(/\s+\S*\z/, '')} …" : oversatt}”",
                 "#{sak} från #{platsrad(r)}, daterad #{datering(r)}. Runtext, översättning och läsning ord för ord."].compact.join(' ')
  rad = ->(namn, varde) { varde.to_s.empty? ? '' : "<dt>#{namn}</dt><dd>#{esc(varde)}</dd>\n" }
  namner = ((r['rs'] || []).map { |k| resmal.dig(k, 'n') || RIKTNINGAR[k] } + [r['br'] ? 'brobygge' : nil]).compact.join(', ')
  g = grupp(r)
  html = huvud(titel, beskrivning, fil)
  html << stig(["landskap-#{slug(g)}.html", g], [nil, r['s']])
  html << "<article id=\"detalj\" class=\"ruta\">\n<h1>#{esc(r['s'])}</h1>\n<p class=\"under\">#{esc(sak)} · #{esc(platsrad(r))}</p>\n"
  html << status_html(r) << bild_html(r, bilder) << oversattning_html(r)
  html << "<p class=\"norm\"><span class=\"sprak\">#{esc(r['nl'])}</span> <span class=\"txt\">#{esc(r['n'])}</span></p>\n" if r['n']
  if r['r']
    html << "<p class=\"runor\"><span class=\"sprak\">Translitterering</span><span class=\"txt\">#{esc(r['r'])}</span></p>\n"
    html << "<section class=\"lasning\" data-period=\"#{esc(r['p'])}\"><h2>Läs ord för ord</h2><div class=\"las-yta\"><p class=\"not\">Läsningen ord för ord kräver JavaScript.</p></div></section>\n"
  end
  html << personer_html(r)
  html << "<dl>\n"
  html << rad.call('Datering', datering(r) + (r['d'] ? " (#{r['d']})" : ''))
  html << rad.call('Period', r['p']) << rad.call('Stil', r['st']) << rad.call('Ristare', r['c'])
  html << rad.call('Plats', r['pl']) << rad.call('Socken', r['so']) << rad.call('Landskap', [r['la'], r['co']].compact.join(', '))
  html << rad.call('Äldre nr', [r['bn'], r['ln']].compact.join(', ')) << rad.call('Nämner', namner)
  html << "</dl>\n" << not_html(r)
  html << "<p class=\"lankar\"><a class=\"knapp\" href=\"#{esc(kartlank(r))}\">Visa på kartan och tidslinjen</a>\n"
  html << "<a href=\"#{esc(r['u'])}\" rel=\"noopener\">Öppna posten i runtextdatabasen</a></p>\n" if r['u']
  html << "</p>\n" unless r['u']
  unless nara.empty?
    html << "<nav class=\"nara\"><h2>Inskrifter i närheten</h2><ul>\n"
    nara.each do |km, o|
      html << "<li><a href=\"#{slug(o['s'])}.html\">#{esc(o['s'])}</a> <span>#{esc([o['f'], o['pl']].compact.join(', '))} · #{langd(km)}</span></li>\n"
    end
    html << "</ul></nav>\n"
  end
  html << "</article>\n" << FOT
  html << "<script src=\"../js/lasning.js\"></script>\n<script src=\"sten.js\"></script>\n</body>\n</html>\n"
  [fil, html]
end

# De närmaste inskrifterna till var och en, via ett rutnät så att inte alla jämförs med alla.
def narmaste(runor, antal = 6)
  ruta = ->(r) { [(r['x'] / 0.5).floor, (r['y'] / 0.25).floor] }
  nat = Hash.new { |h, k| h[k] = [] }
  runor.each { |r| nat[ruta.call(r)] << r }
  runor.map do |r|
    gx, gy = ruta.call(r)
    kandidater = []
    (1..6).each do |vidd|
      kandidater = (-vidd..vidd).flat_map { |dx| (-vidd..vidd).flat_map { |dy| nat.fetch([gx + dx, gy + dy], []) } }
      break if kandidater.size > antal * 3
    end
    kandidater.reject { |o| o.equal?(r) }.map { |o| [avstand_km(r['x'], r['y'], o['x'], o['y']), o] }
              .sort_by { |km, o| [km, o['s']] }.first(antal).select { |km, _| km < 60 }
  end
end

def gruppsida(namn, lista_)
  fil = "landskap-#{slug(namn)}.html"
  html = huvud("Runinskrifter i #{namn}", "Alla #{lista_.size} runinskrifter i #{namn} i Samnordisk runtextdatabas, med text, översättning och datering.", fil)
  html << stig([nil, namn])
  html << "<article id=\"detalj\" class=\"ruta\">\n<h1>#{esc(namn)}</h1>\n<p class=\"under\">#{lista_.size} inskrifter</p>\n<ul class=\"register\">\n"
  lista_.sort_by { |r| naturlig(r['s']) }.each do |r|
    html << "<li><a href=\"#{slug(r['s'])}.html\">#{esc(r['s'])}</a> <span>#{esc([r['f'], r['pl'], datering(r)].compact.join(' · '))}</span></li>\n"
  end
  html << "</ul>\n</article>\n" << FOT << "</body>\n</html>\n"
  [fil, html]
end

def registersida(grupper, antal)
  html = huvud('Alla runinskrifter', "Register över #{antal} nordiska runinskrifter från år 150 till 1550, ordnade efter landskap och land.", 'index.html')
  html << stig
  html << "<article id=\"detalj\" class=\"ruta\">\n<h1>Alla inskrifter</h1>\n<p class=\"under\">#{antal} inskrifter efter landskap och land</p>\n"
  sverige, ovriga = grupper.partition { |_, l| l.first['co'] == 'Sverige' }
  danmark, ovriga = ovriga.partition { |_, l| l.first['co'] == 'Danmark' }
  [['Sverige', sverige], ['Danmark', danmark], ['Övriga länder', ovriga]].each do |rubrik, del|
    html << "<h2>#{rubrik}</h2>\n<ul class=\"register kort\">\n"
    del.sort_by { |namn, _| namn }.each { |namn, l| html << "<li><a href=\"landskap-#{slug(namn)}.html\">#{esc(namn)}</a> <span>#{l.size}</span></li>\n" }
    html << "</ul>\n"
  end
  html << "</article>\n" << FOT << "</body>\n</html>\n"
  ['index.html', html]
end

# Alla sidor som { filnamn => html }, plus sitemap.
def bygg_sidor
  runor = JSON.parse(File.read('data/runor.json'))
  bilder = JSON.parse(File.read('data/bilder.json'))
  resmal = JSON.parse(File.read('data/resmal.json'))
  nara = narmaste(runor)
  sidor = {}
  runor.each_with_index do |r, i|
    fil, html = stensida(r, bilder, resmal, nara[i])
    raise "Två inskrifter får samma filnamn: #{fil}" if sidor.key?(fil)
    sidor[fil] = html
  end
  grupper = runor.group_by { |r| grupp(r) }
  grupper.each { |namn, l| fil, html = gruppsida(namn, l); sidor[fil] = html }
  fil, html = registersida(grupper, runor.size)
  sidor[fil] = html
  adresser = [BAS] + sidor.keys.sort.map { |f| "#{BAS}sten/#{f}" }
  sitemap = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" \
            "#{adresser.map { |a| "<url><loc>#{a}</loc></url>" }.join("\n")}\n</urlset>\n"
  [sidor, sitemap]
end

if $PROGRAM_NAME == __FILE__
  sidor, sitemap = bygg_sidor
  Dir.mkdir('sten') unless Dir.exist?('sten')
  andrade = 0
  sidor.each do |fil, html|
    sokvag = File.join('sten', fil)
    next if File.exist?(sokvag) && File.read(sokvag) == html
    File.write(sokvag, html)
    andrade += 1
  end
  gamla = Dir['sten/*.html'].reject { |f| sidor.key?(File.basename(f)) }
  gamla.each { |f| File.delete(f) }
  File.write('sitemap.xml', sitemap)
  puts "sten/: #{sidor.size} sidor (#{andrade} nya eller ändrade, #{gamla.size} borttagna), sitemap.xml med #{sidor.size + 1} adresser"
end
