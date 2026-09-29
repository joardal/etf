"""Prober mange indeks-kandidater per MANUELL-kategori i ett batch-kall.

Skriver output/probe_resultater.csv med: ticker, antall dager, siste dato, valuta.
Brukes til aa velge proxy-indeks manuellt for de 80 MANUELL-kategoriene.
Kjoerer: python src/probe_indices.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

OUT = ROOT / "output" / "probe_resultater.csv"
MIN_ROWS = 700

# Kandidatliste: Benchmark_Navn -> [ticker, ...] (rekkefolgen er preferanse, men
# scriptet rangerer selv etter lengde slik at lengste historikk vinner).
CANDIDATES: dict[str, list[str]] = {
    # ---- Nordiske / Europa ----
    "Sweden Equity": ["^OMXSPI", "^OMXS30"],
    "Sweden Small/Mid-Cap Equity": ["^OMXSPI"],
    "Denmark Equity": ["^OMXC20", "^OMXC25"],
    "Nordic Equity": ["^OMXNPI", "^OMXSPI"],
    "Europe Small-Cap Equity": ["^SML", "^ESCT"],
    "Europe Mid-Cap Equity": ["^MID", "^ES50"],
    "Eurozone Mid-Cap Equity": ["^STOXX50E", "^EXMI"],
    "Eurozone Small-Cap Equity": ["^ESCT", "^STOXX50E"],
    "UK Small-Cap Equity": ["^FTMC", "^FTAS"],
    # ---- Asia / Emerging ----
    "Japan Small/Mid-Cap Equity": ["^JPX400", "^TOPX"],
    "Indonesia Equity": ["^JKSE"],
    "Vietnam Equity": ["^VNINDEX", "^HSI"],
    "South Africa Equity": ["^JTOPI"],
    "Africa Equity": ["AFRE.DE", "XMAF.DE"],
    "Africa & Middle East Equity": ["AFRE.DE", "XMEF.DE"],
    "Global Frontier Markets Equity": ["XMIN.DE", "FMIN.L"],
    "Latin America Equity": ["EIML", "^MXX"],
    "Emerging Europe ex-Russia Equity": ["IEMG", "XMIN.DE"],
    "Asia ex-Japan Equity": ["AXJ", "^HSI"],
    "Asia-Pacific ex-Japan Equity": ["AXJ", "EPP"],
    "Asia-Pacific Equity": ["AXJ", "EPP"],
    "Pacific ex-Japan Equity": ["EPP", "AXJ"],
    # ---- Global ----
    "Global Small/Mid-Cap Equity": ["WOOD", "^MID"],
    "Islamic Global Equity": ["ACWI", "IWDA.DE"],
    "Other Equity": ["ACWI", "IWDA.DE"],
    # ---- Sektor ----
    "Sector Equity Natural Resources": ["^SP500-10", "GSPTSE.DE"],
    "Sector Equity Alternative Energy": ["ICLN.DE", "ICLN"],
    "Sector Equity Ecology": ["ICLN.DE", "ICLN"],
    "Sector Equity Water": ["PHOG.DE", "ICLN.DE"],
    "Sector Equity Agriculture": ["DBA", "^DJA"],
    "Sector Equity Infrastructure": ["PAVI.DE", "GSPTSE.DE"],
    "Sector Equity Listed Private Equity": ["APX.DE", "KPE.DE"],
    "Sector Equity Precious Metals": ["GDX", "WGLD.DE"],
    # ---- Eiendom ----
    "Property - Indirect Global": ["XDW.L", "VNQ"],
    "Property - Indirect North America": ["VNQ", "XDW.L"],
    "Property - Indirect Europe": ["IPRP.L", "IPRP.DE"],
    "Property - Indirect Asia": ["IASP.L", "XDW.L"],
    "Property - Indirect Other": ["XDW.L", "VNQ"],
    # ---- Ravarer ----
    "Commodities - Energy": ["^BCOM", "XLE"],
    # ---- Obligasjoner ----
    "Other Bond": ["AGGH.L", "IAGG.DE"],
    "EUR Government Bond": ["IBGL.L", "IUSB.DE"],
    "USD Government Bond": ["USIG.L", "AGGU.L"],
    "Global Government Bond": ["IGLO.L", "IBGL.L"],
    "EUR Corporate Bond": ["IBCE.DE", "XCOR.L"],
    "USD Corporate Bond": ["ICOR.L", "IUSN.L"],
    "Global Corporate Bond": ["ICOR.L", "IGLO.L"],
    "Global Emerging Markets Bond": ["EMB", "EBMB.L"],
    "Global Emerging Markets Corporate Bond": ["EMB", "EBMB.L"],
    "EUR High Yield Bond": ["HYGH.L", "0P1U.L"],
    "USD High Yield Bond": ["HYG", "0P1A.L"],
    "Global High Yield Bond": ["JPHG.L", "HYGG.L"],
    "Global Diversified Bond": ["IAGG.DE", "AGGH.L"],
    "EUR Diversified Bond": ["IAGG.DE", "AGGH.L"],
    "USD Diversified Bond": ["IAGG.DE", "AGGU.L"],
    "EUR Bond - Long Term": ["IBGL.L", "IUSB.DE"],
    "EUR Flexible Bond": ["IAGG.DE", "AGGH.L"],
    "USD Flexible Bond": ["IAGG.DE", "AGGU.L"],
    "EUR Inflation-Linked Bond": ["IBXL.DE", "IUSI.L"],
    "USD Inflation-Linked Bond": ["IUSI.L", "IBXL.DE"],
    "Global Inflation-Linked Bond": ["IAGG.DE", "IBXL.DE"],
    "EUR Subordinated Bond": ["IBSS.DE", "IBCE.DE"],
    "GBP Government Bond": ["IGLS.L", "IGLB.L"],
    "GBP Corporate Bond": ["IGLB.L", "IGLS.L"],
    "SEK Diversified Bond": ["A20D.ST", "XBND.ST"],
    "JPY Bond": ["135A.T", "^JP10Y"],
    "RMB Bond - Onshore": ["CNYB.L", "IBCH.L"],
    "Asia Bond - Local Currency": ["AAGG.L", "IAGG.DE"],
    "Convertible Bond - Global": ["ICOV.L", "0P55V.L"],
    # Hedged-varianter bruker samme ubesiktede indeks (dokumenteres i Kommentar)
    "Global High Yield Bond - EUR Hedged": ["HYGG.L", "JPHG.L"],
    "Global Government Bond - EUR Hedged": ["IGLO.L", "IBGL.L"],
    "Global Corporate Bond - EUR Hedged": ["ICOR.L", "IGLO.L"],
    "Global Corporate Bond - USD Hedged": ["ICOR.L", "IGLO.L"],
    "Global Government Bond - USD Hedged": ["IGLO.L", "IBGL.L"],
    "Global Diversified Bond - EUR Hedged": ["AGGH.L", "IAGG.DE"],
    "Global Inflation-Linked Bond - EUR Hedged": ["AGGH.L", "IBXL.DE"],
    "Global Emerging Markets Bond - EUR Hedged": ["EBMB.L", "EMB"],
    "Global Emerging Markets Bond - Local Currency": ["EMLC.L", "EMB"],
    "Convertible Bond - Global, EUR Hedged": ["ICOV.L", "0P55V.L"],
}

# Runde 2: forrige runde ga 0 dager for disse (feil suffix / avviklet ticker).
CANDIDATES: dict[str, list[str]] = {
    "Europe Small-Cap Equity": ["^FTAS", "IEUS.L", "ESCT.MI"],
    "Japan Small/Mid-Cap Equity": ["1305.T", "1306.T", "^TOPX"],
    "South Africa Equity": ["EZA.DE", "^JSE", "XJKA.DE"],
    "Africa Equity": ["XMAP.DE", "EZA.DE", "AFRE"],
    "Africa & Middle East Equity": ["XMEF.DE", "EZA.DE", "AFRE"],
    "Global Frontier Markets Equity": ["XMIN.DE", "PRFR", "XFRN.DE"],
    "Sector Equity Natural Resources": ["XMIN.DE", "^GSPC", "XLB"],
    "Sector Equity Water": ["PHOG", "^WTR", "XWTR.DE"],
    "Sector Equity Infrastructure": ["PRIF", "PBDM.DE", "^GSPC"],
    "Sector Equity Listed Private Equity": ["VCIT", "GSPT.DE", "^GSPC"],
    "Other Bond": ["AGGH.L", "IAGG.L", "EUNA.L"],
    "EUR Corporate Bond": ["ICOR.L", "IBCE.DE", "EUNA.L"],
    "USD Corporate Bond": ["ICOR.L", "IUSN.L", "XSUM.L"],
    "EUR High Yield Bond": ["0Y55V.DE", "HYGD.DE", "IBCE.DE"],
    "Global Diversified Bond": ["AGGH.L", "IAGG.L", "IBGL.L"],
    "EUR Diversified Bond": ["AGGH.L", "IAGG.L", "IBGL.L"],
    "EUR Flexible Bond": ["AGGH.L", "IAGG.L", "IBGL.L"],
    "EUR Inflation-Linked Bond": ["IBXL.DE", "IUSI.L", "IEI.DE"],
    "USD Inflation-Linked Bond": ["IUSI.L", "IBXL.DE", "LTPZ.L"],
    "Global Inflation-Linked Bond": ["IAGG.L", "AGGH.L", "IBGL.L"],
    "EUR Subordinated Bond": ["IBSS.DE", "IBCE.DE", "IUSB.DE"],
    "SEK Diversified Bond": ["A20D.ST", "XBND.ST", "A5EQ.ST"],
    "JPY Bond": ["135A.T", "1348.T", "JPRE.L"],
    "Asia Bond - Local Currency": ["AAGG.L", "IAGG.L", "AGGH.L"],
    "Convertible Bond - Global": ["ICOV.L", "0P55V.L", "JCP.L"],
    "Global Diversified Bond - EUR Hedged": ["AGGH.L", "IAGG.L", "IBGL.L"],
    "Global Inflation-Linked Bond - EUR Hedged": ["AGGH.L", "IAGG.L", "IBGL.L"],
}

# Runde 3: obligasjons-EM (EUR-hedget aggregate/sector) + navnevalidering.
CANDIDATES: dict[str, list[str]] = {
    "EUR Aggregate": ["IAGF.DE", "IAGF.L", "AGGH.L", "EUNA.L", "IAGE.L"],
    "EUR Gov hedget": ["AGGH.L", "IAGE.L", "EUNA.L", "IBGL.L"],
    "EUR Corp hedget": ["ICOR.L", "IBKS.DE", "IAGF.DE", "XSUM.L"],
    "EUR HY": ["HYGD.DE", "0P1U.DE", "HYGE.DE", "IBCE.DE"],
    "Inflationslinket EUR": ["IEI.DE", "IBXL.DE", "IUSI.DE"],
    "Inflationslinket USD": ["IUSI.L", "LTPZ.L", "IUSI.DE"],
    "SEK bond": ["A20D.ST", "XBND.ST", "A5EQ.ST", "XAGG.ST"],
    "Asia LC bond": ["AAGG.L", "IAGG.L", "AGGH.L", "IAGF.DE"],
    "Convertible": ["ICOV.L", "JCP.L", "0P55V.L", "ICOV.DE"],
    "SAfrika": ["EZA.DE", "^JSE", "XJKA.DE", "^JTOPI", "JSEJ.JO"],
    "Afrika": ["AFRE", "XMAP.DE", "EZA.DE"],
    "Frontier": ["PRFR", "XMIN.DE", "XFRN.DE"],
    "Vann": ["PHOG", "^WTR", "XWTR.DE", "PHO.DE"],
    "South Africa/Frontier MSCI": ["990100", "890600"],
}
# Ticker -> (kategori, forventet valuta) for navnevalidering av valgte proxyer.
VALIDATE: dict[str, str] = {
    "IUSB.DE": "iShares eb.rexx / statsoblig EUR",
    "IBGL.L": "iShares Global Government Bond (LSE)",
    "IUSB.DE ": "",
    "IGLO.L": "iShares eb.rexx Global Gov",
    "AGGU.L": "iShares Global Aggregate USD",
    "IGLS.L": "iShares Core UK Gilts",
    "EMB": "iShares EM Bond",
    "EMLC.L": "iShares EM LC Bond",
    "HYG": "iShares High Yield Corp",
    "JPHG.L": "iShares Global High Yield",
    "ACWI": "iShares MSCI ACWI",
    "WOOD": "Roundwood Small Cap",
    "EPP": "iShares Pacific ex Japan",
    "EIML": "iShares Latin America 40",
    "IEMG": "iShares Core MSCI EM",
    "VNQ": "Vanguard REIT",
    "IPRP.L": "iShares UK Property",
    "IASP.L": "iShares Asia Property",
    "ICLN": "iShares Global Clean Energy",
    "GDX": "VanEck Gold Miners",
    "DBA": "Invesco DB Agriculture",
    "XLB": "Materials Select Sector",
    "XLE": "Energy Select Sector",
    "VCIT": "Vanguard Private Equity",
    "^OMXSPI": "OMX Stockholm PI",
    "^OMXC25": "OMX Copenhagen 25",
    "^STOXX50E": "Euro Stoxx 50",
    "^FTAS": "FTSE All-Share",
    "^JKSE": "Jakarta Composite",
    "^MXX": "Mexico IPC",
    "^HSI": "Hang Seng",
    "1306.T": "Nikkei Mid Small",
    "1348.T": "Nikkei Bond",
    "CNYB.L": "iShares CNY Bond",
    "EPP ": "",
}


def main() -> None:
    import yfinance as yf

    alle: list[str] = sorted({t for v in CANDIDATES.values() for t in v} | set(VALIDATE))
    print(f"{len(alle)} unike kandidater i {len(CANDIDATES)} kategorier")
    try:
        dl = yf.download(alle, period="5y", progress=False, threads=True, auto_adjust=False)
    except Exception as e:
        print(f"Batch-nedlasting feilet: {e}")
        sys.exit(1)

    rows: list[dict] = []
    for t in alle:
        try:
            s = dl[("Adj Close", t)].dropna() if ("Adj Close", t) in dl.columns else pd.Series(dtype=float)
        except Exception:
            s = pd.Series(dtype=float)
        ccy = ""
        try:
            ccy = str(yf.Ticker(t).fast_info.get("currency") or "").upper()
            time.sleep(0.25)
        except Exception:
            pass
        rows.append({"ticker": t, "dager": len(s),
                     "siste": str(s.index.max().date()) if len(s) else "",
                     "valuta": ccy})
    res = pd.DataFrame(rows).sort_values(["dager", "ticker"], ascending=[False, True])
    res.to_csv(OUT, index=False, encoding="utf-8-sig")

    print("\nPer kategori (kun kandidater med >= 700 dager):")
    for bm, cands in CANDIDATES.items():
        sub = res[res["ticker"].isin(cands)]
        ok = sub[sub["dager"] >= MIN_ROWS]
        if ok.empty:
            beste = sub.iloc[0] if len(sub) else None
            print(f"  INGEN  {bm[:48]:50} (beste: {beste['ticker']} {int(beste['dager'])}d)" if beste is not None
                  else f"  INGEN  {bm[:48]}")
        else:
            valgt = ok.iloc[0]
            print(f"  OK     {bm[:48]:50} -> {valgt['ticker']:12} {int(valgt['dager'])}d {valgt['valuta']:4}"
                  f"  (valg: {', '.join(ok['ticker'].tolist()[:3])})")
    print(f"\nSkrev {OUT}")

    if VALIDATE:
        print("\nNavnevalidering av valgte proxyer (ticker | fysisk navn | valuta | dager):")
        for t, hensikt in VALIDATE.items():
            navn = ""
            try:
                navn = str(yf.Ticker(t).info.get("longName") or yf.Ticker(t).info.get("shortName") or "")
                time.sleep(0.2)
            except Exception:
                pass
            r = res[res["ticker"] == t]
            d = int(r["dager"].iloc[0]) if len(r) else 0
            cc = r["valuta"].iloc[0] if len(r) else ""
            print(f"  {t:12} {cc:4} {d:5}d  {navn[:60]:62} [{hensikt}]")


if __name__ == "__main__":
    main()
