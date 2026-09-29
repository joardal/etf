"""Runde 7: siste restkategorier (US-noterte bond-ETF-er + infra/vann/PE/konvertible).

Runde 6 viste at europeiske (.DE/.PA/.L) obligasjons-UCITS mangler i Yahoo, mens
US-noterte (HYG, EMB, VCIT, VNQ) finnes. Her testes US-noterte bond-ETF-er
samt de siste indeksløse kategoriene.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

OUT = ROOT / "output" / "probe_round7.csv"
MIN_ROWS = 700

TICKERS = [
    # US-noterte obligasjoner
    "AGG", "IAGG", "GOVT", "IEF", "SHY", "TLT", "LQD", "VCIT", "HYG", "JNK",
    "EMB", "PCY", "DBC", "GLD", "SLV",
    # Infrastruktur / vann / PE / konvertible
    "PAVE", "INFR", "GRID", "PHO", "H2O", "AWTR", "WTR", "ICLN", "TAN",
    "PSP", "GIPX", "USCI", "ICOV", "ZCON", "CONV",
    # Small/mid og land
    "IWC", "IJT", "IJSC", "EWJ", "EWU", "EWG", "EWC", "EWA", "EIDO", "EWW",
    "EWZ", "EWY", "EWT", "EWH", "IEMG", "EPP", "ILF", "ACWI", "^MID",
    # Sektorer
    "XLB", "XLE", "XLU", "XLV", "XLF", "GDX", "GDXJ", "DBA", "SIL", "REMX",
    "VNQ", "IYR", "IUSB.DE", "IGLO.L", "AGGU.L", "IHYG.L", "GHYG.L", "IGLS.L",
    "CNYB.L", "EMLC.L", "2510.T", "1348.T", "1306.T", "IPRP.L", "IASP.L",
]


def main() -> None:
    import yfinance as yf

    uniq = sorted(set(TICKERS))
    print(f"Validerer {len(uniq)} tickere ...")
    try:
        dl = yf.download(uniq, period="5y", progress=False, threads=True, auto_adjust=False)
    except Exception as e:
        print(f"Batch-nedlasting feilet: {e}")
        sys.exit(1)

    rows: list[dict] = []
    for t in uniq:
        try:
            s = dl[("Adj Close", t)].dropna() if ("Adj Close", t) in dl.columns else pd.Series(dtype=float)
        except Exception:
            s = pd.Series(dtype=float)
        ccy = navn = ""
        try:
            info = yf.Ticker(t).info
            ccy = str(info.get("currency") or "").upper()
            navn = str(info.get("longName") or info.get("shortName") or "")
            time.sleep(0.2)
        except Exception:
            pass
        rows.append({"ticker": t, "dager": len(s), "siste": str(s.index.max().date()) if len(s) else "",
                     "valuta": ccy, "navn": navn})
    res = pd.DataFrame(rows)
    res.to_csv(OUT, index=False, encoding="utf-8-sig")

    print(f"\n{'ticker':12} {'ccy':4} {'dager':>6}  navn")
    for _, r in res.sort_values("dager", ascending=False).iterrows():
        flag = "OK " if r["dager"] >= MIN_ROWS else "   "
        print(f"{flag}{r['ticker']:12} {r['valuta']:4} {r['dager']:6d}  {r['navn'][:66]}")
    print(f"\nSkrev {OUT}")


if __name__ == "__main__":
    main()
