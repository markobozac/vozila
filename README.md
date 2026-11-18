# Vozila i autoosiguranje u Hrvatskoj

Karta rizika u prometu po županijama (učestalost nesreća, težina posljedica, ispravnost vozila), starenje i elektrifikacija voznog parka te kretanje premija i šteta autoosiguranja.

**Live:** https://markobozac.com/vozila/

## Izvori podataka

| Izvor | Sadržaj | Datoteka |
|---|---|---|
| MUP, Bilten o sigurnosti cestovnog prometa 2024. | nesreće, stradali, prekršaji, stanovništvo, vozači i registrirana vozila po policijskim upravama | `data/raw/bilten24.txt` (iz PDF-a, `pdftotext -layout`) |
| CVH (cvh.hr) | redovni tehnički pregledi po postajama 2025., registracijski postupci 2024./2025. | `data/raw/cvhweb/*.xlsx` |
| CVH (data.gov.hr) | vozila po županijama i gorivu 2015.–2022., prosječna starost, nova i rabljena, električna i hibridna, neispravnosti po sklopovima | `data/raw/cvh/CSV/*.csv`, `data/raw/*.csv` |
| DZS | TRAN-2026-1-2 (registrirana vozila 2025.), TRAN-2026-1-3 (vozilo-kilometri 2024.) | `data/raw/tran-*.xlsx` |
| HANFA | statistika osiguranja 2018.–2025., vremenske serije A-3 do A-6 | `data/raw/statistika*.xlsx`, `data/raw/a-0*.xlsx` |
| Eurostat GISCO | NUTS 2024, razina 3 (županije) | `data/raw/hr_nuts3_01m.geojson` |

## Struktura

```
site/               statična stranica koja se objavljuje (HTML, CSS, JS, data.js)
scripts/build.py    gradi site/data.js iz data/raw
scripts/social/     kartica za društvene mreže (og-image.jpg)
data/raw/           preuzeti izvorni podaci
```

Nema build koraka za samu stranicu: `site/` je spreman za objavu.

## Osvježavanje podataka

```bash
pip install openpyxl
python3 scripts/build.py     # zapisuje site/data.js
```

Državni serveri često blokiraju datacentre, pa izvorne datoteke preuzmi s kućne ili uredske mreže. Kad MUP objavi bilten za 2025., pretvori PDF u tekst (`pdftotext -layout`) i provjeri kontrolne zbrojeve u `build.py`.

## Licenca

Kod: MIT. Podaci pripadaju navedenim izvorima i koriste se prema njihovim uvjetima ponovne uporabe otvorenih podataka.
