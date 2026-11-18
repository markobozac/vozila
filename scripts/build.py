"""Build site/data.js for markobozac.com/vozila from the raw files in data/raw.

Sources (see README):
- MUP, Bilten o sigurnosti cestovnog prometa 2024 (PDF -> bilten24.txt via `pdftotext -layout`)
- CVH: registered vehicles by county and fuel 2015-2022, average age, new/used, EV/hybrid (data.gov.hr)
- CVH: results of regular technical inspections by station 2025, registration procedures 2024/2025 (cvh.hr)
- DZS: TRAN-2026-1-2 (registered vehicles 2025), TRAN-2026-1-3 (vehicle-km 2024)
- HANFA: insurance statistics yearbooks 2018-2025 and time series A-3..A-6
- GISCO NUTS 2024 level 3 (county boundaries)

Run: python3 scripts/build.py   (writes site/data.js)
"""
import csv, glob, io, json, math, os, re
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw')
OUT = os.path.join(ROOT, 'site', 'data.js')
HRK = 7.5345  # fixed conversion rate

# ---------------------------------------------------------------- areas
# 20 police administrations (PU). PU zagrebačka covers Grad Zagreb + Zagrebačka županija.
AREAS = [
    # id, label, NUTS ids, CVH county codes, keyword used in MUP tables
    ('zg', 'Grad Zagreb i Zagrebačka', ['HR050', 'HR065'], ['21', '01'], 'zagreb'),
    ('st', 'Splitsko-dalmatinska', ['HR035'], ['17'], 'split'),
    ('ri', 'Primorsko-goranska', ['HR031'], ['08'], 'primor'),
    ('os', 'Osječko-baranjska', ['HR025'], ['14'], 'osje'),
    ('pu', 'Istarska', ['HR036'], ['18'], 'istar'),
    ('du', 'Dubrovačko-neretvanska', ['HR037'], ['19'], 'dubrov'),
    ('ka', 'Karlovačka', ['HR027'], ['04'], 'karlov'),
    ('sk', 'Sisačko-moslavačka', ['HR028'], ['03'], 'sisa'),
    ('si', 'Šibensko-kninska', ['HR034'], ['15'], 'šiben'),
    ('vu', 'Vukovarsko-srijemska', ['HR026'], ['16'], 'vukov'),
    ('zd', 'Zadarska', ['HR033'], ['13'], 'zadar'),
    ('bj', 'Bjelovarsko-bilogorska', ['HR021'], ['07'], 'bjelov'),
    ('sb', 'Brodsko-posavska', ['HR024'], ['12'], 'brod'),
    ('kc', 'Koprivničko-križevačka', ['HR063'], ['06'], 'kopriv'),
    ('kr', 'Krapinsko-zagorska', ['HR064'], ['02'], 'krapin'),
    ('gs', 'Ličko-senjska', ['HR032'], ['09'], 'lič'),
    ('ck', 'Međimurska', ['HR061'], ['20'], 'međi'),
    ('pz', 'Požeško-slavonska', ['HR023'], ['11'], 'požeš'),
    ('vz', 'Varaždinska', ['HR062'], ['05'], 'varaž'),
    ('vt', 'Virovitičko-podravska', ['HR022'], ['10'], 'virov'),
]
KEY = {a[0]: a for a in AREAS}


def area_of(name):
    n = name.lower().strip()
    for a in AREAS:
        if n.startswith(a[4]):
            return a[0]
    return None


def num(s):
    s = s.strip().replace('.', '').replace(' ', '').replace(',', '.')
    if s in ('', '-'):
        return 0
    return float(s) if '.' in s else int(s)


NUM = r'\d{1,3}(?:\.\d{3})*(?:,\d+)?'
NUM_SP = r'\d{1,3}(?: \d{3})*'

# ---------------------------------------------------------------- MUP bulletin
B = open(os.path.join(RAW, 'bilten24.txt'), encoding='utf-8').read().split('\n')


def block(start_pat, n=30, after=0):
    """Lines following the line that matches start_pat (the after-th match)."""
    hits = [i for i, l in enumerate(B) if re.search(start_pat, l)]
    i = hits[after]
    return B[i + 1:i + 1 + n]


