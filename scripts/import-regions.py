"""Importazione opzionale degli originali Commons; la build resta offline."""
import hashlib
import json
import pathlib
import time
import urllib.parse
import urllib.request
from urllib.error import HTTPError

ENTRIES = [
 ('it-65','Abruzzo','Abruzzo','Flag_of_Abruzzo.svg'),
 ('it-77','Basilicata','Basilicata','Flag_of_Basilicata.svg'),
 ('it-78','Calabria','Calabria','Flag_of_Calabria.svg'),
 ('it-72','Campania','Campania','Flag_of_Campania.svg'),
 ('it-45','Emilia-Romagna','Emilia-Romagna','Flag_of_Emilia-Romagna_(de_facto).svg'),
 ('it-36','Friuli-Venezia Giulia','Friuli-Venezia Giulia','Flag_of_Friuli-Venezia_Giulia.svg'),
 ('it-62','Lazio','Lazio','Flag_of_Lazio.svg'),
 ('it-42','Liguria','Liguria','Flag_of_Liguria.svg'),
 ('it-25','Lombardia','Lombardy','Flag_of_Lombardy.svg'),
 ('it-57','Marche','Marche','Flag_of_Marche.svg'),
 ('it-67','Molise','Molise','Flag_of_Molise.svg'),
 ('it-21','Piemonte','Piedmont','Flag_of_Piedmont.svg'),
 ('it-75','Puglia','Apulia','Flag_of_Apulia.svg'),
 ('it-88','Sardegna','Sardinia','Flag_of_Sardinia,_Italy.svg'),
 ('it-82','Sicilia','Sicily','Flag_of_Sicily.svg'),
 ('it-52','Toscana','Tuscany','Flag_of_Tuscany.svg'),
 ('it-32','Trentino-Alto Adige','Trentino-South Tyrol','Flag_of_Trentino-South_Tyrol.svg'),
 ('it-55','Umbria','Umbria','Flag_of_Umbria_(de_jure).svg'),
 ('it-23',"Valle d'Aosta",'Aosta Valley',"Flag_of_Valle_d'Aosta.svg"),
 ('it-34','Veneto','Veneto','Flag_of_Veneto.svg'),
]
ROOT = pathlib.Path('assets/regions')
ROOT.joinpath('source').mkdir(parents=True, exist_ok=True)

def get(url):
    for attempt in range(7):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'FlagDuel/1.0 regional asset importer'})
            return urllib.request.urlopen(req, timeout=60).read()
        except HTTPError as error:
            if error.code not in (429, 503) or attempt == 6:
                raise
            delay = min(45, max(10, int(error.headers.get('Retry-After', '10'))))
            print(f'HTTP {error.code}: attesa {delay}s', flush=True)
            time.sleep(delay)

manifest_path = ROOT / 'manifest.json'
if manifest_path.exists():
    manifest = json.loads(manifest_path.read_text())
else:
    params = {'action': 'query', 'titles': '|'.join('File:'+e[3] for e in ENTRIES), 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|sha1|timestamp', 'format': 'json', 'formatversion': '2'}
    data = json.loads(get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)))
    pages = {p['title'].replace(' ', '_'): p for p in data['query']['pages']}
    manifest = []
    for code, name, en, filename in ENTRIES:
        info = pages['File:'+filename]['imageinfo'][0]
        manifest.append({'code': code, 'name': name, 'en': en, 'file': filename, 'source': info['descriptionurl'], 'download': info['url'], 'timestamp': info['timestamp'], 'sha1': info['sha1'], 'metadata': info['extmetadata']})
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')

for item in manifest:
    dest = ROOT / 'source' / (item['code']+'.svg')
    if not dest.exists():
        dest.write_bytes(get(item['download']))
        time.sleep(3)
    if hashlib.sha1(dest.read_bytes()).hexdigest() != item['sha1']:
        raise ValueError('Hash Commons diverso: '+str(dest))
    print(item['code'], dest.stat().st_size, item['metadata'].get('LicenseShortName', {}).get('value'), flush=True)
