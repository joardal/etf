"""Runde 5: malrettet søk etter EUR-/SEK-/JPY-obligasjonsindekser + siste restkategorier.

Runde 4 viste at de fleste Xetra-bond-ETF-er (.DE) ikke finnes i Yahoo. Her
testes Paris-listinger (.PA), svenske (.ST) og alternative utsteder-navn, samt
de siste kategoriene uten proxy (vann, South Africa, konvertible, SEK, PE).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

OUT = ROOT / "output" / "probe_round5.csv"
MIN_ROWS = 700

TICKERS = [
    # EUR globalt aggregat / statsoblig (Paris + Xetra + LSE)
    "IAGG.PA", "AGGH.PA", "IAGF.PA", "EUNA.PA", "IAGG-DE.DE", "IBGL.PA",
    "IAGG.DE", "AGGH.DE", "IAGF.DE", "IBAG.DE", "0P1U.DE", "0P22V.DE",
    # EUR corporate
    "IBCE.PA", "XSUM.PA", "IBKS.PA", "EXI6.DE", "IBKC.PA",
    # EUR / global inflation
    "IBXL.PA", "IUSI.PA", "IEI.DE", "IUSN.PA", "0P55I.DE",
    # EUR subordinated / flex
    "IBSS.PA", "IBST.DE", "IFLE.DE", "IBFL.DE",
    # SEK / JPY / GBP
    "XBND.ST", "A20D.ST", "A1EQ.ST", "XAGG.ST", "A2EQ.ST",
    "2510.T", "2640.T", "1348.T", "135A.T",
    "IGLS.L", "IGLB.L",
    # SAfrika / Afrika / Frontier / vann / PE / konvertible / Asia LC
    "EZA.DE", "EZA.L", "XJKA.DE", "AFRE", "PRFR", "XMIN.DE",
    "PHOG", "PHO.DE", "PHO.L", "ICLN.DE", "WTR.L",
    "APX.DE", "APX.L", "KPE.DE", "0P55V.DE", "0P55V.L", "CNV.L", "ZCON.DE",
    "AAGG.L", "AAGG.DE", "IABL.L",
    # Siste sjekk: global/verden equity proxies
    "IUSQ.DE", "IUSN.DE", "^MID", "IEMG", "EPP", "ILF", "ACWI", "^GSPC", "^STOXX",
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

    print(f"\n{'ticker':14} {'ccy':4} {'dager':>6}  navn")
    for _, r in res.sort_values("dager", ascending=False).iterrows():
        flag = "OK " if r["dager"] >= MIN_ROWS else "   "
        print(f"{flag}{r['ticker']:14} {r['valuta']:4} {r['dager']:6d}  {r['navn'][:66]}")
    print(f"\nSkrev {OUT}")


if __name__ == "__main__":
    main()
