"""Runde 4: flat validering av kandidat-tickere med fysisk fondnavn.

Hovedformaalet er NAVNEVALIDERING: forrige runder avdekte at flere tikere med
rimelig navn egentlig er helt andre fond (f.eks. IUSB.DE = Timber & Forestry).
Denne runderen henter lengde + valuta + longName for alt i gangen, slik at
mappingen velges paa dokumentert grunn.

Kjoerer: python src/probe_round4.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

OUT = ROOT / "output" / "probe_round4.csv"
MIN_ROWS = 700

TICKERS = [
    # EUR / globalt aggregat (Xetra + LSE)
    "AGGH.DE", "IAGG.DE", "IBAG.DE", "EUNA.L", "IAGF.L", "IAGE.L", "AGGH.L", "IAGG.L",
    "IBGL.DE", "IBTE.DE", "IBTP.DE", "IBPS.DE", "EXV1.DE", "0P1U.DE",
    # EUR corporate / subordinated / HY
    "IBCE.DE", "IBKS.DE", "EXI5.DE", "IBSS.DE", "HYGD.DE", "0Y55V.DE", "HYGE.DE", "ICOR.L",
    # Globalt HY / EM
    "IHYG.L", "UHYG.L", "GHYG.L", "0Y55V.L", "EMB", "EMLC.L", "EBMB.L", "JPMB.L",
    # Statsobligasjoner
    "GOVT.L", "IUST.L", "AGGU.L", "IGLO.L", "IGLS.L", "IGLB.L", "SHY.T", "0P1I.DE",
    # Inflasjonslinket
    "IBXL.DE", "IUSI.L", "IUSI.DE", "IEI.DE", "LTPZ.L",
    # Asia / SEK / JPY / Kina
    "AAGG.L", "A20D.ST", "XBND.ST", "XAGG.ST", "A1EQ.ST", "135A.T", "1326.T", "2510.T",
    "IBJP.L", "CNYB.L", "CNHB.L",
    # Convertible
    "ICOV.L", "ICOV.DE", "0P55V.L", "0P55V.DE", "ZCON.DE", "CNV.L",
    # Afrika / SAfrika / Frontier / vann / infra / PE
    "EWW", "EWZ", "ILF", "EZA.DE", "XJKA.DE", "AFRE", "PRFR", "XMIN.DE", "XFRN.DE",
    "PHOG", "PHO.L", "WTR.DE", "ICLN.DE", "GRID", "PRIF", "GSPT.DE", "XINW.DE",
    "APX.DE", "KPE.DE", "APX.L", "^SP400",
    # Small/mid-cap og utviklingsland
    "^MID", "^SP400", "IJSE.DE", "IUSN.DE", "1305.T", "1306.T", "^TOPX", "ESCT.DE",
    "XSML.L", "IUSQ.DE", "WOODS", "^GSPC", "^STOXX", "^OMXSPI", "^STOXX50E",
    "IEMG", "EPP", "ACWI", "IGLO.L",
]


def main() -> None:
    import yfinance as yf

    print(f"Validerer {len(TICKERS)} tickere ...")
    try:
        dl = yf.download(TICKERS, period="5y", progress=False, threads=True, auto_adjust=False)
    except Exception as e:
        print(f"Batch-nedlasting feilet: {e}")
        sys.exit(1)

    rows: list[dict] = []
    for t in TICKERS:
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
        print(f"{flag}{r['ticker']:12} {r['valuta']:4} {r['dager']:6d}  {r['navn'][:70]}")
    print(f"\nSkrev {OUT}")


if __name__ == "__main__":
    main()
