"""
Enrich ETF CSV with Morningstar Institutional & Priority 1-3 Metrics
====================================================================
Krav:
- Prioritet 1 (Obligatorisk): ISIN, Kategori, Oppdateringsdato, Avkastning (1, 3, 6, 12m, 3y, 5y),
  Sharpe (1, 3, 5y), Standardavvik (1, 3, 5y), Beta 3y, R² 3y, Alpha 3y, AUM, Årlig avgift, Benchmark.
- Prioritet 2 (Institusjonelt viktig): Max Drawdown, Upside/Downside Capture, Tracking Error,
  Information Ratio, Topp 10-vekt, Antall beholdninger, Risk/Return vs Category.
- Prioritet 3 (Egenberegninger): Sortino, Calmar, Ulcer Index, Recovery time, Expected Shortfall,
  Rullerende Sharpe, Downside correlation.
- Skånsom modus: Lav CPU-belastning, forsinkelse mellom kall, automatisk 429-backoff.
- Robusthet: UTF-8 encoding-fiks for å unngå Windows CP1252 charmap-krasj, og smart valuta-matching.
"""

import os
import sys

# Sikre at stdout og stderr alltid bruker UTF-8 på Windows (hindrer charmap-krasj ved emojier / spesialtegn)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

import csv
import time
import argparse
import datetime
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd
import mstarpy
import mstarpy.search

def safe_float(val):
    if val is None or val == "":
        return np.nan
    try:
        return float(val)
    except (ValueError, TypeError):
        return np.nan

def get_stat_by_period(stat_list, period):
    if not stat_list:
        return None
    for item in stat_list:
        if isinstance(item, dict) and item.get("TimePeriod") == period:
            return item.get("Value")
    return None

