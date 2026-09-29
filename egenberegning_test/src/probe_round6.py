"""Runde 6: malrettet EUR-obligasjonsindekser + siste restkategorier.

Obligasjonsdelen er den nest storste blokken (~222 fond), saa det er verdt aa
teste dedikerte EUR-bond-UCITS paa LSE/Xetra/Paris (Vanguard, iShares, Deka,
BNP, Amundi) foer vi tar i bruk global USD-indeks som fallback.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

OUT = ROOT / "output" / "probe_round6.csv"
MIN_ROWS = 700

TICKERS = [
    # EUR aggregate / gov / corp (Vanguard, iShares, Deka, Amundi, BNP, AXA, Xtrackers)
    "VAGE.L", "VAGF.L", "VGLT.L", "VHYG.L", "VHYL.L", "VEVE.L",
    "IEAG.L", "IGGL.L", "IGGV.L", "IGLE.L", "IUKP.L", "IUSN.DE",
    "DEKA.DE", "SXR6.DE", "D5X9.DE", "0P22V.DE", "0P40V.DE", "0P6WM.DE",
    "X0AA.DE", "X0BA.DE", "LU1.DE", "LU2.DE", "EXV0.DE",
    "AGGH.L", "IBGL.L", "IHYC.L", "IHYG.L", "IB0X.L", "0Y55V.L",
    "IBGL.DE", "IBTE.DE", "IBTP.DE", "IBPS.DE", "IBAG.DE", "IAGF.DE",
    # Globalt aggregat (tilbakefall for EUR-diversifisert)
    "AGGU.L", "IGLO.L", "GHYG.L", "IGLS.L", "IGGL.L",
    # Asia LC, SEK, konvertible, SAfrika, vann, PE
    "AAGG.L", "IAGG.PA", "XBND.ST", "A20D.ST", "0P55V.DE", "ICOV.DE",
    "EZA.DE", "XJKA.DE", "PHOG", "PHO.DE", "ICLN.DE", "APX.DE", "GSPT.DE",
    # Emerging / Asia equity
    "EEM", "IEMG", "EPP", "AXJ", "IUSQ.DE", "IUSN.DE", "^MID", "ILF", "ACWI",
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
