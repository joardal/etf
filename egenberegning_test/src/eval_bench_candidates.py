"""Måler hvilken proxy-indeks som treffer Morningstar best, per kategori.

For hver valgt Benchmark_Navn gruppe beregnes Beta/Alpha mot alle foreslaatte
kandidater (med korrekt FX-normalisering til EUR), og avviket mot Morningstars
egen Beta_3Y rapporteres. Da velger vi proxy paa MAALING, ikke paa gjetting.

Kjoerer: python src/eval_bench_candidates.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import cache  # noqa: E402
import fx  # noqa: E402
from compute_metrics import metrics_relative  # noqa: E402
from fetch_prices import fetch_price  # noqa: E402

with open(ROOT / "config.json", encoding="utf-8") as f:
    CFG = json.load(f)
BASE_CCY = CFG.get("base_currency", "EUR")
MAX_AGE = int(CFG.get("max_age_days", 4))
PERIOD = CFG.get("yahoo_period", "5y")

# Benchmark_Navn -> [(ticker, valuta), ...]
GRUPPE = {
    "EUR Government Bond": [("AGGH.MI", "EUR"), ("IBGL.MI", "EUR"), ("IGLO.L", "USD")],
    "EUR Bond - Long Term": [("AGGH.MI", "EUR"), ("IBGL.MI", "EUR")],
    "EUR Corporate Bond": [("AGGH.MI", "EUR"), ("LQD", "USD"), ("IHYG.L", "EUR")],
    "EUR Diversified Bond": [("AGGH.MI", "EUR"), ("AGGU.L", "USD"), ("IBGL.MI", "EUR")],
    "Other Bond": [("AGGH.MI", "EUR"), ("AGGU.L", "USD"), ("IGLO.L", "USD")],
    "Other Equity": [("IUSQ.DE", "EUR"), ("ACWI", "USD"), ("^STOXX", "EUR")],
    "Islamic Global Equity": [("IUSQ.DE", "EUR"), ("ACWI", "USD")],
    "Sector Equity Alternative Energy": [("ICLN", "USD"), ("TAN", "USD"), ("IUSQ.DE", "EUR")],
    "Sector Equity Ecology": [("ICLN", "USD"), ("TAN", "USD"), ("IUSQ.DE", "EUR")],
    "Sector Equity Natural Resources": [("XLB", "USD"), ("XLE", "USD"), ("REMX", "USD")],
    "Sector Equity Infrastructure": [("PAVE", "USD"), ("GRID", "USD"), ("XLU", "USD")],
    "Sector Equity Water": [("PHO", "USD"), ("ICLN", "USD")],
    "Sector Equity Precious Metals": [("GDX", "USD"), ("GDXJ", "USD"), ("GLD", "USD")],
    "Property - Indirect Global": [("VNQ", "USD"), ("IUSQ.DE", "EUR"), ("EXI5.DE", "EUR")],
    "Asia-Pacific ex-Japan Equity": [("EPP", "USD"), ("IEMG", "USD"), ("IUSQ.DE", "EUR")],
    "Asia-Pacific Equity": [("EPP", "USD"), ("IEMG", "USD")],
    "Pacific ex-Japan Equity": [("EPP", "USD"), ("IEMG", "USD")],
    "Global Small/Mid-Cap Equity": [("IUSN.DE", "EUR"), ("^MID", "USD"), ("IJT", "USD")],
    "Latin America Equity": [("ILF", "USD"), ("^MXX", "MXN")],
    "Nordic Equity": [("^OMXSPI", "SEK"), ("IEMG", "USD")],
    "USD Government Bond": [("GOVT", "USD"), ("AGGU.L", "USD"), ("IGLO.L", "USD")],
    "Global Diversified Bond": [("AGGU.L", "USD"), ("AGGH.MI", "EUR")],
    "Global Diversified Bond - EUR Hedged": [("AGGH.MI", "EUR"), ("AGGU.L", "USD")],
    "Global Government Bond - EUR Hedged": [("AGGH.MI", "EUR"), ("IGLO.L", "USD")],
    "Global Corporate Bond - EUR Hedged": [("AGGH.MI", "EUR"), ("AGGU.L", "USD")],
    "Global High Yield Bond": [("GHYG.L", "GBP"), ("IHYG.L", "EUR"), ("HYG", "USD")],
    "Global High Yield Bond - EUR Hedged": [("IHYG.L", "EUR"), ("GHYG.L", "GBP")],
    "Global Emerging Markets Bond": [("EMB", "USD"), ("PCY", "USD"), ("EMLC.L", "USD")],
    "Global Emerging Markets Bond - EUR Hedged": [("EMB", "USD"), ("EMLC.L", "USD")],
    "Japan Small/Mid-Cap Equity": [("1306.T", "JPY"), ("1348.T", "JPY"), ("EPP", "USD")],
    "Europe Small-Cap Equity": [("IJT", "USD"), ("IUSN.DE", "EUR"), ("^STOXX", "EUR")],
}

MAKS_PER_GRUPPE = 60


def main() -> None:
    sammen = pd.read_csv(ROOT / "output" / "sammenligning_full.csv",
                         encoding="utf-8-sig", low_memory=False).drop_duplicates("ISIN", keep="last")

    rader: list[dict] = []
    for bm, cands in GRUPPE.items():
        sub = sammen[(sammen["Benchmark_Navn"] == bm) & sammen["Egen_Beta"].notna()].head(MAKS_PER_GRUPPE)
        if sub.empty:
            print(f"{bm}: ingen rader")
            continue
        # Hent benchmark-serier
        serier: dict[str, pd.DataFrame] = {}
        for t, ccy in cands:
            try:
                px, _ = fetch_price("", t, ("yahoo", "stooq"), PERIOD, MAX_AGE)
                px, _ = fx.normalize(px, ccy, BASE_CCY, PERIOD, MAX_AGE)
                serier[t] = px
            except Exception as e:
                print(f"  {bm} / {t}: kunne ikke hentes ({str(e)[:50]})")
        for t in cands:
            t = t[0]
            if t not in serier:
                continue
            diffs, r2s, nok = [], [], 0
            for _, r in sub.iterrows():
                kilde = str(r["Kilde"])
                ticker = kilde.split(":")[-1].replace(" (fra cache ved feil)", "").strip()
                try:
                    px, _ = fetch_price("", ticker, ("yahoo", "stooq"), PERIOD, MAX_AGE)
                    px, _ = fx.normalize(px, str(r.get("Egen_Valuta", BASE_CCY)) or BASE_CCY,
                                         BASE_CCY, PERIOD, MAX_AGE)
                    m = metrics_relative(px, serier[t])
                except Exception:
                    continue
                if m.get("Egen_Beta") is None or pd.isna(r.get("Beta_3Y")):
                    continue
                nok += 1
                diffs.append(abs(m["Egen_Beta"] - float(r["Beta_3Y"])))
                if m.get("Egen_R2") is not None:
                    r2s.append(m["Egen_R2"])
            if not diffs:
                continue
            s = pd.Series(diffs)
            r2 = pd.Series(r2s).median() if r2s else float("nan")
            rader.append({"kategori": bm, "indeks": t, "n": nok,
                          "median_abs_diff": round(float(s.median()), 3),
                          "p75_abs_diff": round(float(s.quantile(0.75)), 3),
                          "median_r2": round(float(r2), 3)})
        print(f"{bm}: ferdig ({len(sub)} fond vurdert)")

    res = pd.DataFrame(rader).sort_values(["kategori", "median_abs_diff"])
    res.to_csv(ROOT / "output" / "proxy_kvalitet.csv", index=False, encoding="utf-8-sig")
    print(f"\nBeste indeks per kategori (median absolutt Beta-avvik mot Morningstar):")
    for bm, grp in res.groupby("kategori", sort=False):
        b = grp.iloc[0]
        rest = "  |  ".join(f"{r['indeks']}={r['median_abs_diff']}" for _, r in grp.iterrows())
        print(f"  {bm[:44]:46} {b['indeks']:10} {b['median_abs_diff']:.3f} (n={int(b['n'])}, R2={b['median_r2']})   {rest}")
    print(f"\nSkrev {ROOT / 'output' / 'proxy_kvalitet.csv'}")


if __name__ == "__main__":
    main()
