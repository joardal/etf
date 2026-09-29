# Egenberegning-test (separat prosjekt i prosjektet)

Mål: finne ut om vi kan regne ut tilsvarende lister som `etf_morningstar_komplett.csv`
fra frie kurser (Stooq/Yahoo) + referanseindekser (MSCI/Stooq/Yahoo), uten å scrape
Morningstar et par ganger i uka.

**Status: full kjøring ferdig for alle 2222 ETF-er. 71 % (1578 av 2238 rader) har
relativtall. Avvik mot Morningstar: 12M-avkastning 0,72 pp, Beta 0,12,
stdavvik 1,73 pp (median absolutt). Se «Resultat» lenger ned.**

## Regler

* RØR IKKE noe utenfor denne mappa. Ikke `../app/`, ikke `../etf_morningstar_komplett.csv`,
  ikke `../enrich_etfs.py`. Alt skrives til `output/` her inne.
* Dette er et test-prosjekt. Tallene herfra skal IKKE brukes som hovedtall ennå.
  Først når alle tall er på plass, tar vi stilling til bytte.

## Oppsett

```powershell
cd C:\Markedsdata\egenberegning_test
pip install -r requirements.txt
copy .env.example .env   # valgfritt, kun hvis du har nøkler
```

## Steg 1 – Fyll inn tickere (obligatorisk, 10 min)

`isin_mapping.csv` inneholder 10 test-ETF-er med ISIN, men tomme ticker-felt.
ISIN alene er ikke nok – Yahoo/Stooq vil ha børsspesifikk ticker
(f.eks. `EUNL.DE` på Xetra, `SWDA.L` / `swda.uk` på London).

Finn riktig ticker per rad:

1. Søk på ISIN på https://www.justetf.com (viser alle børslister + tickere).
2. Fyll inn `Stooq_Ticker` (små bokstaver, f.eks. `eunl.de`, `swda.uk`)
   og/eller `Yahoo_Ticker` (f.eks. `EUNL.DE`, `SWDA.L`).
3. Kjør forslagsskriptet for hjelp (krever ingen nøkkel):

```powershell
python src\lookup_ticker.py
```

Dette søker via Yahoo Search og skriver forslag til konsoll – du må fortsatt
verifisere mot justETF før du limer inn.

## Steg 2 – Sjekk indeks-mapping (5 min)

`index_mapping.csv` er FORSLAG kategori -> indeks, ikke fasit.
Verifiser minst radene for kategoriene dine 10 ETF-er bruker.
MSCI-koder (f.eks. `990100` = MSCI World) brukes av `fetch_indices.py` hvis
pakken `msci-data` er installert, ellers brukes Stooq/Yahoo-ticker.

## Steg 3 – Kjør testen

```powershell
python src\run_test.py
```

Resultat: `output\sammenligning.csv` med egne tall side om side med
Morningstar-tall for samme ISIN, pluss avvikskolonner.
Kjører også uten utfylte tickere – da testes kun indeks-nedlasting.

## Full kjøring (hele universet)

```powershell
python src\run_all.py          # 2222 rader, gjenopptar fra checkpoint
python src\build_leverance.py  # sluttfil: output\leveranse_egenberegning.csv
```