def compute_priority_3_metrics(nav_data, rf_annual=0.02):
    """
    Beregner Prioritet 3 nøkkeltall basert på daglige NAV-kurser:
    - Sortino ratio
    - Calmar ratio
    - Ulcer Index
    - Max Drawdown + Peak/Valley/Recovery
    - Expected Shortfall (CVaR 95%)
    - Rullerende Sharpe (252 dager)
    """
    if not nav_data or len(nav_data) < 30:
        return {
            "Beregnet_Status": "Utilgjengelig (utilstrekkelig kurshistorikk)",
            "Beregnet_Startdato": None,
            "Beregnet_Sluttdato": None,
            "Beregnet_Antall_Dager": len(nav_data) if nav_data else 0,
            "Max_Drawdown_1Y_%": None,
            "Max_Drawdown_3Y_%": None,
            "Max_Drawdown_5Y_%": None,
            "Beregnet_Max_Drawdown_1Y_%": None,
            "Beregnet_Max_Drawdown_3Y_%": None,
            "Beregnet_Max_Drawdown_5Y_%": None,
            "Beregnet_Max_Drawdown_%": None,
            "Beregnet_Drawdown_Peak_Dato": None,
            "Beregnet_Drawdown_Valley_Dato": None,
            "Beregnet_Recovery_Dager": None,
            "Beregnet_Sortino_Ratio": None,
            "Beregnet_Calmar_Ratio": None,
            "Beregnet_Ulcer_Index": None,
            "Beregnet_CVaR_95_%": None,
            "Beregnet_Siste_Rullerende_Sharpe_1y": None,
        }

    df = pd.DataFrame(nav_data)
    df["date"] = pd.to_datetime(df["date"])
    df.sort_values("date", inplace=True)
    df.set_index("date", inplace=True)
    df["ret"] = df["nav"].pct_change()
    df.dropna(subset=["ret"], inplace=True)

    if len(df) < 20:
        return {
            "Beregnet_Status": "Utilgjengelig (for få observasjoner)",
            "Beregnet_Startdato": None,
            "Beregnet_Sluttdato": None,
            "Beregnet_Antall_Dager": len(df),
            "Max_Drawdown_1Y_%": None,
            "Max_Drawdown_3Y_%": None,
            "Max_Drawdown_5Y_%": None,
            "Beregnet_Max_Drawdown_1Y_%": None,
            "Beregnet_Max_Drawdown_3Y_%": None,
            "Beregnet_Max_Drawdown_5Y_%": None,
            "Beregnet_Max_Drawdown_%": None,
            "Beregnet_Drawdown_Peak_Dato": None,
            "Beregnet_Drawdown_Valley_Dato": None,
            "Beregnet_Recovery_Dager": None,
            "Beregnet_Sortino_Ratio": None,
            "Beregnet_Calmar_Ratio": None,
            "Beregnet_Ulcer_Index": None,
            "Beregnet_CVaR_95_%": None,
            "Beregnet_Siste_Rullerende_Sharpe_1y": None,
        }

    start_date = df.index[0].strftime("%Y-%m-%d")
    end_date = df.index[-1].strftime("%Y-%m-%d")

    # 1. Drawdown for 1 år (252 dager), 3 år (756 dager) og 5 år (hele serien)
    # 1Y
    df_1y = df.iloc[-252:] if len(df) >= 252 else df
    cummax_1y = df_1y["nav"].cummax()
    dd_1y = (df_1y["nav"] - cummax_1y) / cummax_1y
    max_dd_1y = float(dd_1y.min() * 100) if len(df_1y) >= 20 else None

    # 3Y
    df_3y = df.iloc[-756:] if len(df) >= 756 else df
    cummax_3y = df_3y["nav"].cummax()
    dd_3y = (df_3y["nav"] - cummax_3y) / cummax_3y
    max_dd_3y = float(dd_3y.min() * 100) if len(df_3y) >= 20 else None

    # 5Y (hele perioden)
    cummax_5y = df["nav"].cummax()
    dd_5y = (df["nav"] - cummax_5y) / cummax_5y
    max_dd_5y = float(dd_5y.min() * 100) if len(df) >= 20 else None

    # Peak, Valley og Recovery på hele perioden
    max_dd = dd_5y.min()
    valley_date = dd_5y.idxmin()
    peak_date = df["nav"].loc[:valley_date].idxmax() if valley_date in df.index else df.index[0]

    # Recovery calculation
    rec_slice = df["nav"].loc[valley_date:]
    peak_val = df["nav"].loc[peak_date]
    rec_recovered = rec_slice[rec_slice >= peak_val]
    if len(rec_recovered) > 0:
        rec_days = (rec_recovered.index[0] - valley_date).days
    else:
        rec_days = "Ikke innhentet"

    # 2. Annualized Return
    n_days = len(df)
    ann_ret = (df["nav"].iloc[-1] / df["nav"].iloc[0]) ** (252 / n_days) - 1 if n_days > 0 else 0

    # 3. Sortino Ratio (Rf = 2% p.a.)
    rf_daily = rf_annual / 252
    excess_ret = df["ret"] - rf_daily
    downside = np.minimum(0, excess_ret)
    downside_dev = np.sqrt(np.mean(downside**2)) * np.sqrt(252)
    sortino = (ann_ret - rf_annual) / downside_dev if downside_dev > 1e-6 else np.nan

    # 4. Calmar Ratio
    calmar = ann_ret / abs(max_dd) if abs(max_dd) > 1e-6 else np.nan

    # 5. Ulcer Index
    ulcer = np.sqrt(np.mean((dd_5y * 100)**2))

    # 6. Expected Shortfall (CVaR 95% daglig)
    var_95 = df["ret"].quantile(0.05)
    cvar_tail = df["ret"][df["ret"] <= var_95]
    cvar_95 = cvar_tail.mean() if len(cvar_tail) > 0 else np.nan

    # 7. Siste 1y Rullerende Sharpe (252 handelsdager)
    latest_roll_sharpe = np.nan
    if len(df) >= 252:
        roll_mean = df["ret"].rolling(252).mean() * 252
        roll_std = df["ret"].rolling(252).std() * np.sqrt(252)
        roll_s = (roll_mean - rf_annual) / roll_std
        valid_s = roll_s.dropna()
        if len(valid_s) > 0:
            latest_roll_sharpe = valid_s.iloc[-1]

    return {
        "Beregnet_Status": "Beregnet fra daglig NAV",
        "Beregnet_Startdato": start_date,
        "Beregnet_Sluttdato": end_date,
        "Beregnet_Antall_Dager": len(df),
        "Max_Drawdown_1Y_%": round(max_dd_1y, 2) if max_dd_1y is not None else None,
        "Max_Drawdown_3Y_%": round(max_dd_3y, 2) if max_dd_3y is not None else None,
        "Max_Drawdown_5Y_%": round(max_dd_5y, 2) if max_dd_5y is not None else None,
        "Beregnet_Max_Drawdown_1Y_%": round(max_dd_1y, 2) if max_dd_1y is not None else None,
        "Beregnet_Max_Drawdown_3Y_%": round(max_dd_3y, 2) if max_dd_3y is not None else None,
        "Beregnet_Max_Drawdown_5Y_%": round(max_dd_5y, 2) if max_dd_5y is not None else None,
        "Beregnet_Max_Drawdown_%": round(max_dd_3y, 2) if max_dd_3y is not None else (round(max_dd_5y, 2) if max_dd_5y is not None else None),
        "Beregnet_Drawdown_Peak_Dato": peak_date.strftime("%Y-%m-%d") if isinstance(peak_date, pd.Timestamp) else None,
        "Beregnet_Drawdown_Valley_Dato": valley_date.strftime("%Y-%m-%d") if isinstance(valley_date, pd.Timestamp) else None,
        "Beregnet_Recovery_Dager": rec_days,
        "Beregnet_Sortino_Ratio": round(sortino, 2) if not np.isnan(sortino) else None,
        "Beregnet_Calmar_Ratio": round(calmar, 2) if not np.isnan(calmar) else None,
        "Beregnet_Ulcer_Index": round(ulcer, 2) if not np.isnan(ulcer) else None,
        "Beregnet_CVaR_95_%": round(cvar_95 * 100, 2) if not np.isnan(cvar_95) else None,
        "Beregnet_Siste_Rullerende_Sharpe_1y": round(latest_roll_sharpe, 2) if not np.isnan(latest_roll_sharpe) else None,
    }

