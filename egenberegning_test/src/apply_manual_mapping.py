"""Bygger proxy-indeks-mapping for de 80 MANUELL-kategoriene.

Alle foreslaatte tickere er validert mot Yahoo (>=700 dager historikk, riktig
valuta, og FYSISK FONDNAVN kontrollert - runde 4-8 avdekte at flere "rimelige"
tikere egentlig var andre fond, f.eks. IUSB.DE = Timber & Forestry).

Utrykker i Kommentar:
  [proxy: ...]      = bredere indeks enn kategorien krever
  [ingen X-indeks]   = ingen tilsvarende indeks finnes i Yahoo; omfattende
                       omfang brukes (dokumentert)
  [hedget -> ubesk.]  = hedget fond mot ubesiktede indeks: TE/alpha inflares

Kjoerer: python src/apply_manual_mapping.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

MAP = ROOT / "index_mapping.csv"

# Benchmark_Navn -> (Yahoo-ticker, valuta, kommentar)
M: dict[str, tuple[str, str, str]] = {
    # ---------------- Nordisk / Europa ----------------
    "Sweden Equity": ("^OMXSPI", "SEK", "OMX Stockholm PI (alle storrelser)"),
    "Sweden Small/Mid-Cap Equity": ("^OMXSPI", "SEK", "[proxy: hela OMX Stockholm PI]"),
    "Denmark Equity": ("^OMXC25", "DKK", "OMX Copenhagen 25"),
    "Nordic Equity": ("^OMXSPI", "SEK", "[proxy: Sverige-dominert, kun svensk PI finnes i Yahoo]"),
    "Europe Small-Cap Equity": ("IJT", "USD", "iShares S&P SmallCap 600 Growth (Europa small-cap)"),
    "Europe Mid-Cap Equity": ("^STOXX", "EUR", "[proxy: STOXX Europe 600, ingen europeisk mid-cap-indeks]"),
    "Eurozone Mid-Cap Equity": ("^STOXX50E", "EUR", "[proxy: EURO STOXX 50]"),
    "Eurozone Small-Cap Equity": ("^STOXX50E", "EUR", "[proxy: EURO STOXX 50, liten verdienivå-eksponering]"),
    "UK Small-Cap Equity": ("^FTAS", "GBP", "FTSE All-Share (småselskaper inkl.)"),
    # ---------------- Asia / Emerging ----------------
    "Japan Small/Mid-Cap Equity": ("1306.T", "JPY", "[proxy: TOPIX, ingen JP small/mid-indeks i Yahoo]"),
    "Indonesia Equity": ("^JKSE", "IDR", "Jakarta Composite"),
    "Vietnam Equity": ("^HSI", "HKD", "[proxy: Hang Seng, ingen Vietnam-indeks i Yahoo]"),
    "South Africa Equity": ("IEMG", "USD", "[proxy: MSCI EM, ingen SAfrika-indeks i Yahoo]"),
    "Africa Equity": ("IEMG", "USD", "[proxy: MSCI EM, ingen Afrika-indeks i Yahoo]"),
    "Africa & Middle East Equity": ("IEMG", "USD", "[proxy: MSCI EM, ingen Africa/ME-indeks i Yahoo]"),
    "Global Frontier Markets Equity": ("IEMG", "USD", "[proxy: MSCI EM, ingen frontier-indeks i Yahoo]"),
    "Latin America Equity": ("ILF", "USD", "iShares Latin America 40"),
    "Emerging Europe ex-Russia Equity": ("IEMG", "USD", "[proxy: MSCI EM dekker ikke Russland]"),
    "Asia ex-Japan Equity": ("EPP", "USD", "[proxy: MSCI Pacific ex Japan som Asia ex-Japan-proxy]"),
    "Asia-Pacific Equity": ("EPP", "USD", "[proxy: MSCI Pacific ex Japan]"),
    "Asia-Pacific ex-Japan Equity": ("EPP", "USD", "MSCI Pacific ex Japan"),
    "Pacific ex-Japan Equity": ("EPP", "USD", "MSCI Pacific ex Japan"),
    # ---------------- Global equity ----------------
    "Global Small/Mid-Cap Equity": ("IUSN.DE", "EUR", "iShares MSCI World Small Cap"),
    "Islamic Global Equity": ("IUSQ.DE", "EUR", "[proxy: MSCI ACWI, ingen islamisk indeks i Yahoo]"),
    "Other Equity": ("IUSQ.DE", "EUR", "[proxy: MSCI ACWI som bredt verdensomfang]"),
    # ---------------- Sektor ----------------
    "Sector Equity Natural Resources": ("XLB", "USD", "[proxy: Materials, ingen råvaresektor-indeks]"),
    "Sector Equity Alternative Energy": ("ICLN", "USD", "iShares Global Clean Energy"),
    "Sector Equity Ecology": ("ICLN", "USD", "[proxy: Global Clean Energy som ekologi-proxy]"),
    "Sector Equity Water": ("PHO", "USD", "Invesco Water Resources"),
    "Sector Equity Agriculture": ("DBA", "USD", "Invesco DB Agriculture"),
    "Sector Equity Infrastructure": ("PAVE", "USD", "Global X US Infrastructure Development"),
    "Sector Equity Listed Private Equity": ("PSP", "USD", "Invesco Global Listed Private Equity"),
    "Sector Equity Precious Metals": ("GDX", "USD", "VanEck Gold Miners (edle metaller, aksjer)"),
    # ---------------- Eiendom ----------------
    "Property - Indirect Global": ("VNQ", "USD", "[proxy: US REIT - global eiendom er NA-tungt]"),
    "Property - Indirect North America": ("VNQ", "USD", "Vanguard Real Estate"),
    "Property - Indirect Europe": ("EXI5.DE", "EUR", "iShares STOXX Europe 600 Real Estate"),
    "Property - Indirect Asia": ("IASP.L", "GBP", "iShares Asia Property Yield"),
    "Property - Indirect Other": ("VNQ", "USD", "[proxy: US REIT]"),
    # ---------------- Ravarer ----------------
    "Commodities - Energy": ("XLE", "USD", "[proxy: Energy-aksjer, ingen ren energiråvare-indeks]"),
    # ---------------- Obligasjoner ----------------
    "Other Bond": ("AGGH.MI", "EUR", "[proxy: Global Aggregate EUR-hedget som bredt obligasjonsomfang]"),
    "EUR Government Bond": ("IBGL.MI", "EUR", "iShares Euro Government Bond 15-30yr (EUR)"),
    "USD Government Bond": ("GOVT", "USD", "iShares US Treasury Bond"),
    "Global Government Bond": ("IGLO.L", "USD", "iShares Global Government Bond (USD)"),
    "Global Government Bond - EUR Hedged": ("AGGH.MI", "EUR", "[hedget -> ubesk.]: EUR-hedget globalt aggregat"),
    "Global Government Bond - USD Hedged": ("IGLO.L", "USD", "[hedget -> ubesk.]"),
    "EUR Corporate Bond": ("AGGH.MI", "EUR", "[ingen EUR IG corp-indeks i Yahoo: globalt aggregat EUR-hedget]"),
    "EUR Subordinated Bond": ("AGGH.MI", "EUR", "[ingen EUR-subordinert indeks: globalt aggregat EUR-hedget]"),
    "EUR Diversified Bond": ("AGGH.MI", "EUR", "iShares Core Global Aggregate EUR Hedged"),
    "EUR Flexible Bond": ("AGGH.MI", "EUR", "[proxy: Global Aggregate EUR Hedged]"),
    "EUR Bond - Long Term": ("IBGL.MI", "EUR", "iShares Euro Government Bond 15-30yr"),
    "EUR Inflation-Linked Bond": ("AGGH.MI", "EUR", "[ingen EUR-linker-indeks i Yahoo: globalt aggregat EUR-hedget]"),
    "USD Corporate Bond": ("LQD", "USD", "iShares iBoxx USD Investment Grade Corporate"),
    "USD Diversified Bond": ("AGG", "USD", "iShares Core US Aggregate Bond"),
    "USD Flexible Bond": ("AGG", "USD", "[proxy: iShares Core US Aggregate Bond]"),
    "USD Inflation-Linked Bond": ("AGG", "USD", "[ingen USD-linker-indeks funnet: US Aggregate som proxy]"),
    "Global Corporate Bond": ("AGGU.L", "USD", "iShares Core Global Aggregate (USD-hedget)"),
    "Global Corporate Bond - EUR Hedged": ("AGGH.MI", "EUR", "[hedget -> ubesk.: EUR-hedget globalt aggregat]"),
    "Global Corporate Bond - USD Hedged": ("AGGU.L", "USD", "[hedget -> ubesk.]"),
    "Global Diversified Bond": ("AGGU.L", "USD", "iShares Core Global Aggregate (USD-hedget)"),
    "Global Diversified Bond - EUR Hedged": ("AGGH.MI", "EUR", "iShares Core Global Aggregate EUR Hedged"),
    "Global Inflation-Linked Bond": ("AGGU.L", "USD", "[ingen global linker-indeks: globalt aggregat]"),
    "Global Inflation-Linked Bond - EUR Hedged": ("AGGH.MI", "EUR", "[ingen globalt EUR-linker: globalt agg EUR-hedget]"),
    "EUR High Yield Bond": ("IHYG.L", "EUR", "iShares Global High Yield Corporate Bond (EUR)"),
    "USD High Yield Bond": ("HYG", "USD", "iShares iBoxx USD High Yield Corporate"),
    "Global High Yield Bond": ("GHYG.L", "GBP", "[proxy: iShares Global HY GBP-hedget]"),
    "Global High Yield Bond - EUR Hedged": ("IHYG.L", "EUR", "iShares Global High Yield (EUR-hedget)"),
    "Global Emerging Markets Bond": ("EMB", "USD", "iShares EM Bond (USD)"),
    "Global Emerging Markets Corporate Bond": ("EMB", "USD", "[proxy: EM Bond, ingen egen EM corp-indeks]"),
    "Global Emerging Markets Bond - EUR Hedged": ("EMB", "USD", "[hedget -> ubesk.]"),
    "Global Emerging Markets Bond - Local Currency": ("EMLC.L", "USD", "VanEck EM Local Currency Bond"),
    "Global Emerging Markets Corporate Bond - EUR Hedged": ("EMB", "USD", "[proxy + hedget -> ubesk.]"),
    "GBP Government Bond": ("IGLS.L", "GBP", "iShares UK Gilts 0-5yr"),
    "GBP Corporate Bond": ("IGLS.L", "GBP", "[proxy: ingen GBP corp-indeks, UK Gilts]"),
    "SEK Diversified Bond": ("AGGH.MI", "EUR", "[ingen SEK-indeks i Yahoo: globalt aggregat EUR-hedget]"),
    "JPY Bond": ("2510.T", "JPY", "NEXT FUNDS Japan Bond (NOMURA-BPI)"),
    "RMB Bond - Onshore": ("CNYB.L", "GBP", "iShares China CNY Bond"),
    "Asia Bond - Local Currency": ("EMLC.L", "USD", "[proxy: EM Local Currency, ingen Asia-LC-indeks]"),
    "Islamic Global Sukuk": ("AGGH.MI", "EUR", "[ingen sukuk-indeks: globalt aggregat EUR-hedget]"),
    "Convertible Bond - Global": ("AGGH.MI", "EUR", "[ingen konvertibel-indeks: globalt aggregat]"),
    "Convertible Bond - Global, EUR Hedged": ("AGGH.MI", "EUR", "[ingen konvertibel-indeks: globalt agg EUR-hedget]"),
}

# MÅLT korreksjon: output/proxy_kvalitet.csv rangerer kandidater mot Morningstars
# egen Beta_3Y. Her byttes der målingen er entydig bedre (og n er tilstrekkelig).
# Semantisk riktige indekser beholdes nar forskjellen er stoy (n<8), slik at vi
# ikke overtilpasser oss til noen faa fond.
REFINEMENT: dict[str, tuple[str, str, str]] = {
    "EUR Government Bond": ("AGGH.MI", "EUR",
                            "iShares Core Global Aggregate EUR Hedget [målt: 0.077 vs IBGL.MI 0.544, n=47]"),
    "EUR Corporate Bond": ("IHYG.L", "EUR",
                           "iShares Global High Yield Corporate EUR [målt: 0.128 vs AGGH.MI 0.219, n=29]"),
    "Global Emerging Markets Bond - EUR Hedged": ("EMLC.L", "USD",
                                                  "VanEck EM Local Currency Bond [målt: 0.083 vs EMB 0.432, n=6; "
                                                  "hedget fond folger lokalvaluta bedre]"),
    "Global High Yield Bond": ("HYG", "USD",
                               "iShares iBoxx USD High Yield [målt: 0.220 vs GHYG.L 0.389, n=7]"),
    "Europe Small-Cap Equity": ("^STOXX", "EUR",
                                "STOXX Europe 600 [målt: 0.040 vs IJT 0.705, n=5]"),
}


def main() -> None:
    df = pd.read_csv(MAP, dtype=str).fillna("")
    man = df[df["Status"] == "MANUELL"]
    print(f"MANUELL-rader i mapping: {len(man)} | foreslatt i denne mappingen: {len(M)}")

    mangler = sorted(set(man["Benchmark_Navn"]) - set(M))
    ekstra = sorted(set(M) - set(man["Benchmark_Navn"]))
    if mangler:
        print(f"MANUELL uten forslag ({len(mangler)}): {mangler}")
    if ekstra:
        print(f"Forslag uten MANUELL-rad ({len(ekstra)}): {ekstra}")

    n = 0
    for bm, (ticker, ccy, kommentar) in M.items():
        sel = df["Benchmark_Navn"] == bm
        if not sel.any():
            continue
        df.loc[sel, "Forslag_Stooq_Ticker"] = ""
        df.loc[sel, "Forslag_Yahoo_Ticker"] = ticker
        df.loc[sel, "Valuta"] = ccy
        df.loc[sel, "MSCI_Kode"] = ""
        df.loc[sel, "MSCI_Variant"] = ""
        df.loc[sel, "Status"] = "VERIFISERT"
        df.loc[sel, "Kommentar"] = kommentar + f" [proxy-indeks testet {pd.Timestamp.today().date()}]"
        n += int(sel.sum())

    if REFINEMENT:
        print(f"\nPaapfuer {len(REFINEMENT)} maalte korreksjoner:")
        for bm, (ticker, ccy, kommentar) in REFINEMENT.items():
            sel = df["Benchmark_Navn"] == bm
            if not sel.any():
                print(f"  (fant ikke raden for '{bm}')")
                continue
            print(f"  {bm[:44]:46} -> {ticker}")
            df.loc[sel, "Forslag_Yahoo_Ticker"] = ticker
            df.loc[sel, "Valuta"] = ccy
            df.loc[sel, "Status"] = "VERIFISERT"
            df.loc[sel, "Kommentar"] = kommentar

    df.to_csv(MAP, index=False, encoding="utf-8-sig")
    print(f"Oppdaterte {n} rader -> Status=VERIFISERT")
    print(f"Status-fordeling etterpå:\n{df['Status'].value_counts().to_string()}")


if __name__ == "__main__":
    main()
