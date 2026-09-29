"""Verifiserer alle indeks-tickere i index_mapping.csv i ett batch-kall.

Sjekker per Yahoo-ticker: eksistens, historikklengde (>=700 dager = brukbar til
3Y-relativtall) og valuta mot Valuta-kolonnen. MSCI-koder sjekkes mot MSCIs
offisielle API. Rader som bestaar oppgraderes FORSLAG -> VERIFISERT automatisk;
resten beholdes med feilnotat. MANUELL/HOPP OVER rores ikke.

Kjoring: python src/verify_indices.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

MAP = ROOT / "index_mapping.csv"
MIN_ROWS = 700


def main() -> None:
    import yfinance as yf

    df = pd.read_csv(MAP, dtype=str).fillna("")
    work = df[df["Forslag_Yahoo_Ticker"] != ""].copy()
    print(f"Til test: {len(work)} tickere")
    tickers = work["Forslag_Yahoo_Ticker"].tolist()
    try:
        dl = yf.download(tickers, period="5y", progress=False, threads=True, auto_adjust=False)
    except Exception as e:
        print(f"Batch-nedlasting feilet: {e}")
        sys.exit(1)

    ok = err = 0
    for _, r in work.iterrows():
        t = r["Forslag_Yahoo_Ticker"]
        try:
            s = dl[("Adj Close", t)].dropna() if ("Adj Close", t) in dl.columns else pd.Series(dtype=float)
            n = len(s)
        except Exception:
            n = 0
        ccy = ""
        try:
            ccy = str(yf.Ticker(t).fast_info.get("currency") or "").upper()
            time.sleep(0.3)
        except Exception:
            pass
        want = r["Valuta"].upper()
        if n >= MIN_ROWS and (not want or ccy == want):
            if r["Status"] == "FORSLAG":
                df.loc[df["Benchmark_Navn"] == r["Benchmark_Navn"], "Status"] = "VERIFISERT"
                df.loc[df["Benchmark_Navn"] == r["Benchmark_Navn"], "Kommentar"] = (
                    r["Kommentar"] + f" [verifisert {pd.Timestamp.today().date()}: {n}d, {ccy}]")
            print(f"  OK  {t:22} {n:5}d {ccy:4} ({r['Benchmark_Navn'][:45]})")
            ok += 1
        else:
            note = f" [sjekk {pd.Timestamp.today().date()}: {n}d, ccy={ccy}, ventet={want}]"
            if "[sjekk" not in r["Kommentar"]:
                df.loc[df["Benchmark_Navn"] == r["Benchmark_Navn"], "Kommentar"] = r["Kommentar"] + note
            print(f"  FEIL {t:22} {n:5}d ccy={ccy} ventet={want} ({r['Benchmark_Navn'][:45]})")
            err += 1

    # MSCI-koder
    print("\nMSCI-koder:")
    try:
        from mscidata import msci
        for _, r in df[df["MSCI_Kode"] != ""].iterrows():
            try:
                d = msci.get_levels(r["MSCI_Kode"], "2026-07-01", "2026-09-01", variant=r["MSCI_Variant"] or "NETR")
                print(f"  OK  {r['MSCI_Kode']} ({r['MSCI_Variant'] or 'NETR'}): {len(d)} rader ({r['Benchmark_Navn'][:40]})")
                ok += 1
            except Exception as e:
                print(f"  FEIL {r['MSCI_Kode']}: {str(e)[:80]}")
                err += 1
    except ImportError:
        print("  (msci-data ikke installert – hoppes over)")

    df.to_csv(MAP, index=False, encoding="utf-8-sig")
    print(f"\nFerdig: {ok} OK, {err} feil. Lagret {MAP}")


if __name__ == "__main__":
    main()