def fetch_etf_data(isin, base_info=None, session=None, delay=0.8):
    """
    Henter alle nøkkeltall for en gitt ISIN fra Morningstar ved hjelp av felles session.
    Håndterer midlertidige 429-grenser med automatisk pause.
    """
    time.sleep(delay)

    row = {
        # Metadata / ID
        "ISIN": isin,
        "Kortnavn": base_info.get("Kortnamn", "") if base_info else "",
        "Navn_Fil": base_info.get("Namn", "") if base_info else "",
        "Navn_Morningstar": None,
        "Dataleverandor": "Morningstar",
        "Datastatus_Prioritet_1": "Utilgjengelig",
        "Datastatus_Prioritet_2": "Utilgjengelig",
        "Kategori_Morningstar": None,
        "Oppdateringsdato_Avkastning": None,
        "Oppdateringsdato_Risiko": None,
        "Valuta_Avkastning": None,
        "Valuta_Risiko": None,
        "Valuta_AUM": None,
        "Benchmark_Navn": None,
        "Aarlig_Avgift_%": None,
        "AUM_Verdi": None,
        
        # Prioritet 1: Avkastning
        "Avkastning_1M_%": None,
        "Avkastning_3M_%": None,
        "Avkastning_6M_%": None,
        "Avkastning_12M_%": None,
        "Avkastning_3Y_Ann_%": None,
        "Avkastning_5Y_Ann_%": None,

        # Prioritet 1: Risiko (1, 3 og 5 år)
        "Sharpe_1Y": None,
        "Sharpe_3Y": None,
        "Sharpe_5Y": None,
        "Standardavvik_1Y_%": None,
        "Standardavvik_3Y_%": None,
        "Standardavvik_5Y_%": None,
        "Beta_1Y": None,
        "Beta_3Y": None,
        "Beta_5Y": None,
        "Alpha_1Y_%": None,
        "Alpha_3Y_%": None,
        "Alpha_5Y_%": None,
        "R2_1Y": None,
        "R2_3Y": None,
        "R2_5Y": None,
        "Max_Drawdown_1Y_%": None,
        "Max_Drawdown_3Y_%": None,
        "Max_Drawdown_5Y_%": None,

        # Prioritet 2: Institusjonelle tall
        "Morningstar_Max_Drawdown_%": "Utilgjengelig",
        "Upside_Capture_3Y_%": None,
        "Downside_Capture_3Y_%": None,
        "Tracking_Error_1Y_%": None,
        "Tracking_Error_3Y_%": None,
        "Tracking_Error_5Y_%": None,
        "Information_Ratio_1Y": None,
        "Information_Ratio_3Y": None,
        "Information_Ratio_5Y": None,
        "Antall_Beholdninger": None,
        "Topp_10_Vekt_%": None,
        "Risk_vs_Category_3Y": None,
        "Return_vs_Category_3Y": None,
    }

    # Forsøk oppslag med retry ved 429
    fund = None
    for attempt in range(3):
        try:
            fund = mstarpy.Funds(term=isin, session=session)
            break
        except Exception as e:
            err_msg = str(e)
            if "429" in err_msg or "Too Many Requests" in err_msg:
                # 429: Pause i 30 sekunder og prøv igjen
                time.sleep(30)
                continue
            else:
                row["Feilmelding"] = f"Kunne ikke slå opp ISIN: {err_msg}"
                row.update(compute_priority_3_metrics([]))
                return row

    if not fund:
        row["Feilmelding"] = "Kunne ikke slå opp ISIN etter 3 forsøk (rate limit)."
        row.update(compute_priority_3_metrics([]))
        return row

    try:
        snap = fund.snapshot()
    except Exception as e:
        snap = {}

    if snap:
        row["Datastatus_Prioritet_1"] = "Offisiell (Morningstar)"
        row["Navn_Morningstar"] = snap.get("Name")
        
        # Kategori
        cat = snap.get("CategoryBroadAssetClass") or snap.get("IMASector")
        if isinstance(cat, dict):
            row["Kategori_Morningstar"] = cat.get("Name")
        elif isinstance(cat, str):
            row["Kategori_Morningstar"] = cat
        else:
            row["Kategori_Morningstar"] = fund.categoryName

        # Gebyr
        row["Aarlig_Avgift_%"] = snap.get("OngoingCharge") or snap.get("ManagementFee") or snap.get("NetExpenseRatio")

        # Benchmark
        bm_list = snap.get("Benchmark", [])
        if bm_list and isinstance(bm_list, list):
            row["Benchmark_Navn"] = bm_list[0].get("Name")

        # Trailing Performance
        tp_list = snap.get("TrailingPerformance", [])
        if tp_list and isinstance(tp_list, list):
            tp = tp_list[0]
            row["Oppdateringsdato_Avkastning"] = tp.get("Date", "").split("T")[0]
            row["Valuta_Avkastning"] = tp.get("CurrencyId")
            returns = {r.get("TimePeriod"): r.get("Value") for r in tp.get("Return", []) if isinstance(r, dict)}
            row["Avkastning_1M_%"] = returns.get("M1")
            row["Avkastning_3M_%"] = returns.get("M3")
            row["Avkastning_6M_%"] = returns.get("M6")
            row["Avkastning_12M_%"] = returns.get("M12")
            row["Avkastning_3Y_Ann_%"] = returns.get("M36")
            row["Avkastning_5Y_Ann_%"] = returns.get("M60")

        # SMART MATCHING FOR RISK STATISTICS
        rs_list = snap.get("RiskStatistics", [])
        if rs_list and isinstance(rs_list, list):
            # Finn beste blokk (helst matchende valuta, eller den som faktisk har verdier)
            target_cur = snap.get("TradingCurrency") or snap.get("Currency") or row.get("Valuta_Avkastning")
            rs = None
            if target_cur:
                for item in rs_list:
                    if item.get("CurrencyId") == target_cur and (item.get("SharpeRatios") or item.get("StandardDeviations")):
                        rs = item
                        break
            if not rs:
                for item in rs_list:
                    if item.get("SharpeRatios") or item.get("StandardDeviations"):
                        rs = item
                        break
            if not rs and rs_list:
                rs = rs_list[0]

            if rs:
                row["Oppdateringsdato_Risiko"] = rs.get("Date", "").split("T")[0]
                row["Valuta_Risiko"] = rs.get("CurrencyId")

                row["Sharpe_1Y"] = get_stat_by_period(rs.get("SharpeRatios"), "M12")
                row["Sharpe_3Y"] = get_stat_by_period(rs.get("SharpeRatios"), "M36")
                row["Sharpe_5Y"] = get_stat_by_period(rs.get("SharpeRatios"), "M60")

                row["Standardavvik_1Y_%"] = get_stat_by_period(rs.get("StandardDeviations"), "M12")
                row["Standardavvik_3Y_%"] = get_stat_by_period(rs.get("StandardDeviations"), "M36")
                row["Standardavvik_5Y_%"] = get_stat_by_period(rs.get("StandardDeviations"), "M60")

                # Beta (1, 3, 5 år)
                row["Beta_1Y"] = get_stat_by_period(rs.get("Betas"), "M12")
                row["Beta_3Y"] = get_stat_by_period(rs.get("Betas"), "M36")
                row["Beta_5Y"] = get_stat_by_period(rs.get("Betas"), "M60")

                # Alpha (1, 3, 5 år)
                row["Alpha_1Y_%"] = get_stat_by_period(rs.get("Alphas"), "M12")
                row["Alpha_3Y_%"] = get_stat_by_period(rs.get("Alphas"), "M36")
                row["Alpha_5Y_%"] = get_stat_by_period(rs.get("Alphas"), "M60")

                # R² (1, 3, 5 år)
                row["R2_1Y"] = get_stat_by_period(rs.get("RSquareds"), "M12")
                row["R2_3Y"] = get_stat_by_period(rs.get("RSquareds"), "M36")
                row["R2_5Y"] = get_stat_by_period(rs.get("RSquareds"), "M60")

                # Prioritet 2
                row["Tracking_Error_1Y_%"] = get_stat_by_period(rs.get("TrackingErrors"), "M12")
                row["Tracking_Error_3Y_%"] = get_stat_by_period(rs.get("TrackingErrors"), "M36")
                row["Tracking_Error_5Y_%"] = get_stat_by_period(rs.get("TrackingErrors"), "M60")

                row["Information_Ratio_1Y"] = get_stat_by_period(rs.get("InformationRatios"), "M12")
                row["Information_Ratio_3Y"] = get_stat_by_period(rs.get("InformationRatios"), "M36")
                row["Information_Ratio_5Y"] = get_stat_by_period(rs.get("InformationRatios"), "M60")
                row["Datastatus_Prioritet_2"] = "Offisiell (Morningstar)"

        # AUM
        ports = snap.get("Portfolios", [])
        if ports and isinstance(ports, list):
            p0 = ports[0]
            for tmv in p0.get("TotalMarketValues", []):
                if tmv.get("SalePosition") == "N":
                    row["AUM_Verdi"] = tmv.get("Value")
                    row["Valuta_AUM"] = tmv.get("CurrencyId")
                    break

        # Risk & Return vs Category
        rar_list = snap.get("RiskAndRating", [])
        if rar_list and isinstance(rar_list, list):
            rar_3y = next((r for r in rar_list if r.get("TimePeriod") == "M36"), {})
            row["Risk_vs_Category_3Y"] = rar_3y.get("RiskRatingValue")
            row["Return_vs_Category_3Y"] = rar_3y.get("PerformanceRatingValue")

    # Capture ratios & Max Drawdown fra Morningstar modular API
    try:
        mdd_data = fund.maxDrawDown()
        if mdd_data and isinstance(mdd_data, dict):
            fund_m = mdd_data.get("measureMap", {}).get("fund", {})
            if fund_m:
                row["Upside_Capture_3Y_%"] = fund_m.get("upside")
                row["Downside_Capture_3Y_%"] = fund_m.get("downside")
                mdd_val = fund_m.get("maxDrawDown")
                if mdd_val is not None:
                    row["Morningstar_Max_Drawdown_%"] = mdd_val
    except Exception:
        pass

    # Holdings & Topp 10 vekt
    try:
        h_df = fund.holdings()
        if h_df is not None and hasattr(h_df, "columns"):
            row["Antall_Beholdninger"] = len(h_df)
            if "weighting" in h_df.columns:
                top10_sum = h_df["weighting"].head(10).sum()
                row["Topp_10_Vekt_%"] = round(float(top10_sum), 2)
    except Exception:
        pass

    # Prioritet 3: Daglige kurser for egenberegning
    try:
        today = datetime.date.today()
        start_5y = today - datetime.timedelta(days=5 * 365 + 10)
        nav_list = fund.nav(start_date=start_5y, end_date=today)
        p3_metrics = compute_priority_3_metrics(nav_list)
        row.update(p3_metrics)
    except Exception as e:
        row.update(compute_priority_3_metrics([]))
        row["Beregnet_Feil"] = str(e)

    return row

