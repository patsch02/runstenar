# encoding: utf-8
# Kontroller före publicering. Körs från projektmappen:
#
#   ruby scripts/kontroll.rb            # alla kontroller
#   ruby scripts/kontroll.rb --snabb    # utan nätet och utan Chrome
#
# 1. Alla JSON-filer går att läsa.
# 2. Signum i berättelserna finns i runor.json, och lagren de slår på finns i panelen.
# 3. Filerna som index.html hänvisar till finns.
# 4. Inget namn deklareras två gånger på toppnivå i js/*.js. Filerna delar globalt omfång,
#    så en dubbel funktion skriver tyst över den första (som personerHtml en gång gjorde).
# 5. Bilderna på Wikimedia Commons som berättelser, tidsbild och välkomstruta använder finns kvar.
# 6. Sidan startar i Chrome utan fönster utan JavaScript-fel (html får data-start="klar").
#
# Avslutar med kod 1 om något fel hittas, så att skriptet kan stoppa en publicering.
require 'json'
Encoding.default_external = Encoding::UTF_8
require 'net/http'
require 'uri'
require 'socket'
require 'set'
require 'tmpdir'

Dir.chdir(File.expand_path('..', __dir__))
SNABB = ARGV.include?('--snabb')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
$fel = []
$varningar = []
def fel(text)
  $fel << text
end

def ok(text)
  puts "  ok  #{text}"
end

puts '1. JSON-filer'
data = {}
(Dir['data/*.json'] + ['scripts/ai-oversattningar.json']).sort.each do |f|
  data[File.basename(f, '.json')] = JSON.parse(File.read(f))
rescue JSON::ParserError => e
  fel("#{f} går inte att läsa: #{e.message[0, 120]}")
end
ok("#{data.size} filer lästa") if $fel.empty?

puts '2. Berättelser'
signa = (data['runor'] || []).map { |r| r['s'] }.to_set
html = File.read('index.html', encoding: 'utf-8')
(data['turer'] || []).each do |tur|
  tur['steg'].each_with_index do |st, i|
    [*(st['s'] || []), st['oppna']].compact.each do |s|
      fel("#{tur['id']} steg #{i + 1}: signum #{s} finns inte i runor.json") unless signa.include?(s)
    end
    (st['lager'] || []).each do |l|
      fel("#{tur['id']} steg #{i + 1}: lagret #{l} finns inte i panelen (id visa-#{l})") unless html.include?(%(id="visa-#{l}"))
    end
  end
end
ok("#{(data['turer'] || []).size} berättelser") if $fel.none? { |f| f.include?('steg') }

puts '3. Filer i index.html'
html.scan(/(?:src|href)="([^"#]+)"/).flatten.reject { |u| u =~ %r{^(https?:)?//} }.each do |u|
  fil = u.sub(/\?.*/, '')
  fel("index.html hänvisar till #{fil}, som saknas") unless File.exist?(fil)
end
ok('alla lokala filer finns') if $fel.none? { |f| f.start_with?('index.html') }

puts '4. Namn i js/*.js'
# Toppnivådeklarationer: rader som börjar i kolumn 0. let/const kan deklarera flera namn
# med komma; initialvärden hoppas över genom att räkna parenteser.
namn = Hash.new { |h, k| h[k] = [] }
Dir['js/*.js'].sort.each do |f|
  text = File.read(f, encoding: 'utf-8')
  text.scan(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/) { namn[$1] << f }
  text.scan(/^(?:const|let|var)\s+(.*?);\s*(?:\/\/.*)?$/m) do |(dekl)|
    djup = 0
    del = +''
    delar = []
    dekl.each_char do |c|
      djup += 1 if '([{'.include?(c)
      djup -= 1 if ')]}'.include?(c)
      if c == ',' && djup.zero? then delar << del; del = +'' else del << c end
    end
    delar << del
    delar.each { |d| namn[$1] << f if d.strip =~ /\A([A-Za-z_$][\w$]*)/ }
  end
end
dubbla = namn.select { |_, filer| filer.size > 1 }
dubbla.each { |n, filer| fel("#{n} deklareras flera gånger: #{filer.uniq.map { |f| (k = filer.count(f)) > 1 ? "#{f} (#{k} ggr)" : f }.join(', ')}") }
ok("#{namn.size} namn, inga dubbla") if dubbla.empty?

unless SNABB
  puts '5. Bilder på Wikimedia Commons'
  filer = []
  (data['turer'] || []).each { |t| filer << t['bild']; t['steg'].each { |s| filer << s['bild'] } }
  (data['tidsbild'] || []).each do |p|
    p['kort'].each { |k| filer << k['bild'] }
    if (pers = p['personer'])
      filer << pers['bild']
      (pers['narbilder'] || []).each { |n| filer << n['bild'] }
    end
  end
  filer << File.read('js/panel.js', encoding: 'utf-8')[/VALKOMMEN_BILD = '([^']+)'/, 1]
  filer = filer.compact.uniq
  saknas = []
  filer.each_slice(40) do |grupp|
    uri = URI('https://commons.wikimedia.org/w/api.php')
    uri.query = URI.encode_www_form(action: 'query', format: 'json', prop: 'imageinfo', titles: grupp.map { |f| "File:#{f}" }.join('|'))
    req = Net::HTTP::Get.new(uri, 'User-Agent' => 'runstenar-kontroll/1.0')
    svar = JSON.parse(Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |h| h.request(req) }.body)
    normal = (svar.dig('query', 'normalized') || []).to_h { |n| [n['to'], n['from']] }
    svar.dig('query', 'pages').each_value do |sida|
      saknas << (normal[sida['title']] || sida['title']).sub(/^File:/, '') if sida.key?('missing') || !sida['imageinfo']
    end
    sleep 1
  rescue StandardError => e
    $varningar << "Commons gick inte att fråga (#{e.class}); bilderna är inte kontrollerade"
    break
  end
  saknas.each { |f| fel("bilden finns inte på Commons: #{f}") }
  ok("#{filer.size} bilder finns") if saknas.empty? && $varningar.empty?

  puts '6. Sidan startar i Chrome'
  if File.exist?(CHROME)
    port = TCPServer.open('127.0.0.1', 0) { |s| s.addr[1] }
    server = spawn('ruby', '-run', '-e', 'httpd', '.', '-p', port.to_s, out: File::NULL, err: File::NULL)
    begin
      sleep 2
      profil = File.join(Dir.tmpdir, "runstenar-kontroll-#{Process.pid}")
      dom = IO.popen([CHROME, '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
                      '--no-first-run', "--user-data-dir=#{profil}", '--virtual-time-budget=30000', '--dump-dom',
                      "http://localhost:#{port}/"], err: File::NULL, &:read)
      tagg = dom[/<html[^>]*>/].to_s
      if (f = tagg[/data-fel="([^"]*)"/, 1]) then fel("JavaScript-fel vid start: #{f.gsub('&quot;', '"')}")
      elsif tagg.include?('data-start="klar"') then ok('startar utan fel')
      else fel('sidan blev inte klar inom 30 sekunder (data-start saknas)')
      end
    ensure
      Process.kill('TERM', server)
      Process.wait(server)
    end
  else
    $varningar << 'Google Chrome hittades inte; starten är inte kontrollerad'
  end
end

puts
$varningar.each { |v| puts "VARNING: #{v}" }
if $fel.empty?
  puts 'Allt ser bra ut.'
else
  puts "#{$fel.size} fel:"
  $fel.each { |f| puts "  - #{f}" }
  exit 1
end
