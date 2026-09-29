"""Bygger full ISIN -> Yahoo-ticker-mapping for hele universet.

Strategi (verifisert paa stikkprove 60/60): Nordnet-Kortnavn er Xetra-tickere,
saa kandidaten er {Kortnavn}.DE. Hver kandidat verifiseres:
  1. Eksistens: batch-nedlasting 1 mnd via yf.download (raskt).
  2. Valuta: fast_info per ticker (tregt, men engangsjobb – lagres underveis,
     kan gjenopptas med samme kommando).
  3. Kryssjekk: der Morningstar har EUR-tall og vi har 12M-historikk, flagges
     avvik > 12pp til manuell review (feil fond = vill avkastningsdiff).

Kjoring:
  python src/build_mapping.py --step exist     (raskt, faa minutter)
  python src/build_mapping.py --step ccy       (tregt, ~30 min, gjenopptakbar)
  python src/build_mapping.py --step check     (kryssjekk + endelig fil)
  python src/build_mapping.py --step all       (alt i ett, med resume)

Skriver: mapping_progress.csv (arbeidsfil) og isin_mapping_full.csv (resultat).
Rorer aldri isin_mapping.csv (de 10 testradene) eller noe utenfor denne mappa.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

MS_CSV = Path(r"C:\Markedsdata\etf_morningstar_komplett.csv")
PROGRESS = ROOT / "mapping_progress.csv"
OUT_FULL = ROOT / "isin_mapping_full.csv"

DIFF_GRENSE_PP = 12.0


def last_universe() -> pd.DataFrame:
    ms = pd.read_csv(MS_CSV, encoding="utf-8-sig", dtype={"ISIN": str}, low_memory=False,
                     usecols=["ISIN", "Kortnavn", "Navn_Morningstar", "Valuta_Avkastning", "Avkastning_12M_%"])
    ms["Kortnavn"] = ms["Kortnavn"].fillna("").str.strip()
    ms = ms[ms["Kortnavn"] != ""].copy()
    # En rad per ISIN (faa duplikater i kildedata – forste Kortnavn vinner)
    ms["n_kort"] = ms.groupby("ISIN")["Kortnavn"].transform("nunique")
    ms["dup_note"] = ms["n_kort"].apply(lambda n: "Dublett-ISIN i kildedata" if n > 1 else "")
    ms = ms.drop_duplicates(subset="ISIN", keep="first").reset_index(drop=True)
    ms["Yahoo_Ticker"] = ms["Kortnavn"] + ".DE"
    ms["Stooq_Ticker"] = ms["Yahoo_Ticker"].str.lower()
    return ms


def step_exist(df: pd.DataFrame) -> pd.DataFrame:
    import yfinance as yf
    tickers = df["Yahoo_Ticker"].tolist()
    found: dict[str, bool] = {}
    for i in range(0, len(tickers), 200):
        chunk = tickers[i:i + 200]
        try:
            dl = yf.download(chunk, period="1mo", progress=False, threads=True, auto_adjust=False)
        except Exception as e:
            print(f"   chunk {i}-{i + len(chunk)} feilet ({str(e)[:80]}), prover enkeltvis senere")
            for t in chunk:
                found[t] = False
            continue
        for t in chunk:
            try:
                col = dl[("Close", t)] if ("Close", t) in dl.columns else None
                found[t] = col is not None and int(col.dropna().shape[0]) > 10
            except Exception:
                found[t] = False
        print(f"   eksistens {min(i + 200, len(tickers))}/{len(tickers)}")
        time.sleep(1)
    df["Exists"] = df["Yahoo_Ticker"].map(found).fillna(False).astype(bool)
    return df


def step_ccy(df: pd.DataFrame, sleep: float = 0.4) -> pd.DataFrame:
    import yfinance as yf
    if "Valuta_Ticker" not in df.columns:
        df["Valuta_Ticker"] = ""
    todo = df[(df["Exists"]) & (df["Valuta_Ticker"] == "")].copy()
    print(f"   valuta: {len(todo)} tickere gjenstaar (av {len(df)})")
    done = 0
    for _, r in todo.iterrows():
        try:
            ccy = yf.Ticker(r["Yahoo_Ticker"]).fast_info.get("currency") or ""
            df.loc[df["ISIN"] == r["ISIN"], "Valuta_Ticker"] = str(ccy).upper()
        except Exception as e:
            msg = str(e)
            if "429" in msg or "Rate limited" in msg:
                print("   RATE-LIMIT – stopper, kjør samme kommando igjen senere for aa fortsette.")
                break
            df.loc[df["ISIN"] == r["ISIN"], "Valuta_Ticker"] = "FEIL"
        done += 1
        if done % 50 == 0:
            df.to_csv(PROGRESS, index=False, encoding="utf-8-sig")
            print(f"   valuta {done}/{len(todo)} (lagret underveis)")
        time.sleep(sleep)
    df.to_csv(PROGRESS, index=False, encoding="utf-8-sig")
    return df


def step_check(df: pd.DataFrame) -> pd.DataFrame:
    import yfinance as yf
    df["Status"] = "OK"
    df["Kommentar"] = df.get("dup_note", "")
    df.loc[~df["Exists"], "Status"] = "REVIEW"
    df.loc[~df["Exists"], "Kommentar"] = df.loc[~df["Exists"], "Kommentar"] + " Ticker finnes ikke paa Yahoo – sok manuelt."
    # Kryssjekk avkastning der MS har EUR-tall
    sub = df[(df["Exists"]) & (df["Valuta_Avkastning"] == "EUR") & (df["Avkastning_12M_%"].notna())].copy()
    print(f"   kryssjekk: {len(sub)} rader med MS EUR-12M")
    rets: dict[str, float] = {}
    tickers = sub["Yahoo_Ticker"].tolist()
    for i in range(0, len(tickers), 200):
        chunk = tickers[i:i + 200]
        try:
            dl = yf.download(chunk, period="13mo", progress=False, threads=True, auto_adjust=False)
        except Exception:
            continue
        for t in chunk:
            try:
                s = dl[("Adj Close", t)].dropna() if ("Adj Close", t) in dl.columns else pd.Series(dtype=float)
                if len(s) > 200:
                    rets[t] = float(s.iloc[-1] / s.iloc[-252] - 1) * 100
            except Exception:
                pass
        print(f"   kryssjekk-nedlasting {min(i + 200, len(tickers))}/{len(tickers)}")
        time.sleep(1)
    df["Egen_Avk12M_EUR"] = df["Yahoo_Ticker"].map(rets)
    ms12 = pd.to_numeric(df["Avkastning_12M_%"], errors="coerce")
    mask = df["Egen_Avk12M_EUR"].notna() & ms12.notna()
    diff = (df.loc[mask, "Egen_Avk12M_EUR"] - ms12.loc[mask]).abs()
    bad = diff[diff > DIFF_GRENSE_PP].index
    df.loc[bad, "Status"] = "REVIEW"
    df.loc[bad, "Kommentar"] = (
        df.loc[bad, "Kommentar"] + " Avvik >12pp mot MS (egen "
        + df.loc[bad, "Egen_Avk12M_EUR"].round(1).astype(str) + " vs MS "
        + ms12.loc[bad].round(1).astype(str) + ") – verifiser at ticker er riktig fond."
    )
    print(f"   kryssjekk: {len(bad)} rader flagget til review av {(mask).sum()} sjekkede")
    return df


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--step", default="all", choices=["all", "exist", "ccy", "check"])
    ap.add_argument("--sleep", type=float, default=0.4)
    args = ap.parse_args()

    if PROGRESS.exists() and args.step in ("all", "ccy", "check"):
        df = pd.read_csv(PROGRESS, dtype=str).fillna("")
        df["Exists"] = df["Exists"].map({"True": True, "False": False, True: True, False: False}).fillna(False).astype(bool)
        print(f"Fortsetter fra {PROGRESS} ({len(df)} rader)")
    else:
        df = last_universe()
        print(f"Univers: {len(df)} unike ISIN-er")

    if args.step in ("all", "exist"):
        if "Exists" not in df.columns or not df["Exists"].any():
            df = step_exist(df)
            df.to_csv(PROGRESS, index=False, encoding="utf-8-sig")
        else:
            print("Hopper over exist (allerede gjort)")

    if args.step in ("all", "ccy"):
        df = step_ccy(df, sleep=args.sleep)

    if args.step in ("all", "check"):
        df = step_check(df)
        cols = ["ISIN", "Kortnavn", "Navn_Morningstar", "Stooq_Ticker", "Yahoo_Ticker",
                "Valuta_Ticker", "Status", "Kommentar"]
        df[cols].to_csv(OUT_FULL, index=False, encoding="utf-8-sig")
        print(f"\nSkrev {OUT_FULL}: {(df['Status'] == 'OK').sum()} OK, {(df['Status'] == 'REVIEW').sum()} REVIEW")

    df.to_csv(PROGRESS, index=False, encoding="utf-8-sig")


if __name__ == "__main__":
    main()