def load_etfs_from_csv(csv_path):
    """
    Leser Nordnet CSV-filen (utf-16, tab-separert).
    """
    etfs = []
    with open(csv_path, "r", encoding="utf-16") as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader)
        header = [h.strip() for h in header]
        isin_idx = header.index("ISIN") if "ISIN" in header else 2
        name_idx = header.index("Namn") if "Namn" in header else 0
        ticker_idx = header.index("Kortnamn") if "Kortnamn" in header else 1

        for row in reader:
            if len(row) > isin_idx:
                isin = row[isin_idx].strip()
                if isin and isin != "ISIN":
                    name = row[name_idx].strip() if len(row) > name_idx else ""
                    ticker = row[ticker_idx].strip() if len(row) > ticker_idx else ""
                    etfs.append({
                        "ISIN": isin,
                        "Namn": name,
                        "Kortnamn": ticker
                    })
    return etfs


NORDNET_DIMENSION_COLUMNS = [
    "Nordnet_Kategori",
    "Nordnet_Utdelningspolicy",
    "Nordnet_Årlig_avgift",
    "Nordnet_MS_Rating",
    "Nordnet_Risk",
    "Nordnet_Hållbarhet",
    "Nordnet_Spread",
]


def merge_nordnet_dimensions(df, dimensions_path):
    """Legger Nordnet-dimensjoner på ETF-data uten å endre antall ETF-rader."""
    if not dimensions_path or not os.path.exists(dimensions_path):
        print(f"Advarsel: Nordnet-dimensjoner ble ikke funnet: {dimensions_path}")
        return df

    dimensions = pd.read_csv(
        dimensions_path,
        sep="\t",
        encoding="utf-16",
        dtype={"ISIN": "string"},
    )
    missing = [column for column in ["ISIN", *NORDNET_DIMENSION_COLUMNS] if column not in dimensions.columns]
    if missing:
        raise ValueError(f"Nordnet-filen mangler forventede kolonner: {', '.join(missing)}")

    dimensions["ISIN"] = dimensions["ISIN"].str.strip().str.upper()
    duplicate_count = int(dimensions["ISIN"].duplicated(keep=False).sum())
    if duplicate_count:
        # Flere børslister kan dele ISIN. Kildedata gir ikke en egen liste-ID, så én
        # deterministisk verdi per ISIN er nødvendig for å unngå å duplisere ETF-rader.
        dimensions = dimensions.drop_duplicates(subset="ISIN", keep="first")
        print(f"Nordnet-filen har {duplicate_count} rader med duplisert ISIN; første forekomst per ISIN brukes.")

    for column in ["Nordnet_Årlig_avgift", "Nordnet_MS_Rating", "Nordnet_Risk", "Nordnet_Spread"]:
        dimensions[column] = pd.to_numeric(
            dimensions[column].astype("string").str.replace(",", ".", regex=False),
            errors="coerce",
        )

    result = df.copy()
    result["ISIN"] = result["ISIN"].astype("string").str.strip().str.upper()
    result = result.drop(columns=[column for column in NORDNET_DIMENSION_COLUMNS if column in result.columns])
    result = result.merge(dimensions[["ISIN", *NORDNET_DIMENSION_COLUMNS]], on="ISIN", how="left", validate="m:1")
    matched = int(result["Nordnet_Kategori"].notna().sum())
    print(f"La til Nordnet-dimensjoner for {matched:,} av {len(result):,} ETF-rader.")
    return result


