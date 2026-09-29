"""Runde 8: siste EUR-/SEK-/konvertible-sok.

Obligasjon er den nest storste blokken (~222 fond) og europeiske bond-UCITS er
sjelden i Yahoo. Her testes brett over markeder (.L/.PA/.MI/.DE) slik at vi
enten finner ekte EUR-indekser eller kan dokumentere at vi bruker omfattende
proxy (IGLO.L global statsoblig, AGGU.L globalt aggregat).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

OUT = ROOT / "output" / "probe_round8.csv"
MIN_ROWS = 700

TICKERS = [
    # EUR globalt aggregat (alle markeder)
    "AGGH.L", "AGGH.PA", "AGGH.MI", "AGGH.DE", "IAGG.L", "IAGG.PA", "IAGG.MI",
    "IAGF.L", "IAGF.PA", "IAGF.DE", "EUNA.L", "EUNA.PA", "EUNA.MI", "IBAG.DE",
    # EUR statsoblig
    "IBGL.L", "IBGL.DE", "IBGL.PA", "IBGL.MI", "IBTE.DE", "IBTE.L", "IBTP.DE",
    "IBTP.L", "0P1U.DE", "0P1U.L", "0P1U.MI", "0P2Y.DE", "0P22V.DE", "0P40V.DE",
    "0P5H.DE", "0P6WM.DE", "IB10.DE", "IB25.DE", "IEAG.DE", "IEAG.L",
    # EUR corporate / subordinated / flex
    "IBCE.DE", "IBCE.L", "IBCE.MI", "IBKS.DE", "IBSS.DE", "IBSS.L", "IBST.DE",
    "IFLE.DE", "IBFL.DE", "IBKC.DE", "XSUM.PA",
    # Inflasjonslinket
    "IBXL.DE", "IBXL.L", "IBXL.MI", "IEI.DE", "IEI.L", "IUSI.L", "IUSI.DE", "IUSI.MI",
    # SEK
    "XBND.ST", "A20D.ST", "A1EQ.ST", "A2EQ.ST", "A3EQ.ST", "A5EQ.ST", "XAGG.ST", "0P1A.ST",
    # Konvertible
    "0P55V.DE", "0P55V.L", "0P55V.MI", "ZCON.DE", "CNV.L", "ICOV.DE", "ICOV.L", "JCP.L",
    # Asia LC / Kina
    "AAGG.L", "AAGG.DE", "AAGG.MI", "IABL.L", "CNHB.L", "CNYB.L", "EMLC.L",
    # Bekreftede (kontekst)
    "IGLO.L", "AGGU.L", "IHYG.L", "GHYG.L", "IGLS.L", "EMB", "PCY", "GOVT", "LQD",
    "HYG", "AGG", "IAGG", "IEF", "TLT", "SHY", "2510.T", "EXI5.DE", "IUSQ.DE",
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