def rows_by_area(lines, numre=None):
    numre = numre or NUM
    out = {}
    for l in lines:
        m = re.match(r'\s*([A-Za-zČĆŽŠĐčćžšđ.\- ]+?)\s+([+-]?\d.*)$', l)
        if not m:
            continue
        a = area_of(m.group(1))
        if not a or a in out:
            continue
        vals = re.findall(r'[+-]?' + numre, m.group(2))
        out[a] = vals
    return out


pu = {a[0]: {'id': a[0], 'label': a[1]} for a in AREAS}

# population, drivers, vehicles 2024
r = rows_by_area(block(r'Stanovništvo3, vozači i registrirana vozila u 2024', 30))
for a, v in r.items():
    pu[a]['pop'] = num(v[0]); pu[a]['drivers'] = num(v[2]); pu[a]['veh'] = num(v[4])

# accidents by PU 2023/2024: total, with killed, with injured
r = rows_by_area(block(r'^\s+Prometne nesreće po policijskim upravama\s*$', 30))
for a, v in r.items():
    pu[a]['acc23'] = num(v[0]); pu[a]['acc24'] = num(v[1])
# killed / injured accident columns can be blank (Virovitica 2024: 0 killed) -> parse from fixed slots
for l in block(r'^\s+Prometne nesreće po policijskim upravama\s*$', 30):
    m = re.match(r'\s*([A-Za-zČĆŽŠĐčćžšđ.\- ]+?)\s+([+-]?\d.*)$', l)
    if not m or not area_of(m.group(1)):
        continue
    a = area_of(m.group(1))
    v = re.findall(r'[+-]?' + NUM, m.group(2))
    # total23 total24 trend k23 k24 trend? i23 i24 trend ; trend may be missing when base is 0
    v = [x for x in v]
    inj24 = num(v[-2]); inj23 = num(v[-3])
    pu[a]['injAcc24'] = inj24; pu[a]['injAcc23'] = inj23
    pu[a]['killAcc24'] = num(v[4]) if len(v) >= 9 else 0

# killed, seriously, slightly injured persons 2023/2024
for l in block(r'^\s+Nastradale osobe po policijskim upravama\s*$', 30):
    m = re.match(r'\s*([A-Za-zČĆŽŠĐčćžšđ.\- ]+?)\s+([+-]?\d.*)$', l)
    if not m or not area_of(m.group(1)):
        continue
    a = area_of(m.group(1))
    v = re.findall(r'[+-]?' + NUM, m.group(2))
    if len(v) == 9:
        k23, k24 = num(v[0]), num(v[1]); s = v[3:]
    else:  # Virovitica: 7 killed in 2023, none in 2024, no trend
        k23, k24 = num(v[0]), 0; s = v[1:]
    pu[a].update(killed23=k23, killed24=k24, serious23=num(s[0]), serious24=num(s[1]),
                 slight23=num(s[3]), slight24=num(s[4]))

# offences detected in traffic control 2023/2024
r = rows_by_area(block(r'Prekršaji utvrđeni u nadzoru prometa prema policijskim upravama', 30))
for a, v in r.items():
    pu[a]['off23'] = num(v[0]); pu[a]['off24'] = num(v[1])

# registered motor vehicles 2015-2024
r = rows_by_area(block(r'^\s+Registrirana motorna vozila po policijskim upravama\s*$', 26), NUM_SP)
for a, v in r.items():
    pu[a]['vehSeries'] = [num(x) for x in v[:10]]

# vehicles by type 2024 (UKUPNO, mopedi, motocikli, osobna, autobusi, kamioni, tegljači, specijalna, traktori)
r = rows_by_area(block(r'prema vrsti vozila i po policijskim upravama u 2024', 50))
for a, v in r.items():
    pu[a]['cars'] = num(v[3]); pu[a]['trucks'] = num(v[5]) + num(v[6]); pu[a]['moto'] = num(v[1]) + num(v[2])
    pu[a]['tractors'] = num(v[8])

