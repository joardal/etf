"""Foreslår Yahoo-tickere for rader uten ticker. Skriver kun forslag – verifiser mot justETF."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def main() -> None:
    mp = ROOT / "isin_mapping.csv"
    df = pd.read_csv(mp, dtype=str).fillna("")
    try:
        import yfinance as yf
    except ImportError:
        print("Mangler yfinance. Kjør: pip install -r requirements.txt")
        sys.exit(1)
    for _, r in df.iterrows():
        if r["Yahoo_Ticker"].strip():
            continue
        query = f"{r['Kortnavn']} {r['Navn_Morningstar']}".strip()
        print(f"\n== {r['ISIN']} | {query}")
        try:
            res = yf.Search(query, max_results=5)
            quotes = getattr(res, "quotes", []) or []
            if not quotes:
                print("   Ingen treff – søk manuelt på justetf.com")
                continue
            for q in quotes[:5]:
                print(f"   Forslag: {q.get('symbol')} | {q.get('shortname') or q.get('longname')} | {q.get('exchange')}")
        except Exception as e:
            print(f"   Søket feilet ({e}) – søk manuelt på justetf.com")


if __name__ == "__main__":
    main()
