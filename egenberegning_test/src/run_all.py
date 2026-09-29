"""Full kjoringer for hele universet (isin_mapping_full.csv, ~2222 ETF-er).

Samme logikk som run_test.py, men:
  - ingen sample-limit
  - checkpoint hver 50. rad til output/egen_full_checkpoint.csv (avbrudd = bare a fortsette)
  - 0,2s pause mellom tickere (hensyn til Yahoo)
  - sluttresultat: output/egen_full.csv + output/sammenligning_full.csv (mot Morningstar)

Nettverk er sjelden flaskehals ved omkjoring: cachen gjor at kun manglende
rader hentes. Forste fulle nedlasting tar likevel 1-2 timer (Yahoo-tempo).

Kjoring: python src/run_all.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import cache
import fx
from compute_metrics import metrics_absolute, metrics_relative
from fetch_indices import fetch_msci
from fetch_prices import fetch_price

with open(ROOT / "config.json", encoding="utf-8") as f:
    CFG = json.load(f)

BASE_CCY = CFG.get("base_currency", "EUR")
MAX_AGE = int(CFG.get("max_age_days", 4))
MAP_FULL = ROOT / "isin_mapping_full.csv"
OUT_EGEN = ROOT / "output" / "egen_full.csv"
OUT_CHECKPOINT = ROOT / "output" / "egen_full_checkpoint.csv"
OUT_SAMMEN = ROOT / "output" / "sammenligning_full.csv"

MS_COLS = [
    "ISIN", "Kortnavn", "Navn_Morningstar", "Kategori_Morningstar", "Benchmark_Navn",
    "Avkastning_12M_%", "Avkastning_3Y_Ann_%", "Avkastning_5Y_Ann_%",
    "Sharpe_1Y", "Sharpe_3Y", "Sharpe_5Y", "Standardavvik_1Y_%", "Standardavvik_3Y_%",
    "Standardavvik_5Y_%", "Beta_1Y", "Beta_3Y", "Beta_5Y", "Alpha_3Y_%", "R2_3Y",
    "Tracking_Error_3Y_%", "Information_Ratio_3Y",
]


def pct_diff(a, b):
    try:
        if a is None or b is None or pd.isna(a) or pd.isna(b):
            return None
        return round(float(a) - float(b), 2)
    except (TypeError, ValueError):
        return None


def process_row(m, idx_by_bm, ms) -> dict:
    isin = m["ISIN"]
    rec: dict = {"ISIN": isin, "Kortnavn": m.get("Kortnavn", ""), "Kilde": None, "Feil": None}
    try:
        px, src = fetch_price(
            m.get("Stooq_Ticker", ""), m.get("Yahoo_Ticker", ""),
            tuple(CFG.get("price_source_priority", ["yahoo", "stooq"])),
            CFG.get("yahoo_period", "5y"), MAX_AGE,
        )
        quote_ccy = (m.get("Valuta_Ticker", "") or "").strip()
        px, fx_note = fx.normalize(px, quote_ccy, BASE_CCY, CFG.get("yahoo_period", "5y"), MAX_AGE)
        rec["Kilde"] = src
        rec["Egen_Valuta"] = BASE_CCY
        rec["Egen_FX"] = fx_note
        rec.update(metrics_absolute(px, CFG.get("risk_free_annual", 0.02), CFG.get("trading_days", 252)))
    except Exception as e:
        rec["Feil"] = f"Prisfeil: {e}"
        return rec
    try:
        bm_rows = ms.loc[ms["ISIN"] == isin, "Benchmark_Navn"].dropna().tolist()
        bm = bm_rows[0] if bm_rows else ""
        im = idx_by_bm.get(bm)
        no_map = im is None or (hasattr(im, "empty") and im.empty)
        status = str(im.get("Status", "")) if not no_map else ""
        if no_map or status == "HOPP OVER":
            rec["Egen_Rel_Status"] = "Hoppet over (ingen relevant indeks)"
        elif status == "MANUELL":
            rec["Egen_Rel_Status"] = "MANUELL: finn fondets indeks paa justETF"
        elif str(im.get("MSCI_Kode", "")).strip():
            code = str(im.get("MSCI_Kode")).strip()
            variant = str(im.get("MSCI_Variant", "")).strip() or "NETR"
            bench = fetch_msci(code, str(px["date"].min().date()), str(px["date"].max().date()), variant)
            bench, bfx = fx.normalize(bench, "USD", BASE_CCY, CFG.get("yahoo_period", "5y"), MAX_AGE)
            rec["Bench_Kilde"] = f"msci:{code}/{variant}"
            rec["Bench_FX"] = bfx
            rec.update(metrics_relative(px, bench))
        elif not im.get("Forslag_Stooq_Ticker", "").strip() and not im.get("Forslag_Yahoo_Ticker", "").strip():
            rec["Egen_Rel_Status"] = "Ingen indeks-ticker i index_mapping.csv"
        else:
            bench, bsrc = fetch_price(
                im.get("Forslag_Stooq_Ticker", ""), im.get("Forslag_Yahoo_Ticker", ""),
                tuple(CFG.get("price_source_priority", ["yahoo", "stooq"])),
                CFG.get("yahoo_period", "5y"), MAX_AGE,
            )
            bench, bfx = fx.normalize(bench, (im.get("Valuta", "") or "").strip(), BASE_CCY,
                                      CFG.get("yahoo_period", "5y"), MAX_AGE)
            rec["Bench_Kilde"] = bsrc
            rec["Bench_FX"] = bfx
            rec.update(metrics_relative(px, bench))
    except Exception as e:
        rec["Egen_Rel_Status"] = f"Indeksfeil: {e}"
    return rec


def main() -> None:
    t0 = time.time()
    cache.reset_net()
    mapping = pd.read_csv(MAP_FULL, dtype=str).fillna("")
    mapping = mapping[mapping["Yahoo_Ticker"] != ""].copy()
    idxmap = pd.read_csv(ROOT / "index_mapping.csv", dtype=str).fillna("")
    idx_by_bm = {r["Benchmark_Navn"]: r for _, r in idxmap.iterrows()}
    ms = pd.read_csv(CFG["morningstar_csv"], encoding="utf-8-sig", dtype={"ISIN": "string"}, low_memory=False)

    done: set[str] = set()
    rows: list[dict] = []
    if OUT_CHECKPOINT.exists():
        try:
            prev = pd.read_csv(OUT_CHECKPOINT, dtype=str).fillna("")
            # Bare ISIN-er med vellykket prisnedlasting hoppes over (Feil tom + Kilde satt)
            ok_prev = prev[(prev["Feil"] == "") & (prev["Kilde"] != "")]
            done = set(ok_prev["ISIN"].tolist())
            rows = prev.to_dict(orient="records")
            print(f"Fortsetter: {len(done)} ferdige fra checkpoint, {len(mapping) - len(done)} gjenstaar.")
        except Exception as e:
            print(f"Kunne ikke lese checkpoint ({e}), starter fra scratch.")

    todo = [m for _, m in mapping.iterrows() if m["ISIN"] not in done]
    print(f"Totalt: {len(mapping)} rader, skal prosessere {len(todo)}.")
    for i, m in enumerate(todo, start=1):
        rec = process_row(m, idx_by_bm, ms)
        rows = [r for r in rows if r.get("ISIN") != rec["ISIN"]]  # erstatt gammel rad ved retry
        rows.append(rec)
        n_done = len(rows)
        if i % 10 == 0 or i == len(todo):
            el = time.time() - t0
            print(f"[{n_done}/{len(mapping)}] {rec['ISIN']} {rec.get('Kilde') or rec.get('Feil')} "
                  f"| Beta={rec.get('Egen_Beta')} | nett={len(cache.NET_CALLS)} | {el:.0f}s")
        if n_done % 50 == 0:
            pd.DataFrame(rows).to_csv(OUT_CHECKPOINT, index=False, encoding="utf-8-sig")
        time.sleep(0.5)

    egen = pd.DataFrame(rows).replace("", pd.NA)
    egen.to_csv(OUT_EGEN, index=False, encoding="utf-8-sig")
    keep = [c for c in MS_COLS if c in ms.columns]
    out = egen.merge(ms[keep].drop_duplicates(subset="ISIN"), on="ISIN", how="left", suffixes=("", "_MS"))
    for e_col, ms_col in [("Egen_Avkastning_12M_%", "Avkastning_12M_%"),
                          ("Egen_Avkastning_3Y_Ann_%", "Avkastning_3Y_Ann_%"),
                          ("Egen_Sharpe_1Y", "Sharpe_1Y"), ("Egen_Sharpe_3Y", "Sharpe_3Y"),
                          ("Egen_Stdavvik_1Y_%", "Standardavvik_1Y_%"),
                          ("Egen_Beta_1Y", "Beta_1Y"), ("Egen_Beta", "Beta_3Y"), ("Egen_Beta_5Y", "Beta_5Y")]:
        if e_col in out.columns and ms_col in out.columns:
            out[f"Diff_{e_col.replace('Egen_', '')}"] = [pct_diff(a, b) for a, b in zip(out[e_col], out[ms_col])]
    out.to_csv(OUT_SAMMEN, index=False, encoding="utf-8-sig")
    el = time.time() - t0
    ok = int(egen["Kilde"].notna().sum())
    rel = int(egen["Egen_Beta"].notna().sum())
    print(f"\nFerdig paa {el:.0f}s: {ok}/{len(egen)} med priser, {rel} med Beta, "
          f"{len(cache.NET_CALLS)} nettverkskall.")
    print(f"Skrev {OUT_EGEN} og {OUT_SAMMEN}")


if __name__ == "__main__":
    main()