# ---------------------------------------------------------------- CVH technical inspection 2025 by station
STATION_PU = {
    'zg': 'Zagreb|Sesvete|Dugo Selo|Ivanić-Grad|Jastrebarsko|Samobor|Velika Gorica|Vrbovec|Zaprešić|Sv.Ivan Zelina|Sveta Nedelja',
    'st': 'Split|Solin|Kaštel Sućurac|Trogir|Sinj|Imotski|Vrgorac|Makarska|Supetar|Dugi Rat|Vrbanj',
    'ri': 'Rijeka|Kastav|Crikvenica|Delnice|Krk|Cres|Mali Lošinj|Banjol',
    'os': 'Osijek|Josipovac|Bilje|Bistrinci|Beli Manastir|Đakovo|Našice|Donji Miholjac',
    'pu': 'Pula|Valtura|Rovinj|Poreč|Umag|Buzet|Pazin|Labin|Bibići',
    'du': 'Dubrovnik|Čibača|Metković|Ploče|Korčula|Blato|Potomje',
    'ka': 'Karlovac|Duga Resa|Ogulin|Slunj|Vojnić',
    'sk': 'Sisak|Petrinja|Glina|Kutina|Novska|Popovača|Sunja|Hrvatska Dubica',
    'si': 'Šibenik|Vodice|Knin|Drniš',
    'vu': 'Vukovar|Vinkovci|Županja|Ilok|Drenovci',
    'zd': 'Zadar|Benkovac|Biograd n/m|Posedarje|Pag',
    'bj': 'Bjelovar|Daruvar|Garešnica|Čazma|Grubišno Polje',
    'sb': 'Slavonski Brod|Gornja Vrba|Nova Gradiška|Oriovac',
    'kc': 'Koprivnica|Križevci|Đurđevac',
    'kr': 'Krapina|Zabok|Zlatar|Oroslavje|Marija Bistrica',
    'gs': 'Gospić|Otočac|Senj|Korenica',
    'ck': 'Čakovec|Prelog|Mursko Središće|Donja Dubrava',
    'pz': 'Požega|Pakrac',
    'vz': 'Varaždin|Ivanec|Ludbreg|Novi Marof|Marčan',
    'vt': 'Virovitica|Slatina|Orahovica|Pitomača',
}
TOWN = {t: a for a, ts in STATION_PU.items() for t in ts.split('|')}


def xl_rows(path, sheet=0):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[sheet] if isinstance(sheet, int) else wb[sheet]
    return [list(r) for r in ws.iter_rows(values_only=True)]


stations = []
for r in xl_rows(os.path.join(RAW, 'cvhweb', 'pregledbrojartpustppovrstamavozilau2025godini.xlsx')):
    if r[0] and str(r[0]).startswith('H-'):
        town = str(r[2]).strip()
        a = TOWN.get(town)
        if not a:
            raise SystemExit(f'unmapped inspection station town: {town}')
        stations.append({'code': r[0], 'name': r[1], 'town': town, 'pu': a, 'n': r[3], 'fail': r[4], 'cars': r[13]})
    elif r[1] == 'UKUPNO':
        tp_total = {'n': r[3], 'fail': r[4]}
assert sum(s['n'] for s in stations) == tp_total['n'], 'station total mismatch'
for a in pu:
    ss = [s for s in stations if s['pu'] == a]
    pu[a]['tpN'] = sum(s['n'] for s in ss); pu[a]['tpFail'] = sum(s['fail'] for s in ss); pu[a]['tpStations'] = len(ss)

# registration procedures 2024 vs 2025 by station
reg_tot = None
for r in xl_rows(os.path.join(RAW, 'cvhweb', 'registracijski-postupci-2024-2025_12-za-web.xlsx')):
    if r[0] and str(r[0]).startswith('H-'):
        a = TOWN[str(r[2]).strip()]
        p = pu[a]
        p['firstReg24'] = p.get('firstReg24', 0) + r[3]; p['firstReg25'] = p.get('firstReg25', 0) + r[4]
        p['renew25'] = p.get('renew25', 0) + r[7]; p['dereg25'] = p.get('dereg25', 0) + r[10]
    elif r[0] is None and r[1] is None and isinstance(r[3], (int, float)) and reg_tot is None:
        reg_tot = {'firstReg24': r[3], 'firstReg25': r[4], 'renew24': r[6], 'renew25': r[7], 'dereg24': r[9], 'dereg25': r[10]}

