# ETF Analytics Pro — Kvantitativ Markedsanalyse & ETF-Screener

Institusjonell analyseplattform og interaktiv screener for europeiske UCITS ETF-er. Systemet henter kurshistorikk uavhengig av Morningstar, beregner samtlige institusjonelle nøkkeltall og referanseindekser lokalt, og tilbyr avansert teknisk analyse og relativ sammenligning.

## 🚀 Hovedfunksjoner

1. **Uavhengig Kvantitativ Beregningsmotor (`egenberegning_test/`)**:
   - Beregner **Avkastning (1M–5Y), Sharpe Ratio, Standardavvik, Maximum Drawdown, Sortino, Calmar, CVaR og Ulcer Index**.
   - Relativtall: **Beta (1Y, 3Y, 5Y), Alpha, R², Tracking Error og Information Ratio** mot mappede referanseindekser.
   - 100 % bevaring av statiske Nordnet-dimensjoner (kategori, utdelingspolicy, spread, avgift).

2. **Interaktiv Webapplikasjon (`app/`)**:
   - **Chart Studio:** TradingView-drevet kursgraf (Lightweight Charts v5.2.1) som kjører 100 % lokalt og offline.
   - **Teknisk analyse:** Glidende snitt (SMA 50, SMA 200, EMA 20), Bollinger Bands (20, 2) og 52-ukers nivåer.
   - **4 Underspor:** RSI (14), Drawdown («Underwater»-graf), Rullerende 1-års Sharpe og Rullerende 30-dagers volatilitet.
   - **Månedsmatrise (Heatmap):** Fargekodet måned-for-måned og årlig avkastning (2021–2026), treffsikkerhet og sesongmønstre.
   - **Multi-ETF Relativ Sammenligning:** Flytende dokk for å sammenligne 2–5 fond normalisert til 0,0 % fra felles startdato.
   - **Tabelloversikt:** 1-års SVG-sparklines og avstand til All-Time High (% fra ATH).

## 📁 Prosjektstruktur

- `app/` — Komplett webgrensesnitt (HTML, CSS, Vanilla JS, prisserier og manifest)
- `egenberegning_test/` — Kvantitativ datamotor og beregningsskript
- `deploy_to_cloudflare.ps1` — Distribusjonsskript til Cloudflare Pages
- `enrich_etfs.py` — Hjelpeskript for beriking og datastruktur

## 🛠️ Lokal Kjøring

Start lokal webserver:
```bash
python -m http.server 8085 --directory app
```
Åpne deretter `http://localhost:8085/` i nettleseren.

## Modellporteføljer på ETF Screener & Marked

Øverst i markedsfanen vises tre faste modellporteføljer: lav, moderat/høy og høy risiko. Fond, vekter og begrunnelser ligger i `app/build_model_portfolios.py`. Endre sammensetningen der og kjør `python app/build_model_portfolios.py` for å bygge `app/model_portfolios.json` på nytt. Nettsiden leser denne JSON-filen direkte.

- Fondene er valgt fra prosjektets univers etter gjennomgang av prisdekning, Sharpe, Sortino, volatilitet, største fall, kostnader og innbyrdes korrelasjon. Historisk alfa er ikke brukt som direkte optimaliseringsmål fordi referanseindeksene har varierende datadekning. Vektene er redaksjonelt fastsatt med risikotak og oppdateres ikke automatisk når markedet endrer seg.
- Alle valgte tickere er EUR-notert. Grafene bruker daglige utbyttejusterte kurser og felles handelsdager. Portefølje og referanse rebalanseres på første tilgjengelige handelsdag i hvert kvartal.
- Referansen er en investerbar ETF-proxy med omtrent tilsvarende risiko: lav risiko 25 % EUNL / 75 % XEON, moderat/høy 85 % EUNL / 15 % XEON, høy risiko 100 % EUNL. EUNL følger MSCI World. XEON følger nå en indeks basert på €STR pluss 8,5 basispunkter, men byttet fra en annen euro overnight-indeks 30.11.2023. Referansen er netto etter ETF-kostnader og er ikke et offisielt publisert kombinasjonsindeksnivå.
- 1 måned og 3 år er **samlet** avkastning for perioden, ikke annualisert. Meravkastning er porteføljens avkastning minus referansens avkastning i prosentpoeng. Kurtasje, spread og skatt er ikke inkludert. Siden fondene og vektene er valgt etter at historikken er kjent, er grafene retrospektive simuleringer, ikke dokumentert faktisk investeringshistorikk eller en test uten informasjon fra fremtiden.
- GitHub Actions oppdaterer de utvalgte kurscachene på hverdager kl. 06:00 UTC, bygger porteføljene og kjører `app/test_model_portfolios.py`. Hvis datakilden ikke har ferske kurser, viser siden siste felles kursdato og markerer serier eldre enn én uke.
