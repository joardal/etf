"""
Eksporterer leveranse_egenberegning.csv til app/data.js med full mapping
av kvantitative beregninger, tekniske indikatorer og Nordnet-dimensjoner.
"""
from __future__ import annotations

import json
from pathlib import Path
import pandas as pd
import numpy as np

ROOT = Path(__file__).resolve().parent
LEVERANSE_CSV = ROOT / "egenberegning_test" / "output" / "leveranse_egenberegning.csv"
MANIFEST_JSON = ROOT / "app" / "prices" / "manifest.json"
OUT_DATA_JS = ROOT / "app" / "data.js"


def clean_val(val):
    if val is None or pd.isna(val):
        return None
    if isinstance(val, (np.floating, float)):
        if np.isneginf(val) or np.isposinf(val) or np.isnan(val):
            return None
        return round(float(val), 4)
    if isinstance(val, (np.integer, int)):
        return int(val)
    s = str(val).strip()
    if s.lower() in ("nan", "none", "null", ""):
        return None
    return s


def pick_first(*values):
    for v in values:
        c = clean_val(v)
        if c is not None:
            return c
    return None


def export_data():
    if not LEVERANSE_CSV.exists():
        raise FileNotFoundError(f"Finner ikke leveranse-fil: {LEVERANSE_CSV}")

    df = pd.read_csv(LEVERANSE_CSV, encoding="utf-8-sig", low_memory=False)
    print(f"Lest {len(df)} rader fra {LEVERANSE_CSV.name}")

    # Les teknisk manifest hvis tilgjengelig
    manifest = {}
    if MANIFEST_JSON.exists():
        try:
            with open(MANIFEST_JSON, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            print(f"Lest manifest med {len(manifest)} ETF-er")
        except Exception as e:
            print(f"Advarsel: Kunne ikke lese manifest.json: {e}")

    records = []
    has_ret_12m = 0
    has_beta = 0

    for _, row in df.iterrows():
        isin = str(row.get("ISIN", "")).strip()
        kortnavn = clean_val(row.get("Kortnavn")) or isin
        navn = pick_first(row.get("MS_Navn_Morningstar"), kortnavn, isin)
        kategori = pick_first(row.get("Statisk_Nordnet_Kategori"), row.get("MS_Kategori_Morningstar"), "Uklassifisert")
        
        # Finn tekniske data fra manifest
        tech = manifest.get(isin) or manifest.get(kortnavn) or {}
        sparkline = tech.get("sparkline")
        pct_ath = clean_val(tech.get("pct_ath"))
        ath = clean_val(tech.get("ath"))
        above_sma50 = tech.get("above_sma50")
        above_sma200 = tech.get("above_sma200")
        h52w_high = clean_val(tech.get("h52w_high"))
        h52w_low = clean_val(tech.get("h52w_low"))
        last_price = clean_val(tech.get("last_price"))

        ret_12m = pick_first(row.get("Egen_Avkastning_12M_%"), row.get("MS_Avkastning_12M_%"))
        beta_3y = pick_first(row.get("Egen_Beta_3Y"), row.get("Egen_Beta"), row.get("MS_Beta_3Y"))
        
        if ret_12m is not None:
            has_ret_12m += 1
        if beta_3y is not None:
            has_beta += 1

        rec = {
            "ISIN": isin,
            "Kortnavn": kortnavn,
            "Navn_Fil": navn,
            "Navn_Morningstar": navn,
            "Dataleverandor": "Kvantitativ Egenberegning (Yahoo Finance)",
            "Datastatus_Prioritet_1": "Komplett" if ret_12m is not None else "Mangler data",
            "Datastatus_Prioritet_2": "Komplett" if beta_3y is not None else "Mangler benchmark",
            "Kategori_Morningstar": kategori,
            "Oppdateringsdato": "2026-09-29",
            "Oppdateringsdato_Avkastning": "2026-09-29",
            "Oppdateringsdato_Risiko": "2026-09-29",
            "Valuta_Avkastning": pick_first(row.get("Egen_Valuta"), row.get("MS_Valuta_Avkastning"), "EUR"),
            "Valuta_Risiko": pick_first(row.get("Egen_Valuta"), row.get("MS_Valuta_Avkastning"), "EUR"),
            "Valuta_AUM": pick_first(row.get("MS_Valuta_Avkastning"), row.get("Egen_Valuta"), "EUR"),
            "Benchmark_Navn": pick_first(row.get("Benchmark_Navn"), "Uspesifisert"),
            "Aarlig_Avgift_%": pick_first(row.get("Statisk_Nordnet_rlig_avgift"), row.get("Statisk_Nordnet_Årlig_avgift"), row.get("MS_Aarlig_Avgift_%")),
            "AUM_Verdi": pick_first(row.get("MS_AUM_Verdi")),
            
            # Statiske Nordnet-felter
            "Nordnet_Kategori": pick_first(row.get("Statisk_Nordnet_Kategori")),
            "Nordnet_Utdelningspolicy": pick_first(row.get("Statisk_Nordnet_Utdelningspolicy")),
            "Nordnet_Årlig_avgift": pick_first(row.get("Statisk_Nordnet_rlig_avgift"), row.get("Statisk_Nordnet_Årlig_avgift"), row.get("MS_Aarlig_Avgift_%")),
            "Nordnet_MS_Rating": pick_first(row.get("Statisk_Nordnet_MS_Rating")),
            "Nordnet_Risk": pick_first(row.get("Statisk_Nordnet_Risk")),
            "Nordnet_Hållbarhet": pick_first(row.get("Statisk_Nordnet_Hllbarhet"), row.get("Statisk_Nordnet_Hållbarhet")),
            "Nordnet_Spread": pick_first(row.get("Statisk_Nordnet_Spread")),
            
            # Avkastning (Egen som primær)
            "Avkastning_1M_%": pick_first(row.get("Egen_Avkastning_1M_%")),
            "Avkastning_3M_%": pick_first(row.get("Egen_Avkastning_3M_%")),
            "Avkastning_6M_%": pick_first(row.get("Egen_Avkastning_6M_%")),
            "Avkastning_12M_%": ret_12m,
            "Avkastning_3Y_Ann_%": pick_first(row.get("Egen_Avkastning_3Y_Ann_%"), row.get("MS_Avkastning_3Y_Ann_%")),
            "Avkastning_5Y_Ann_%": pick_first(row.get("Egen_Avkastning_5Y_Ann_%"), row.get("MS_Avkastning_5Y_Ann_%")),
            
            # Volatilitet og Sharpe
            "Sharpe_1Y": pick_first(row.get("Egen_Sharpe_1Y"), row.get("MS_Sharpe_1Y")),
            "Sharpe_3Y": pick_first(row.get("Egen_Sharpe_3Y"), row.get("MS_Sharpe_3Y")),
            "Sharpe_5Y": pick_first(row.get("Egen_Sharpe_5Y"), row.get("MS_Sharpe_5Y")),
            "Standardavvik_1Y_%": pick_first(row.get("Egen_Stdavvik_1Y_%"), row.get("MS_Standardavvik_1Y_%")),
            "Standardavvik_3Y_%": pick_first(row.get("Egen_Stdavvik_3Y_%"), row.get("MS_Standardavvik_3Y_%")),
            "Standardavvik_5Y_%": pick_first(row.get("Egen_Stdavvik_5Y_%"), row.get("MS_Standardavvik_5Y_%")),
            
            # Drawdowns
            "Max_Drawdown_1Y_%": pick_first(row.get("Egen_MaxDD_1Y_%")),
            "Max_Drawdown_3Y_%": pick_first(row.get("Egen_MaxDD_3Y_%")),
            "Max_Drawdown_5Y_%": pick_first(row.get("Egen_MaxDD_5Y_%")),
            "Beregnet_Max_Drawdown_1Y_%": pick_first(row.get("Egen_MaxDD_1Y_%")),
            "Beregnet_Max_Drawdown_3Y_%": pick_first(row.get("Egen_MaxDD_3Y_%")),
            "Beregnet_Max_Drawdown_5Y_%": pick_first(row.get("Egen_MaxDD_5Y_%")),
            "Beregnet_Max_Drawdown_%": pick_first(row.get("Egen_MaxDD_5Y_%"), row.get("Egen_MaxDD_3Y_%"), row.get("Egen_MaxDD_1Y_%")),
            
            # Avanserte risikomål
            "Beregnet_Sortino_Ratio": pick_first(row.get("Egen_Sortino")),
            "Beregnet_Calmar_Ratio": pick_first(row.get("Egen_Calmar")),
            "Beregnet_Ulcer_Index": pick_first(row.get("Egen_Ulcer")),
            "Beregnet_CVaR_95_%": pick_first(row.get("Egen_CVaR95_%")),
            "Beregnet_Siste_Rullerende_Sharpe_1y": pick_first(row.get("Egen_RullSharpe_1Y")),
            "Beregnet_Antall_Dager": pick_first(row.get("Egen_Antall_Dager")),
            "Beregnet_Status": pick_first(row.get("Egen_Beregn_Status"), row.get("Egen_Status")),
            
            # Beta, Alpha & R²
            "Beta_1Y": pick_first(row.get("Egen_Beta_1Y"), row.get("MS_Beta_1Y")),
            "Beta_3Y": beta_3y,
            "Beta_5Y": pick_first(row.get("Egen_Beta_5Y"), row.get("MS_Beta_5Y")),
            "Alpha_1Y_%": pick_first(row.get("Egen_Alpha_1Y_%")),
            "Alpha_3Y_%": pick_first(row.get("Egen_Alpha_3Y_%"), row.get("Egen_Alpha_Ann_%")),
            "Alpha_5Y_%": pick_first(row.get("Egen_Alpha_5Y_%")),
            "R2_1Y": pick_first(row.get("Egen_R2_1Y")),
            "R2_3Y": pick_first(row.get("Egen_R2_3Y"), row.get("Egen_R2"), row.get("MS_R2_3Y")),
            "R2_5Y": pick_first(row.get("Egen_R2_5Y")),
            
            # Institusjonelt
            "Upside_Capture_3Y_%": pick_first(row.get("Egen_UpsideCap_3Y_%")),
            "Downside_Capture_3Y_%": pick_first(row.get("Egen_DownsideCap_3Y_%")),
            "Tracking_Error_1Y_%": pick_first(row.get("Egen_TE_1Y_%")),
            "Tracking_Error_3Y_%": pick_first(row.get("Egen_TE_3Y_%"), row.get("Egen_TE_Ann_%"), row.get("MS_Tracking_Error_3Y_%")),
            "Tracking_Error_5Y_%": pick_first(row.get("Egen_TE_5Y_%")),
            "Information_Ratio_1Y": pick_first(row.get("Egen_IR_1Y")),
            "Information_Ratio_3Y": pick_first(row.get("Egen_IR_3Y"), row.get("Egen_IR"), row.get("MS_Information_Ratio_3Y")),
            "Information_Ratio_5Y": pick_first(row.get("Egen_IR_5Y")),
            
            # Morningstar referansetall og differanser
            "MS_Avkastning_12M_%": pick_first(row.get("MS_Avkastning_12M_%")),
            "MS_Beta_3Y": pick_first(row.get("MS_Beta_3Y")),
            "MS_Sharpe_1Y": pick_first(row.get("MS_Sharpe_1Y")),
            "Diff_Avkastning_12M_%": pick_first(row.get("Diff_Avkastning_12M_%")),
            "Diff_Beta": pick_first(row.get("Diff_Beta")),
            "Diff_Sharpe_1Y": pick_first(row.get("Diff_Sharpe_1Y")),
            
            # Tekniske data & Sparklines
            "Sparkline": sparkline,
            "Pct_ATH": pct_ath,
            "ATH": ath,
            "Last_Price": last_price,
            "Above_SMA50": above_sma50,
            "Above_SMA200": above_sma200,
            "H52W_High": h52w_high,
            "H52W_Low": h52w_low,
            
            # Datakilder
            "Kilde": pick_first(row.get("Kilde")),
            "Bench_Kilde": pick_first(row.get("Bench_Kilde"))
        }
        records.append(rec)

    # Skriv ut app/data.js
    json_str = json.dumps(records, ensure_ascii=False, indent=None)
    with open(OUT_DATA_JS, "w", encoding="utf-8") as f:
        f.write(f"window.ETF_DATA = {json_str};\n")

    print(f"Vellykket eksport: {len(records)} ETF-er skrevet til {OUT_DATA_JS}")
    print(f"Statistikk:")
    print(f"  - Fond med 12M Avkastning: {has_ret_12m}/{len(records)}")
    print(f"  - Fond med Beta (3Y/ann):   {has_beta}/{len(records)}")


if __name__ == "__main__":
    export_data()