# ---------------------------------------------------------------- CVH registered vehicles by county and fuel (M1)
fuel = {}  # year -> area -> dict
for f in sorted(glob.glob(os.path.join(RAW, 'cvh', 'CSV', '*zupanije_vrstevozila_vrstegoriva.csv'))):
    year = int(re.search(r'(20\d\d)', os.path.basename(f)).group(1))
    txt = open(f, encoding='cp1250').read()
    rd = csv.reader(io.StringIO(txt), delimiter=';')
    hdr = next(rd)
    for row in rd:
        if len(row) < 5 or row[2] != 'M1':
            continue
        d = dict(zip(hdr, row))
        code = d['Zupanija_Oznaka'].zfill(2)
        a = next(x[0] for x in AREAS if code in x[3])
        g = lambda k: int(d.get(k) or 0)
        benz = g('Benzin') + g('Benzin-LPG') + g('Benzin_LPG') + g('Benzin-NG') + g('Benzin_NG')
        dies = g('Diesel') + g('Diesel-LPG') + g('Diesel_LPG') + g('Diesel-NG') + g('Diesel_CNG')
        ev, hyb, phev = g('Elektricna_energija'), g('Hibridno_vozilo'), g('Hibridno_vozilo_s_vanjskim_punjenjem')
        t = fuel.setdefault(year, {}).setdefault(a, dict(benz=0, dies=0, ev=0, hyb=0, phev=0))
        for k, v in (('benz', benz), ('dies', dies), ('ev', ev), ('hyb', hyb), ('phev', phev)):
            t[k] += v
FY = sorted(fuel)
for a in pu:
    s = []
    for y in FY:
        t = fuel[y][a]; tot = sum(t.values())
        s.append({'y': y, 'tot': tot, **t})
    pu[a]['fuel'] = s

# ---------------------------------------------------------------- derived area metrics
nat = {k: sum(pu[a].get(k, 0) for a in pu) for k in
       ['pop', 'drivers', 'veh', 'cars', 'acc23', 'acc24', 'injAcc23', 'injAcc24', 'killed23', 'killed24', 'serious23',
        'serious24', 'slight24', 'off24', 'tpN', 'tpFail', 'firstReg24', 'firstReg25', 'renew25', 'dereg25']}
nat['vehSeries'] = [sum(pu[a]['vehSeries'][i] for a in pu) for i in range(10)]
nat['fuel'] = [{k: sum(pu[a]['fuel'][i][k] for a in pu) for k in ['tot', 'benz', 'dies', 'ev', 'hyb', 'phev']} | {'y': y}
               for i, y in enumerate(FY)]

# sanity checks against totals printed in the bulletin
assert nat['acc24'] == 35729 and nat['acc23'] == 34604, (nat['acc24'], nat['acc23'])
assert nat['killed24'] == 239 and nat['killed23'] == 274, (nat['killed24'], nat['killed23'])
assert nat['serious24'] == 3238 and nat['serious23'] == 3102, (nat['serious24'], nat['serious23'])
assert nat['veh'] == 2600773 and nat['vehSeries'][-1] == 2600773 and nat['vehSeries'][0] == 1929726
assert nat['pop'] == 3859686 and nat['drivers'] == 2340080
assert nat['off24'] == 786367 - 5067, nat['off24']  # minus mobile unit HQ
assert nat['cars'] == 1987156


def rates(p):
    v = p['veh']
    return {
        'accPer1k': 1000 * p['acc24'] / v,
        'injPer1k': 1000 * p['injAcc24'] / v,
        'ksiPer10k': 10000 * (p['killed23'] + p['killed24'] + p['serious23'] + p['serious24']) / 2 / v,
        'killedPer100k': 100000 * (p['killed23'] + p['killed24']) / 2 / v,
        'failPct': 100 * p['tpFail'] / p['tpN'],
        'vehPer1k': 1000 * v / p['pop'],
        'growth': 100 * (p['vehSeries'][-1] / p['vehSeries'][0] - 1),
        'evPct': 100 * (p['fuel'][-1]['ev'] + p['fuel'][-1]['phev']) / p['fuel'][-1]['tot'],
        'altPct': 100 * (p['fuel'][-1]['ev'] + p['fuel'][-1]['hyb'] + p['fuel'][-1]['phev']) / p['fuel'][-1]['tot'],
        'diesPct': 100 * p['fuel'][-1]['dies'] / p['fuel'][-1]['tot'],
        'offPer1k': 1000 * p['off24'] / p['drivers'],
        'accChg': 100 * (p['acc24'] / p['acc23'] - 1),
        'regChg': 100 * (p['firstReg25'] / p['firstReg24'] - 1),
    }


