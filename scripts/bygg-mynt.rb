#!/usr/bin/env ruby
# encoding: utf-8
# Bygger data/mynt.json: vikingatida mynt i Statens historiska museers samlingar
# (Historiska museet och Kungliga myntkabinettet), summerade per fyndplats.
#
#   ruby -Eutf-8:utf-8 scripts/bygg-mynt.rb
#
# Källa: CSV-export från https://samlingar.shm.se (metadata CC0).
# Fyndplatser med fornlämningsnummer får exakta koordinater ur
# fornlämningsregistret (K-samsök). Övriga placeras i socknens mitt, beräknad
# som medelpunkten för de registerposter i samma socken som projektet redan har.
require 'csv'
require 'json'
require 'net/http'
require 'uri'
require 'fileutils'

ROT = File.expand_path('..', __dir__)
CACHE = File.join(ROT, '.cache', 'shm')
FileUtils.mkdir_p(CACHE)
UA = { 'User-Agent' => 'runsten-karta/0.1' }

def hamta(url, params, extra = {})
  uri = URI(url)
  uri.query = URI.encode_www_form(params)
  Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 600) do |http|
    svar = http.get(uri.request_uri, UA.merge(extra))
    raise "#{uri.host} svarade #{svar.code}" unless svar.code == '200'
    svar.body.force_encoding('utf-8')
  end
end

# 1. Exporten (ca 22 MB, tar några minuter att ta fram hos museet)
csv = File.join(CACHE, 'mynt-vikingatid.csv')
unless File.size?(csv)
  File.write(csv, hamta('https://samlingar.shm.se/download/csv',
                        type: 'object', objectName: 'Mynt', productionPeriod: 'Vikingatid'))
end
rader = CSV.read(csv, headers: true, encoding: 'bom|utf-8').select { |r| r['Fyndplats, Land'] == 'Sverige' }

# Valören visar var myntet är präglat
def ursprung(valor)
  case valor.to_s.downcase
  when /penny|styca/ then :eng
  when /pfennig/ then :tys
  when /dirham|dirhem|drachm/ then :ara
  when /penning|hvid/ then :nor
  when /miliaresion|follis|solidus/ then :bys
  else :ovr
  end
end

tom = ->(v) { v.nil? || v.strip.empty? }
norm = ->(v) { v.to_s.downcase.sub(/ socken$/, '').strip }

# 2. Gruppera per fyndplats: fornlämningsnummer om det finns, annars socken
platser = Hash.new { |h, k| h[k] = { n: 0, eng: 0, tys: 0, ara: 0, nor: 0, bys: 0, ovr: 0, pl: Hash.new(0), fynd: {} } }
rader.each do |r|
  nr = r['Fyndplats, Fornlämning']
  socken = r['Fyndplats, Socken']
  next if tom.(nr) && tom.(socken)
  nyckel = tom.(nr) ? "s|#{r['Fyndplats, Landskap']}|#{socken}" : "l|#{nr.strip}"
  p = platser[nyckel]
  antal = [r['Antal'].to_i, 1].max
  p[:n] += antal
  p[ursprung(r['Valör'])] += antal
  p[:pl][r['Fyndplats, Plats']] += antal unless tom.(r['Fyndplats, Plats'])
  p[:fynd][r['Förvärvsnummer']] = true unless tom.(r['Förvärvsnummer'])
  p[:so] ||= socken
  p[:la] ||= r['Fyndplats, Landskap']
  p[:nr] = nr.strip unless tom.(nr)
end

# 3. Koordinater för fornlämningsnumren, 25 åt gången
koordfil = File.join(CACHE, 'lamningar.json')
koord = File.exist?(koordfil) ? JSON.parse(File.read(koordfil)) : {}
saknas = platser.values.map { |p| p[:nr] }.compact.uniq - koord.keys
saknas.each_slice(25) do |grupp|
  svar = JSON.parse(hamta('https://kulturarvsdata.se/ksamsok/api',
                          { method: 'search', version: '1.1', hitsPerPage: 100,
                            query: grupp.map { |n| %(itemNumber="#{n}") }.join(' OR ') },
                          'Accept' => 'application/json'))
  svar.dig('result', 'records').to_a.each do |post|
    pres = post['record']['@graph'].find { |g| g['@type'] == 'ksam:Entity' }.dig('ksam:presentation', '@value').to_s
    nr = pres[%r{<pres:idLabel>([^<]*)</pres:idLabel>}, 1]
    punkt = pres[%r{<gml:Point[^>]*><gml:coordinates[^>]*>([^<]+)<}, 1]
    koord[nr] = punkt.split(',').map { |v| v.to_f.round(4) } if nr && punkt
  end
  grupp.each { |n| koord[n] ||= nil }
  sleep 1
end
File.write(koordfil, JSON.generate(koord))

# 4. Sockenmittpunkter ur de registerdata som redan finns i projektet
summa = Hash.new { |h, k| h[k] = [0.0, 0.0, 0] }
%w[odegardar forsvar sjofart skatter vagar].each do |namn|
  fil = File.join(ROT, 'data', "#{namn}.json")
  next unless File.exist?(fil)
  JSON.parse(File.read(fil)).each do |p|
    x, y = p['x'] ? [p['x'], p['y']] : p['m']
    next unless x && p['so'] && p['la']
    s = summa["#{norm.(p['la'])}|#{norm.(p['so'])}"]
    s[0] += x; s[1] += y; s[2] += 1
  end
end

# 5. Skriv ut
ut = []
utan_plats = 0
platser.each_value do |p|
  if p[:nr] && koord[p[:nr]]
    x, y = koord[p[:nr]]
    exakt = 1
  else
    s = summa["#{norm.(p[:la])}|#{norm.(p[:so])}"]
    if s[2].zero?
      utan_plats += p[:n]
      next
    end
    x, y = (s[0] / s[2]).round(4), (s[1] / s[2]).round(4)
    exakt = 0
  end
  ut << { x: x, y: y, n: p[:n], eng: p[:eng], tys: p[:tys], ara: p[:ara], nor: p[:nor], bys: p[:bys], ovr: p[:ovr],
          pl: p[:pl].max_by { |_, c| c }&.first, so: p[:so], la: p[:la], nr: p[:nr], fynd: p[:fynd].size, exakt: exakt }.reject { |_, v| v.nil? }
end
ut.sort_by! { |p| -p[:n] }
File.write(File.join(ROT, 'data', 'mynt.json'), JSON.generate(ut))

puts "Skrev #{ut.size} fyndplatser med #{ut.sum { |p| p[:n] }} mynt till data/mynt.json"
puts "  exakt läge: #{ut.count { |p| p[:exakt] == 1 }} platser (#{ut.select { |p| p[:exakt] == 1 }.sum { |p| p[:n] }} mynt)"
puts "  sockenmitt: #{ut.count { |p| p[:exakt] == 0 }} platser (#{ut.select { |p| p[:exakt] == 0 }.sum { |p| p[:n] }} mynt)"
puts "  utan användbar plats: #{utan_plats} mynt"
puts "  ursprung: " + %i[eng tys ara nor bys ovr].map { |k| "#{k}=#{ut.sum { |p| p[k] }}" }.join(', ')