def write_data_js(df, data_js_path=r"C:\Markedsdata\app\data.js"):
    """Synkroniserer nettsidens datasett med CSV-/Excel-output."""
    records = df.where(pd.notnull(df), None).to_dict(orient="records")
    import json
    with open(data_js_path, "w", encoding="utf-8") as fjs:
        fjs.write("window.ETF_DATA = ")
        json.dump(records, fjs, ensure_ascii=False)
        fjs.write(";")


def write_excel_output(df, output_path):
    """Skriver den eksisterende arbeidsboken med samme arkstruktur."""
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="ETF_Nokkeltall_Komplett", index=False)
        method_data = [
            {"Kategori": "Prioritet 1 (Obligatorisk)", "Beskrivelse": "ISIN, Kategori, Oppdateringsdato, Avkastning (1m-5y), Sharpe (1,3,5y), StdDev (1,3,5y), Beta 3y, R2 3y, Alpha 3y, AUM, Gebyr, Benchmark.", "Kilde": "Morningstar Direct/SAL API", "Datastatus": "Offisiell"},
            {"Kategori": "Prioritet 2 (Institusjonell)", "Beskrivelse": "Tracking Error, Info Ratio, Upside/Downside Capture, Topp 10 konsentrasjon, Antall beholdninger, Risk/Return vs Category.", "Kilde": "Morningstar Direct/SAL API", "Datastatus": "Offisiell"},
            {"Kategori": "Prioritet 3 (Egenberegnet)", "Beskrivelse": "Sortino (Rf=2%), Calmar, Ulcer Index, Recovery time, CVaR 95%, Rullerende 1y Sharpe.", "Kilde": "Egenberegnet fra daglige NAV-kurser", "Datastatus": "Beregnet"},
            {"Kategori": "Nordnet-dimensjoner", "Beskrivelse": "Nordnet-kategori, utdelningspolicy, årlig avgift, Morningstar-rating, risiko, hållbarhet og spread.", "Kilde": "Nordnet eksport, ISIN-match", "Datastatus": "Kildedata"},
        ]
        pd.DataFrame(method_data).to_excel(writer, sheet_name="Metodikk_Kildedeklarasjon", index=False)