NAT = rates(nat)
for a, p in pu.items():
    p['r'] = rates(p)
    # risk index: 100 = Croatian average; equal weights of frequency, severity and vehicle condition
    parts = {
        'freq': 100 * p['r']['accPer1k'] / NAT['accPer1k'],
        'sev': 100 * p['r']['ksiPer10k'] / NAT['ksiPer10k'],
        'cond': 100 * p['r']['failPct'] / NAT['failPct'],
    }
    p['idx'] = parts
    p['r']['risk'] = (parts['freq'] + parts['sev'] + parts['cond']) / 3
NAT['risk'] = 100.0

# ---------------------------------------------------------------- national vehicle series
age = []
with open(os.path.join(RAW, 'prosjecna_starost_po_vrstivozila_2007do2022.csv'), encoding='utf-8') as f:
    for d in csv.DictReader(f, delimiter=';'):
        age.append({'y': int(d['Godina']), 'all': float(d['UKUPNO'].replace(',', '.')), 'm1': float(d['M1'].replace(',', '.'))})

newused = []
with open(os.path.join(RAW, 'broj_novih_i_rabljenih_m1_vozila_2007do2022_prva_reg_u_rh.csv'), encoding='utf-8') as f:
    for d in csv.DictReader(f, delimiter=';'):
        newused.append({'y': int(d['Godina']), 'new': num(d['Novo vozilo']), 'used': num(d['Rabljeno vozilo'])})

evser = {}
with open(os.path.join(RAW, 'cvh', 'CSV', 's12__broj_M1kategorija_vozila_s_elektricnim_i_hibridnim_pogonom_2007do2022.csv'),
          encoding='utf-8') as f:
    rd = list(csv.reader(f, delimiter=';'))
years = [int(y) for y in rd[0][1:]]
for row in rd[1:]:
    evser[row[0]] = [num(x) for x in row[1:]]
ev_nat = [{'y': y, 'ev': evser['ELEKTRICNI_pogon'][i], 'hyb': evser['HIBRIDNI_pogon_ukupno'][i] - evser['HIBRIDNI pogon_s_vanjskim_punjenjem'][i],
           'phev': evser['HIBRIDNI pogon_s_vanjskim_punjenjem'][i]} for i, y in enumerate(years)]

# M1 age structure 2022 (regular inspections)
ages22 = None
with open(os.path.join(RAW, 'cvh', 'CSV', 's01__pregled_starosti_vozila_prema_vrstama_vozila_2022.csv'), encoding='cp1250') as f:
    for d in csv.reader(f, delimiter=';'):
        if d[0] == 'M1':
            ages22 = {'total': num(d[1]), 'p10': float(d[3].replace(',', '.')), 'p6_9': float(d[5].replace(',', '.')),
                      'p2_5': float(d[7].replace(',', '.')), 'p1': float(d[9].replace(',', '.')), 'avg': float(d[10].replace(',', '.'))}

# defects by vehicle assembly 2022
defects = []
with open(os.path.join(RAW, 'cvh', 'CSV', 's03__pregled_broja_neispravnosti_po_sklopovima_2022.csv'), encoding='cp1250') as f:
    for d in csv.reader(f, delimiter=';'):
        if d[0] in ('2', '3', '5', '6', '7'):
            defects.append({'name': d[1].capitalize(), 'pct': float(d[3].replace(',', '.'))})

# DZS: vehicle-km 2024 by fuel and age for passenger cars
vkm = None
for r in xl_rows(os.path.join(RAW, 'tran-2026-1-3_tablica-hr.xlsx')):
    if r and r[0] and str(r[0]).startswith('M1'):
        vkm = {'total': r[1], 'byAge': {'<2': r[2], '2-4': r[3], '5-9': r[4], '10-19': r[5], '20+': r[6]}, 'byFuel': {}}
        continue
    if vkm is not None and r and r[0] and len(vkm['byFuel']) < 6:
        vkm['byFuel'][str(r[0]).strip()] = r[1]
