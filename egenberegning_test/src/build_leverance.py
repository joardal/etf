"""Bygger endelig leveranse-fil: egenberegning + statiske Nordnet-felter.

Prinsipper:
  1. ALLE statiske felter fra Nordnet-listen beholdes uendret (kategori,
     utdelingspolicy, aarlig avgift, spread, MS-rating, risk, haalbarhet) og
     faar EGEN-prefix i output, slik at de aldri kan forveksles med beregnede tall.
  2. Morningstar-tall beholdes med MS_-prefix (de er referanse, ikke egne).
  3. Egne beregninger faar Egen_-prefix, og diffen mot Morningstar faar Diff_-prefix.
  4. Rader uten egen beregning beholdes (de trengs for AUM-/kategorifiltrering),
     med Egen_Beregn_Status som sier hvorfor de mangler.

Kjoerer: python src/build_leverance.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

with open(ROOT / "config.json", encoding="utf-8") as f:
    CFG = json.load(f)

EGEN_SRC = ROOT / "output" / "egen_full.csv"
MS_SRC = Path(CFG["morningstar_csv"])
UT = ROOT / "output" / "leveranse_egenberegning.csv"

# Statiske Nordnet-felter: beholdes ordrett, prefix "Nordnet_".
NORDNET = ["Nordnet_Kategori", "Nordnet_Utdelningspolicy", "Nordnet_Årlig_avgift",
           "Nordnet_MS_Rating", "Nordnet_Risk", "Nordnet_Hållbarhet", "Nordnet_Spread"]

# Morningstar-referanse: beholdes med prefix "MS_".
MS_REF = ["Navn_Morningstar", "Kategori_Morningstar", "Benchmark_Navn", "Dataleverandor",
          "Aarlig_Avgift_%", "AUM_Verdi", "Valuta_Avkastning", "Oppdateringsdato_Avkastning",
          "Avkastning_12M_%", "Avkastning_3Y_Ann_%"]


def main() -> None:
    egen = pd.read_csv(EGEN_SRC, encoding="utf-8-sig", low_memory=False)
    ms = pd.read_csv(MS_SRC, encoding="utf-8-sig", dtype={"ISIN": "string"}, low_memory=False)

    eg = egen[[c for c in egen.columns if c not in ("Kortnavn",)]].copy()
    # Kortnavn hentes fra egens side (kan avvike fra Morningstars variant),
    # med MS-navn som reserve for rader som mangler i egenberegningen.
    eg.insert(1, "Kortnavn", egen["Kortnavn"].where(egen["Kortnavn"].notna(), egen["ISIN"]))

    # Benchmark_Navn fra MS (nøkkel) – egen indekskode kommer fra Egen-siden.
    ms_small = ms[["ISIN"] + [c for c in MS_REF if c in ms.columns] + NORDNET].copy()
    ms_small = ms_small.rename(columns={c: (c if c == "ISIN" else
                                           (f"MS_{c}" if c in MS_REF and c != "Benchmark_Navn"
                                            else c)) for c in ms_small.columns})

    out = eg.merge(ms_small, on="ISIN", how="outer", indicator=True)
    print(f"Radtotalt: {len(out)} | bare egen: {int((out['_merge'] == 'left_only').sum())} "
          f"| bare MS: {int((out['_merge'] == 'right_only').sum())}")
    out = out.drop(columns=["_merge"])

    # Egen_Beregn_Status: kort forklaring paa dekningsgrad pr rad.
    beta_ok = pd.to_numeric(out.get("Egen_Beta"), errors="coerce").notna()

    def status(rel, feil, ok):
        if ok:
            return "OK (relativtall beregnet)"
        if isinstance(rel, str) and rel.strip():
            return rel.strip()
        if isinstance(feil, str) and feil.strip():
            return f"Prisfeil: {feil[:60]}"
        return "Ingen relativtall (mangler indeks eller for lite data)"

    out["Egen_Beregn_Status"] = [
        status(rel, feil, ok)
        for rel, feil, ok in zip(out.get("Egen_Rel_Status", ""), out.get("Feil", ""), beta_ok)
    ]

    # Statiske Nordnet-felter merkes eksplisitt slik at de aldig kan forveksles
    # med beregnede tall.
    for c in NORDNET:
        if c in out.columns:
            out = out.rename(columns={c: f"Statisk_{c}"})

    # Diff mot Morningstar: viser avviket pr rad slik at feil kan spores.
    DIFF_PAR = [("Egen_Avkastning_12M_%", "MS_Avkastning_12M_%"),
                ("Egen_Avkastning_3Y_Ann_%", "MS_Avkastning_3Y_Ann_%"),
                ("Egen_Avkastning_5Y_Ann_%", "MS_Avkastning_5Y_Ann_%"),
                ("Egen_Sharpe_1Y", "MS_Sharpe_1Y"), ("Egen_Sharpe_3Y", "MS_Sharpe_3Y"),
                ("Egen_Stdavvik_1Y_%", "MS_Standardavvik_1Y_%"),
                ("Egen_Stdavvik_3Y_%", "MS_Standardavvik_3Y_%"),
                ("Egen_Beta_1Y", "MS_Beta_1Y"), ("Egen_Beta", "MS_Beta_3Y"),
                ("Egen_Beta_5Y", "MS_Beta_5Y"),
                ("Egen_TE_3Y_%", "MS_Tracking_Error_3Y_%"),
                ("Egen_IR_3Y", "MS_Information_Ratio_3Y")]

    # Morningstars avkastnings-/risikotall hentes inn kun for diffberegning.
    ms_risiko = [c for c in ms.columns
                 if c in {"Sharpe_1Y", "Sharpe_3Y", "Sharpe_5Y", "Standardavvik_1Y_%",
                          "Standardavvik_3Y_%", "Standardavvik_5Y_%", "Beta_1Y", "Beta_3Y",
                          "Beta_5Y", "Avkastning_5Y_Ann_%", "Tracking_Error_3Y_%",
                          "Information_Ratio_3Y", "R2_3Y"}]
    if ms_risiko:
        add = ms[["ISIN"] + ms_risiko].drop_duplicates("ISIN")
        add.columns = ["ISIN"] + [f"MS_{c}" for c in ms_risiko]
        out = out.merge(add, on="ISIN", how="left")
    for e_col, ms_col in DIFF_PAR:
        if e_col in out.columns and ms_col in out.columns:
            ev = pd.to_numeric(out[e_col], errors="coerce")
            mv = pd.to_numeric(out[ms_col], errors="coerce")
            out[f"Diff_{e_col.replace('Egen_', '')}"] = (ev - mv).round(2)

    # Kolonne-rekkefolge: identitet -> MS-referanse -> egne tall -> statiske Nordnet-felter.
    ident = [c for c in ("ISIN", "Kortnavn") if c in out.columns]
    ref = [c for c in out.columns if c.startswith("MS_")]
    stat = [c for c in out.columns if c.startswith("Statisk_")]
    rest = [c for c in out.columns if c not in ident + ref + stat]
    out = out[ident + ref + rest + stat]

    out.to_csv(UT, index=False, encoding="utf-8-sig")
    ok = int(out["Egen_Beregn_Status"].str.startswith("OK").sum())
    print(f"Skrev {UT}")
    print(f"Rader: {len(out)} | kolonner: {len(out.columns)} | med relativtall: {ok}")
    print(f"Statiske Nordnet-felter bevart: {[c for c in out.columns if c.startswith('Statisk_')]}")
    print(f"Uten relativtall: {len(out) - ok}")


if __name__ == "__main__":
    main()
