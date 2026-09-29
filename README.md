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