cars25 = None
for r in xl_rows(os.path.join(RAW, 'tran-2026-1-2_tablice-hr.xlsx')):
    if r and r[0] == 'Osobna vozila':
        cars25 = {'stock': r[1], 'first': r[2], 'firstLegal': r[6]}

# ---------------------------------------------------------------- HANFA
def hanfa_series(fname, sheet, codes=(3, 10)):
    rows = xl_rows(os.path.join(RAW, fname), sheet)
    hdr = next(r for r in rows if r[0] and str(r[0]).startswith('Šifra'))
    cols = [(i, int(re.search(r'31\.12\.(\d{4})', str(h)).group(1))) for i, h in enumerate(hdr) if h and re.search(r'31\.12\.(\d{4})', str(h))]
    out = {}
    for r in rows:
        if r[0] in codes:
            out[r[0]] = {y: r[i] for i, y in cols if r[i] is not None}
    return out


pol = hanfa_series('a-03_broj_osiguranja.xlsx', 0)
clm = hanfa_series('a-05_broj_steta.xlsx', 0)
paid = hanfa_series('a-06_likvidirane_stete.xlsx', 'A-6.1 likv_stete_O_od2008_EUR')
prem_old = hanfa_series('a-04_premija.xlsx', 'A-4.1 ZBP_O_od2008 EUR')
prem_new = hanfa_series('a-04_premija.xlsx', 'A-4.1 NPremija_O_od2023')
ins = []
for y in range(2008, 2026):
    row = {'y': y}
    for code, k in ((10, 'ao'), (3, 'kasko')):
        prem = prem_new.get(code, {}).get(y) if y >= 2023 else prem_old.get(code, {}).get(y)
        row[k] = {'pol': pol[code].get(y), 'claims': clm[code].get(y), 'paid': round(paid[code][y] / 1000, 3),
                  'prem': round(prem / 1000, 3) if prem else None}
    ins.append(row)

# motor liability by premium group (passenger cars) by year
ao_cars = []
for y, fname in ((2018, 'statistika-osiguranja-2018.xlsx'), (2019, 'statistika-osiguranja-2019.xlsx'),
                 (2020, 'statistikaosiguranjaweb_2020.xlsx'), (2021, 'statistika-osiguranja_2021_ispravak.xlsx'),
                 (2022, 'statistika_osiguranja_2022.xlsx')):
    wb = openpyxl.load_workbook(os.path.join(RAW, fname), read_only=True, data_only=True)
    names = wb.sheetnames
    s1 = wb[next(n for n in names if n.lower().startswith('sp211'))]
    s2 = wb[next(n for n in names if n.lower().startswith('sp212'))]
    r1 = next(list(r) for r in s1.iter_rows(values_only=True) if r[1] and str(r[1]).strip() == 'Osobni automobili')
    r2 = next(list(r) for r in s2.iter_rows(values_only=True) if r[1] and str(r[1]).strip() == 'Osobni automobili')
    cur = 1 if y >= 2023 else HRK
    ao_cars.append({'y': y, 'pol': r1[2], 'prem': r1[3] / cur, 'claims': r2[2], 'paid': r2[7] / cur, 'basis': 'zaračunata'})
wb = openpyxl.load_workbook(os.path.join(RAW, 'statistika_osiguranja_2025.xlsx'), read_only=True, data_only=True)
r6 = next(list(r) for r in wb['SP_001_06'].iter_rows(values_only=True) if r[1] == 'Osobni automobili')
ao_cars.append({'y': 2025, 'pol': r6[2], 'prem': r6[3], 'claims': r6[4], 'paid': r6[9], 'basis': 'naplaćena'})
ao_groups25 = []
for r in wb['SP_001_06'].iter_rows(values_only=True):
    if r[0] is not None and str(r[0]).strip().isdigit() and isinstance(r[1], str):
        ao_groups25.append({'g': r[1].strip(), 'pol': r[2], 'prem': r[3], 'claims': r[4], 'paid': r[9]})