`run_all.py` sjekker hver 50. rad til `output\egen_full_checkpoint.csv`, så et
avbrudd (eller en timeout) koster ingenting – kjør bare om igjen. Rader som
allerede er ferdige hoppes over, og siden prisene ligger i `data\prices\`
gjenberegnes de uten nettverkskall.

Hvis du bytter proxy-indeks for en kategori, må de radene tvinges til ny
beregning (checkpoint hopper ellers over dem):

```powershell
python src\invalidate_manual.py "EUR Government Bond,EUR Corporate Bond"
python src\run_all.py
```

## Valg av proxy-indeks: målt, ikke gjettet

Obligasjons-UCITS på europeiske børser (.DE/.PA/.L) finnes stort sett ikke i
Yahoo – 48 av 85 første kandidater returnerte 0 dager. Flere tickere med
rimelig navn viste seg også å være helt andre fond (f.eks. `IUSB.DE` =
*Timber & Forestry*, `JPHG.L` = *Nikkei 400*, `WOOD` = *Timber*,
`1348.T` = *TOPIX-aksjer*). Derfor:

1. **Navnevalidering** – `probe_round4..8.py` henter `longName` for hver kandidat,
   slik at vi velger på dokumentert fondnavn, ikke på antakelse.
2. **Måling** – `eval_bench_candidates.py` regner Beta mot hver kandidat for
   faktiske fond i kategorien og rangerer på avvik mot Morningstars egen Beta_3Y.
   Resultat: `output\proxy_kvalitet.csv`.
3. **Korrigering** – `apply_manual_mapping.py` (`REFINEMENT`) bytter der målingen
   er entydig bedre. Eksempel: EUR-statoblig gikk fra `IBGL.MI` (15–30 år, avvik
   0,544) til `AGGH.MI` (avvik 0,077, n=47). Total Beta-avvik gikk 0,15 -> 0,12.

Der ingen tilsvarende indeks finnes (SAfrika, Afrika, frontier, konvertible,
SEK, sukuk, sukurs-og-lignende nisjer), brukes en **omfattende** proxy
(f.eks. MSCI EM for SAfrika) og det er eksplisitt kommentert i
`index_mapping.csv` – ikke stilt opp som et fasit-treff.

## Leveransefil

`build_leverance.py` skriver `output\leveranse_egenberegning.csv` (2238 rader,
102 kolonner) med tydelig skille mellom tre ulike typer tall:

| Prefiks | Betydning |
|---|---|
| `Statisk_` | **Uendret** fra Nordnet-listen: kategori, utdelingspolicy, årlig avgift, spread, MS-rating, risk, hållbarhet. Verifisert 100 % like mot kilden (2270/2270 rader) |
| `MS_` | Morningstars egne tall, kun som referanse |
| `Egen_` | Våre beregninger (avkastning, risiko, Beta/Alpha/R²/TE/IR/Capture) |
| `Diff_` | Avviket vårt minus Morningstar, pr rad – gjør feil sporbare |

`Egen_Beregn_Status` sier pr rad hvorfor relativtall mangler. Kolonnenavn på
Egen-siden er uendret fra `output\egen_full.csv`, så det er ingen oversettelse
mellom filene.

## Hva trenger jeg av API-nøkler?

| Kilde | Nøkkel? | Hva gjør du? |
|---|---|---|
| Stooq kurser/indekser | NEI – det finnes ingen Stooq API-nøkkel. Skript får 404 uten nettleser-User-Agent og JS-verifiseringsside med User-Agent. Koden sender nettleser-UA og faller kontrollert tilbake til Yahoo | Ingen – Stooq brukes manuelt i nettleseren ved behov |
| Yahoo (fallback) | NEI. Men: rate-limit (`YFRateLimitError`) ved bulk. Ingen fiks med nøkkel – bare vent / reduser tempo | Gi beskjed ved 429-feil |
| MSCI indeksnivåer | NEI. `pip install msci-data` holder (bruker MSCIs offentlige chart-API). Uten pakken brukes Stooq/Yahoo-proxy i stedet | `pip install msci-data` hvis du vil ha offisielle NETR-tall |
| justETF (indeksnavn per ISIN) | NEI for manuell oppslag i nettleser. Automatisk scraping (`pip install justetf-scraping`) er valgfritt og ikke påkrevd i denne testen | Si fra hvis du vil automatisere dette steget |
| EODHD (betalt samlet alternativ) | JA, kun hvis du vil teste betalt spor: https://eodhd.com, legg i `.env` som `EODHD_API_KEY=...` | Ikke nødvendig for å kjøre denne testen |

Ingen nøkkel er påkrevd for å kjøre testen første gang (Yahoo + MSCI-proxy går uten).

## Metodikk (status 29.09.2026 – verifisert mot Morningstar på hele universet)

* Alle serier normaliseres til én basisvaluta (`base_currency` i config.json,
  default EUR) via Yahoo-valutapar (`EURUSD=X` osv.). ETF-ens valuta står i
  `Valuta_Ticker`, indeksens i `Valuta`-kolonnen. Uten dette blir Beta ~0,4
  i stedet for ~1,0.
* Absolutte tall (avkastning, stdavvik, Sharpe, drawdown, Sortino/Calmar/Ulcer/
  CVaR) regnes på daglige kurser, Rf fast 2 % p.a., `Adj Close`.
* Relative tall (Beta/Alpha/R²/TE/IR/Capture) regnes på MÅNEDSDATA, samme
  praksis som Morningstar. Daglige kurser fra ulike tidssoner (Xetra stenger
  17:30, USA 22:00) gir falsk dekorrelasjon på dagsnivå.
* Beta/Alpha/R²/TE/IR/Capture er mot *kategori-proxy-indeks*, ikke fondets
  faktiske benchmark. `index_mapping.csv` er kuratert og kommentert per kategori.
* Datoer normaliseres til børsens EGEN kalenderdato (aldri via UTC – det
  flytter Xetra-datoer én dag tilbake og ødelegger matchingen).
* **Feilprint-/splittsjekk** (`clean_bad_ticks`): enkelt-dagshopp > 40 % regnes
  ikke som markedsbevegelse. Serien undersøkes videre: tilbakegang innen 5 dager
  = feilprint (raden droppes); rundt splittforhold (±3 % av 2/3/4/5/10/20/50/
  100/200) = historikken reskaleres; turbulent nabolag (annet >15 %-hopp innen
  ±5 dager) = alt beholdes (ekte krasj skal ikke glattes bort); ellers
  kuttes historikken og hendelsen flagges. Alt logges til `output\bad_ticks.csv`.
  Dette fjernet bl.a. en 17 000 %-hopp i PR1J.DE som ellers ga 103 % årlig
  volatilitet.

## Resultat (hele universet, 29.09.2026)

Dekning: 2222/2222 ETF-er har priser, **1578 av 2238 rader (71 %) har relativtall**.
Uten relativtall: 347 hoppet over (kategori uten relevant indeks), 312 for lite
data (< 12 måneder), 0 prisfeil.

Avvik mot Morningstar (median absolutt avvik):

| Nøkkeltall | n | Avvik |
|---|---|---|
| Avkastning 12M | 1672 | 0,72 pp |
| Avkastning 3Y | 1229 | 0,70 pp |
| Sharpe 1Y | 1657 | 0,25 |
| Sharpe 3Y | 1221 | 0,21 |
| Stdavvik 1Y | 1657 | 1,73 pp |
| Beta (3Y) | 934 | 0,12 |
| Beta 1Y | 1219 | 0,17 |
| Beta 5Y | 694 | 0,11 |
| Tracking Error 3Y | 934 | 1,36 pp |
| Information Ratio 3Y | 933 | 0,32 |

## Lokal lagring + inkrementell oppdatering

Første kjøring laster ned full historikk til `data/`:

```
data/prices/EUNL_DE.csv   (date, adj_close)
data/fx/EURUSD_X.csv      (date, adj_close)
```

Senere kjøringer henter kun radene etter siste cachedato (`start = siste + 1 dag`).
Er cachen fersk (innenfor `max_age_days`, default 4) gjøres det ingen
nettverkskall i det hele tatt – verifisert: andre kjøring på rad brukte
0 kall på 0,8 sek. Ved nettfeil med eksisterende cache brukes cachen med advarsel.

## Filer

```
egenberegning_test/
  README.md            <- du er her
  requirements.txt
  .env.example
  config.json
  isin_mapping.csv          <- 10 test-ETF-er, fyll inn tickere
  isin_mapping_full.csv     <- hele universet (2222 rader, generert)
  index_mapping.csv         <- 165 Benchmark_Navn -> indeks/MSCI-kode, kommentert
  src/
    lookup_ticker.py        <- forslag til tickere (Yahoo Search, ingen nøkkel)
    build_mapping.py        <- 3-stegs mapping av hele universet (med resume)
    verify_indices.py       <- batch-verifisering av indeks-tickere
    probe_indices.py        <- runde 1-3: kandidater per MANUELL-kategori
    probe_round4..8.py      <- navnevalidering (longName) + markedsvarianter
    eval_bench_candidates.py<- måler proxy-kvalitet mot Morningstar per kategori
    apply_manual_mapping.py <- skriver proxy-mapping (M + målt REFINEMENT)
    invalidate_manual.py    <- tvinger ny beregning for gitte kategorier
    cache.py                <- lokalt cache-lag: full nedlasting én gang, deretter kun delta
    fetch_prices.py         <- Yahoo primær (Stooq valgfri fallback, krever nettleser)
    fetch_indices.py        <- MSCI (valgfritt) + Stooq/Yahoo
    fx.py                   <- FX-normalisering til basisvaluta (Yahoo-par, cached)
    compute_metrics.py      <- absolutte tall daglig + relative tall månedlig
    run_test.py             <- 10-ETF-testløp + sammenligning mot Morningstar
    run_all.py              <- hele universet, checkpoint/resume
    build_leverance.py      <- sluttfil med statiske + beregnede felter
  data/                <- lokal lagring (prices/ + fx/ + msci/), lages automatisk
  output/
    egen_full.csv            <- egne tall, alle rader
    sammenligning_full.csv   <- egne tall side om side med Morningstar + diff
    leveranse_egenberegning.csv <- ENDELIG fil: Statisk_ / MS_ / Egen_ / Diff_
    egen_full_checkpoint.csv <- resume-punkt for full kjøring
    bad_ticks.csv            <- logg over feilprint-/splitt-hendelser
    proxy_kvalitet.csv       <- målt proxy-kvalitet per kategori
    probe_*.csv              <- rå probe-resultater (navn, lengde, valuta)
```