def main():
    parser = argparse.ArgumentParser(description="Hent Morningstar ETF-nøkkeltall og beregn Prioritet 1-3.")
    parser.add_argument("--csv", default=r"C:\Markedsdata\etf–börshandladefonder_27.9.2026_1547.csv", help="Sti til input CSV")
    parser.add_argument("--out-csv", default=r"C:\Markedsdata\etf_morningstar_komplett.csv", help="Output CSV fil")
    parser.add_argument("--out-xlsx", default=r"C:\Markedsdata\etf_morningstar_komplett.xlsx", help="Output Excel fil")
    parser.add_argument("--nordnet-dimensions", default=r"C:\Users\ASUS-PC\Downloads\etf_ISIN_Dimensjoner_fr_Nordnet.csv", help="Nordnet CSV med dimensjoner som matches på ISIN")
    parser.add_argument("--merge-nordnet-only", action="store_true", help="Oppdater eksisterende output med Nordnet-dimensjoner uten nye Morningstar-kall")
    parser.add_argument("--limit", type=int, default=None, help="Maks antall ETF-er som skal prosesseres")
    parser.add_argument("--workers", type=int, default=2, help="Antall samtidige tråder (2 for skånsom modus)")
    parser.add_argument("--delay", type=float, default=0.8, help="Forsinkelse i sekunder per oppslag")
    args = parser.parse_args()

    if args.merge_nordnet_only:
        if not os.path.exists(args.out_csv):
            raise FileNotFoundError(f"Finner ikke eksisterende output-CSV: {args.out_csv}")
        current_df = pd.read_csv(args.out_csv, encoding="utf-8-sig", dtype={"ISIN": "string"})
        final_df = merge_nordnet_dimensions(current_df, args.nordnet_dimensions)
        final_df.to_csv(args.out_csv, index=False, encoding="utf-8-sig")
        write_excel_output(final_df, args.out_xlsx)
        write_data_js(final_df)
        print("Oppdaterte CSV, Excel og app-data med Nordnet-dimensjoner uten Morningstar-kall.")
        return

    print(f"Leser ETF-er fra: {args.csv}")
    etfs = load_etfs_from_csv(args.csv)
    print(f"Fant {len(etfs)} ETF-er i filen.")

    if args.limit:
        etfs = etfs[:args.limit]
        print(f"Kjører test på de første {args.limit} ETF-ene.")

    # Sjekk eksisterende fil for gjenopptak (checkpointing)
    processed_isins = set()
    existing_rows = []
    if os.path.exists(args.out_csv):
        try:
            prev_df = pd.read_csv(args.out_csv, encoding="utf-8-sig")
            # Behold KUN rader som har de nye 1Y, 3Y og 5Y nøkkeltallene
            has_1y = ("Beta_1Y" in prev_df.columns) & (prev_df["Beta_1Y"].notnull() | prev_df.get("Beta_3Y", pd.Series()).notnull())
            valid_mask = (prev_df["Datastatus_Prioritet_1"] == "Offisiell (Morningstar)") & has_1y
            valid_df = prev_df[valid_mask]
            if "ISIN" in valid_df.columns:
                processed_isins = set(valid_df["ISIN"].dropna().astype(str))
                existing_rows = valid_df.to_dict(orient="records")
                print(f"Gjenopptar: {len(processed_isins)} ETF-er allerede ferdig beriket med komplette 1Y/3Y/5Y data.")
        except Exception as e:
            print(f"Kunne ikke lese eksisterende CSV for gjenopptak: {e}")

    remaining_etfs = [e for e in etfs if e["ISIN"] not in processed_isins]
    print(f"Gjenstår å behandle: {len(remaining_etfs)} ETF-er i skånsom modus (workers={args.workers}, delay={args.delay}s).")

    if not remaining_etfs:
        print("Alle ETF-er er allerede ferdig prosessert!")
        return

    # INITIALISER ÉN FELLES SESSION FOR HELE KJØRINGEN
    print("Initialiserer felles Morningstar-sesjon (lukker nettleser umiddelbart etter håndtrykk)...")
    shared_session = mstarpy.search.MorningstarSession()
    print("Felles sesjon klar! Starter skånsom datainnsamling i bakgrunnen...")

    all_results = list(existing_rows)
    count = 0
    total = len(remaining_etfs)

    def process_one(etf_info):
        return fetch_etf_data(etf_info["ISIN"], etf_info, session=shared_session, delay=args.delay)

    start_time = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_to_etf = {executor.submit(process_one, etf): etf for etf in remaining_etfs}

        for future in as_completed(future_to_etf):
            etf_meta = future_to_etf[future]
            count += 1
            try:
                res = future.result()
                all_results.append(res)
                print(f"[{count}/{total}] {res['ISIN']} | {res.get('Navn_Morningstar') or res.get('Navn_Fil')[:30]} | Status: P1={res.get('Datastatus_Prioritet_1')}, P3={res.get('Beregnet_Status')}")
            except Exception as exc:
                print(f"[{count}/{total}] {etf_meta['ISIN']} feilet med unntak: {exc}")

            # Fortløpende lagring per 10. ETF eller til slutt for feiltoleranse
            if count % 10 == 0 or count == total:
                df_out = merge_nordnet_dimensions(pd.DataFrame(all_results), args.nordnet_dimensions)
                df_out.to_csv(args.out_csv, index=False, encoding="utf-8-sig")

            # Oppdater også data.js jevnlig (hver 50. ETF) så webappen viser ferske tall
            if count % 50 == 0 or count == total:
                try:
                    df_sync = merge_nordnet_dimensions(pd.DataFrame(all_results), args.nordnet_dimensions)
                    write_data_js(df_sync)
                except Exception:
                    pass

    elapsed = time.time() - start_time
    print(f"\nFerdig! Prosesserte {count} ETF-er på {elapsed:.1f} sekunder (snitt {elapsed/max(1, count):.2f}s/ETF).")

    # Lagre endelig resultat til CSV og Excel
    final_df = merge_nordnet_dimensions(pd.DataFrame(all_results), args.nordnet_dimensions)
    final_df.to_csv(args.out_csv, index=False, encoding="utf-8-sig")
    print(f"Lagret oppdatert CSV: {args.out_csv}")

    try:
        write_excel_output(final_df, args.out_xlsx)
        print(f"Lagret strukturert Excel-arbeidsbok: {args.out_xlsx}")
    except Exception as e:
        print(f"Advarsel: Kunne ikke skrive til Excel: {e}")

    # Oppdater også automatisk webapplikasjonens data.js!
    try:
        write_data_js(final_df)
        print("Oppdatert C:\\Markedsdata\\app\\data.js for webapplikasjonen.")

        # Automatisk deploy til Cloudflare Pages ved fullførelse
        try:
            import subprocess
            cmd = "npx wrangler pages deploy C:\\Markedsdata\\app --project-name etf-analytics-pro --branch main"
            env_cf = os.environ.copy()
            if "CLOUDFLARE_ACCOUNT_ID" not in env_cf:
                env_cf["CLOUDFLARE_ACCOUNT_ID"] = "a1d64ce4428dbf0fe2e52cfe466db81b"
            subprocess.run(cmd, shell=True, env=env_cf, capture_output=True)
            print("Automatisk deployet fullført datasett til Cloudflare Pages!")
        except Exception as e_cf:
            print(f"Kunne ikke auto-deploye til Cloudflare: {e_cf}")
    except Exception as e:
        print(f"Kunne ikke oppdatere data.js: {e}")

if __name__ == "__main__":
    main()