k25 = next(list(r) for r in wb['SP_001_01'].iter_rows(values_only=True) if r[0] == '03.01')
kasko25 = {'pol': k25[2], 'prem': k25[3], 'claims': k25[4], 'paid': k25[5]}
ch = {}
for r in wb['SP_001_02'].iter_rows(values_only=True):
    if r[0] == '04':
        vals = list(r)
        ch = {'none': vals[4], 'internal': vals[7], 'agencies': vals[10], 'brokers': vals[13], 'banks': vals[16],
              'other': vals[19], 'total': vals[22], 'digital': sum(vals[i] or 0 for i in (2, 5, 8, 11, 14, 17))}
ao_channels25 = ch

# ---------------------------------------------------------------- geometry
geo = json.load(open(os.path.join(RAW, 'hr_nuts3_01m.geojson'), encoding='utf-8'))
LON0, LAT0 = 16.4, 44.5
KX = math.cos(math.radians(LAT0))


def proj(lon, lat):
    return ((lon - 13.4) * KX, (46.6 - lat))


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1e-12
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


allpts = [proj(*c) for f in geo['features'] for poly in (f['geometry']['coordinates'] if f['geometry']['type'] == 'MultiPolygon' else [f['geometry']['coordinates']]) for ring in poly for c in ring]
minx = min(p[0] for p in allpts); maxx = max(p[0] for p in allpts)
miny = min(p[1] for p in allpts); maxy = max(p[1] for p in allpts)
W = 1000
S = W / (maxx - minx)
H = round((maxy - miny) * S)
shapes = []
for f in geo['features']:
    nid = f['properties']['NUTS_ID']
    a = next(x[0] for x in AREAS if nid in x[2])
    polys = f['geometry']['coordinates'] if f['geometry']['type'] == 'MultiPolygon' else [f['geometry']['coordinates']]
    d = []
    for poly in polys:
        for ring in poly:
            pts = [((x - minx) * S, (y - miny) * S) for x, y in (proj(*c) for c in ring)]
            area = abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2
            if area < 1.5:  # drop islets smaller than ~1.5 px²
                continue
            # closed ring: simplify the two halves separately (RDP needs distinct end points)
            h = len(pts) // 2
            pts = rdp(pts[:h + 1], 0.45)[:-1] + rdp(pts[h:], 0.45)
            if len(pts) < 4:
                continue
            d.append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + 'Z')
    shapes.append({'a': a, 'nuts': nid, 'name': f['properties']['NUTS_NAME'], 'd': ''.join(d)})
    # label point: centroid of the largest ring (mainland), used for value labels
    best = None
    for poly in polys:
        ring = [((x - minx) * S, (y - miny) * S) for x, y in (proj(*c) for c in poly[0])]
        A = sum(ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1] for i in range(len(ring))) / 2
        if best is None or abs(A) > abs(best[0]):
            cx = sum((ring[i - 1][0] + ring[i][0]) * (ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]) for i in range(len(ring))) / (6 * A)
            cy = sum((ring[i - 1][1] + ring[i][1]) * (ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]) for i in range(len(ring))) / (6 * A)
            best = (A, cx, cy)
    shapes[-1]['lx'] = round(best[1], 1); shapes[-1]['ly'] = round(best[2], 1)

# ---------------------------------------------------------------- write
r2 = lambda x: round(x, 2) if isinstance(x, float) else x
def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return r2(o)

D = {
    'meta': {'built': '2026-11-18', 'vehYears': list(range(2015, 2025)), 'fuelYears': FY},
    'areas': [clean(pu[a[0]]) for a in AREAS],
    'nat': clean(nat | {'r': NAT}),
    'tp': clean(tp_total), 'reg': reg_tot,
    'stations': [{k: s[k] for k in ('code', 'town', 'pu', 'n', 'fail')} for s in stations],
    'age': age, 'newused': newused, 'evNat': ev_nat, 'ages22': ages22, 'defects': defects, 'vkm': vkm, 'cars25': cars25,
    'ins': ins, 'aoCars': clean(ao_cars), 'aoGroups25': clean(ao_groups25), 'kasko25': clean(kasko25), 'aoChannels25': clean(ao_channels25),
    'geo': {'w': W, 'h': H, 'shapes': shapes},
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('window.D=' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
