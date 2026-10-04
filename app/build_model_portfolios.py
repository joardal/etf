"""Build the three fixed model portfolios from adjusted, EUR-quoted ETF prices.

The composition is deliberately fixed between editorial reviews. Daily runs update
the price history and simulated performance, not the selected funds or weights.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "egenberegning_test"
OUTPUT = ROOT / "app" / "model_portfolios.json"
RISK_FREE = 0.02

# Benchmark sleeves use adjusted closes of EUNL (MSCI World proxy) and
# XEON (EUR overnight proxy). XEON changed its underlying index in Nov 2023.
BENCHMARKS = {
    "low": {"EUNL": 0.25, "XEON": 0.75},
    "balanced": {"EUNL": 0.85, "XEON": 0.15},
    "high": {"EUNL": 1.0},
}

FUNDS = {
    "XEON": "Overnattrenten i euro gir en rolig base som kan rebalanseres inn i aksjer når de faller.",
    "ERNX": "Ultrakorte euroobligasjoner ga lav svingning i dataperioden, med noe mer kreditteksponering enn ren kontantrente.",
    "IE3E": "Bedriftsobligasjoner med 0–3 års løpetid begrenser renterisikoen og sprer låneporteføljen på mange utstedere.",
    "EH1Y": "Bred euro high yield gir høyere løpende rente; vekten er begrenset fordi kredittrisiko ofte øker når aksjer faller.",
    "VDIV": "Utbytteledere i utviklede markeder hadde lavere treårsvolatilitet enn det brede verdensfondet i våre data.",
    "IS3S": "Global verdifaktor gir en annen aksjesammensetning enn et markedsvektet verdensfond og har vist sterk risikojustert historikk.",
    "XD9U": "Svært rimelig amerikansk aksjeeksponering gir tilgang til selskaper som er underrepresentert i de europeiske fondene.",
    "LGGE": "Europeiske kvalitets- og utbytteaksjer uten Storbritannia er likt vektet, så enkeltgiganter styrer mindre av resultatet.",
    "SPYZ": "Europeiske finansaksjer har hatt høy historisk Sharpe i tallmaterialet; sektoren får en tydelig øvre vekt fordi den er konjunkturfølsom.",
    "FVSJ": "Asia uten Kina og Japan tilfører en annen regional vekstmotor enn USA og Europa, med moderat forvaltningskostnad.",
    "VVSM": "Halvledere har gitt sterk avkastning, men høy volatilitet; en begrenset posisjon fanger oppsiden uten at temaet overtar porteføljen.",
    "XESD": "Spanske aksjer skilte seg ut med høy treårs Sharpe i prosjektets beregninger; landrisikoen holdes til 15 prosent.",
    "FLXD": "Europeiske kvalitetsutbytter har hatt lavere treårsvolatilitet enn brede globale aksjer i det lokale datagrunnlaget.",
    "5MVL": "Verdifilter i fremvoksende markeder gir eksponering utenfor de utviklede markedene, med en avgrenset vekt på grunn av svingningene.",
}

DISPLAY_NAMES = {
    "XEON": "Xtrackers EUR Overnight Rate Swap UCITS ETF",
    "ERNX": "iShares € Ultrashort Bond UCITS ETF",
    "IE3E": "iShares € Corp Bond 0–3yr ESG SRI UCITS ETF",
    "EH1Y": "iShares Broad € High Yield Corp Bond UCITS ETF",
    "VDIV": "VanEck Morningstar Developed Markets Dividend Leaders ETF",
    "IS3S": "iShares MSCI World Value Factor UCITS ETF",
    "XD9U": "Xtrackers MSCI USA UCITS ETF",
    "LGGE": "L&G Europe ex-UK Quality Dividends Equal Weight ETF",
    "SPYZ": "SPDR MSCI Europe Financials UCITS ETF",
    "FVSJ": "Franklin FTSE Asia ex China ex Japan UCITS ETF",
    "VVSM": "VanEck Semiconductor UCITS ETF",
    "XESD": "Xtrackers Spain UCITS ETF",
    "FLXD": "Franklin European Quality Dividend UCITS ETF",
    "5MVL": "iShares MSCI Emerging Markets Value Factor UCITS ETF",
}

PORTFOLIOS = [
    {
        "id": "low",
        "name": "Lav risiko",
        "eyebrow": "STABILITET FØRST",
        "color": "#5ee0bd",
        "summary": "En rolig eurokjerne med korte renter og bred kreditt, løftet av et kontrollert innslag av aksjer. Målet er å få mer ut av kapitalen uten å gjøre hver børsdag dramatisk.",
        "emphasis": "Lav svingning, korte løpetider og begrenset aksjeandel.",
        "weights": {"XEON": 0.15, "ERNX": 0.20, "IE3E": 0.20, "EH1Y": 0.20, "VDIV": 0.15, "IS3S": 0.10},
        "benchmark_name": "25 % MSCI World · 75 % XEON",
    },
    {
        "id": "balanced",
        "name": "Moderat / høy risiko",
        "eyebrow": "BALANSERT VEKST",
        "color": "#9c9aff",
        "summary": "Verdensaksjer møter verdi, utbytte og utvalgte regionale drivere. En mindre rentekurv demper svingningene, mens aksjeandelen beholder tydelig vekstkraft.",
        "emphasis": "84 % aksjer, men fordelt på faktorer, regioner og sektorer.",
        "weights": {"IS3S": 0.22, "XD9U": 0.18, "LGGE": 0.16, "SPYZ": 0.16, "EH1Y": 0.16, "FVSJ": 0.12},
        "benchmark_name": "85 % MSCI World · 15 % XEON",
    },
    {
        "id": "high",
        "name": "Høy risiko",
        "eyebrow": "FULL AKSJEKRAFT",
        "color": "#ffbd73",
        "summary": "Hele kapitalen arbeider i aksjer. Utbytte og verdi bærer kjernen, mens halvledere, Spania og fremvoksende markeder gir større potensial — og større fallhøyde.",
        "emphasis": "100 % aksjer med bevisst tak på de mest svingende temaene.",
        "weights": {"VDIV": 0.30, "VVSM": 0.20, "XESD": 0.15, "IS3S": 0.15, "FLXD": 0.10, "5MVL": 0.10},
        "benchmark_name": "MSCI World (€-notert ETF-proxy)",
    },
]


def read_prices(tickers: set[str], mapping: pd.DataFrame) -> dict[str, pd.Series]:
    prices = {}
    for ticker in sorted(tickers):
        row = mapping.loc[ticker]
        if row["Valuta_Ticker"] != "EUR":
            raise ValueError(f"{ticker} is quoted in {row['Valuta_Ticker']}, not EUR")
        filename = row["Yahoo_Ticker"].replace(".", "_") + ".csv"
        path = DATA / "data" / "prices" / filename
        frame = pd.read_csv(path, parse_dates=["date"])
        series = frame.drop_duplicates("date", keep="last").set_index("date")["adj_close"]
        series = pd.to_numeric(series, errors="coerce").sort_index().dropna()
        if len(series) < 760 or (series <= 0).any():
            raise ValueError(f"Insufficient or invalid adjusted price history for {ticker}")
        prices[ticker] = series
    return prices


def simulate(prices: pd.DataFrame, weights: dict[str, float]) -> pd.Series:
    """Self-financing buy-and-hold sleeves, rebalanced at first available quarter day."""
    target = np.array([weights[ticker] for ticker in weights], dtype=float)
    if not np.isclose(target.sum(), 1.0):
        raise ValueError("Portfolio weights must sum to 100%")
    returns = prices[list(weights)].pct_change(fill_method=None).fillna(0.0)
    nav = np.empty(len(returns), dtype=float)
    value = 100.0
    sleeves = value * target
    nav[0] = value
    for index in range(1, len(returns)):
        previous = returns.index[index - 1]
        current = returns.index[index]
        if current.to_period("Q") != previous.to_period("Q"):
            sleeves = value * target
        sleeves *= 1.0 + returns.iloc[index].to_numpy(dtype=float)
        value = float(sleeves.sum())
        nav[index] = value
    return pd.Series(nav, index=returns.index)


def period_result(portfolio: pd.Series, benchmark: pd.Series, start: pd.Timestamp) -> dict:
    eligible = portfolio.index[portfolio.index >= start]
    if len(eligible) < 2:
        raise ValueError("Insufficient data for display period")
    first = eligible[0]
    if first - start > pd.Timedelta(days=7):
        raise ValueError(f"Price gap exceeds 7 calendar days at {start.date()}")
    p = 100 * (portfolio.iloc[-1] / portfolio.loc[first] - 1)
    b = 100 * (benchmark.iloc[-1] / benchmark.loc[first] - 1)
    shown_p, shown_b = round(float(p), 2), round(float(b), 2)
    return {"from": first.date().isoformat(), "to": portfolio.index[-1].date().isoformat(),
            "portfolio": shown_p, "benchmark": shown_b,
            "excess_pp": round(shown_p - shown_b, 2)}


def risk_summary(portfolio: pd.Series) -> dict:
    returns = portfolio.pct_change(fill_method=None).dropna()
    annual_vol = returns.std(ddof=1) * np.sqrt(252) * 100
    max_drawdown = (portfolio / portfolio.cummax() - 1).min() * 100
    sharpe = (returns.mean() * 252 - RISK_FREE) / (annual_vol / 100)
    return {"annual_volatility": round(float(annual_vol), 2),
            "max_drawdown": round(float(max_drawdown), 2), "sharpe": round(float(sharpe), 2)}


def build(refresh_prices: bool = False) -> dict:
    mapping = pd.read_csv(DATA / "isin_mapping_full.csv", dtype=str).drop_duplicates("Kortnavn").set_index("Kortnavn")
    all_tickers = set(BENCHMARKS["low"]) | set().union(*(set(spec["weights"]) for spec in PORTFOLIOS))
    if refresh_prices:
        sys.path.insert(0, str(DATA / "src"))
        from fetch_prices import fetch_price
        for ticker in sorted(all_tickers):
            row = mapping.loc[ticker]
            _, source = fetch_price(yahoo_ticker=row["Yahoo_Ticker"], max_age_days=1)
            print(f"{ticker}: {source}")
    prices = read_prices(all_tickers, mapping)
    fund_data = pd.read_csv(DATA / "output" / "leveranse_egenberegning.csv", low_memory=False)
    fund_data = fund_data.drop_duplicates("ISIN").set_index("ISIN")
    output = {"currency": "EUR", "selected_on": "2026-10-04", "portfolios": []}

    for spec in PORTFOLIOS:
        benchmark_weights = BENCHMARKS[spec["id"]]
        tickers = list(dict.fromkeys([*spec["weights"], *benchmark_weights]))
        common = pd.concat({ticker: prices[ticker] for ticker in tickers}, axis=1, sort=True).dropna()
        last = common.index[-1]
        target = last - pd.DateOffset(years=3)
        common = common.loc[common.index >= target]
        if len(common) < 700:
            raise ValueError(f"Only {len(common)} common daily observations for {spec['id']}")
        portfolio = simulate(common, spec["weights"])
        benchmark = simulate(common, benchmark_weights)
        holdings = []
        fee = 0.0
        for ticker, weight in spec["weights"].items():
            row = mapping.loc[ticker]
            details = fund_data.loc[row["ISIN"]]
            annual_fee = float(details["MS_Aarlig_Avgift_%"])
            fee += weight * annual_fee
            holdings.append({"ticker": ticker, "isin": row["ISIN"],
                             "name": DISPLAY_NAMES[ticker],
                             "weight": round(weight * 100, 1),
                             "fee": round(annual_fee, 2), "reason": FUNDS[ticker]})
        output["portfolios"].append({
            "id": spec["id"], "name": spec["name"], "eyebrow": spec["eyebrow"],
            "color": spec["color"], "summary": spec["summary"], "emphasis": spec["emphasis"],
            "benchmark": {"name": spec["benchmark_name"],
                          "components": [{"ticker": t, "weight": round(w * 100, 1)} for t, w in benchmark_weights.items()]},
            "as_of": last.date().isoformat(),
            "metrics": {"1m": period_result(portfolio, benchmark, last - pd.DateOffset(months=1)),
                        "3y": period_result(portfolio, benchmark, target)},
            "risk_3y": risk_summary(portfolio),
            "weighted_fee": round(fee, 2),
            "holdings": holdings,
            "chart": [{"date": date.date().isoformat(),
                       "portfolio": round(float(portfolio.loc[date]), 4),
                       "benchmark": round(float(benchmark.loc[date]), 4)} for date in common.index],
        })
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-prices", action="store_true", help="Refresh the selected Yahoo price caches before building")
    args = parser.parse_args()
    payload = build(args.refresh_prices)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for portfolio in payload["portfolios"]:
        metrics = portfolio["metrics"]["3y"]
        print(f"{portfolio['name']}: {metrics['from']}–{metrics['to']}, "
              f"3Y {metrics['portfolio']:+.2f}% vs {metrics['benchmark']:+.2f}%, "
              f"{len(portfolio['chart'])} common dates")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
