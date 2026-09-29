"""Orkestrerer testen: henter priser + indeks, regner egne tall, sammenligner mot Morningstar-CSV.

Skriver kun til output/ i denne mappa. Rører aldri ../app eller Morningstar-fila.
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

MS_COLS = [
    "ISIN", "Kortnavn", "Navn_Morningstar", "Kategori_Morningstar", "Benchmark_Navn",
    "Avkastning_1M_%", "Avkastning_3M_%", "Avkastning_6M_%", "Avkastning_12M_%",
    "Avkastning_3Y_Ann_%", "Avkastning_5Y_Ann_%", "Sharpe_1Y", "Sharpe_3Y",
    "Standardavvik_1Y_%", "Standardavvik_3Y_%", "Beta_3Y", "Alpha_3Y_%", "R2_3Y",
]


def pct_diff(egen: float | None, ms: float | None) -> float | None:
    try:
        if egen is None or ms is None or pd.isna(egen) or pd.isna(ms):
            return None
        return round(float(egen) - float(ms), 2)
    except (TypeError, ValueError):
        return None


def main() -> None:
    t0 = time.time()
    cache.reset_net()
    mapping = pd.read_csv(ROOT / "isin_mapping.csv", dtype=str).fillna("")
    idxmap = pd.read_csv(ROOT / "index_mapping.csv", dtype=str).fillna("")
    idx_by_bm = {r["Benchmark_Navn"]: r for _, r in idxmap.iterrows()}

    try:
        ms = pd.read_csv(CFG["morningstar_csv"], encoding="utf-8-sig", dtype={"ISIN": "string"}, low_memory=False)
    except FileNotFoundError:
        print(f"Finner ikke Morningstar-CSV: {CFG['morningstar_csv']}")
        sys.exit(1)
    ms = ms[ms["ISIN"].isin(mapping["ISIN"].tolist())]

    rows: list[dict] = []
    todo = mapping.head(int(CFG.get("sample_limit", 10)))
    for _, m in todo.iterrows():
        isin = m["ISIN"]
        print(f"\n-- {isin} {m['Kortnavn']} (stooq='{m['Stooq_Ticker']}' yahoo='{m['Yahoo_Ticker']}')")
        rec: dict = {"ISIN": isin, "Kilde": None, "Feil": None}
        if not m["Stooq_Ticker"].strip() and not m["Yahoo_Ticker"].strip():
            rec["Feil"] = "Ingen ticker utfylt – kjør lookup_ticker.py og fyll inn isin_mapping.csv"
            print(f"   {rec['Feil']}")
            rows.append(rec)
            continue
        try:
            px, src = fetch_price(
                m["Stooq_Ticker"], m["Yahoo_Ticker"],
                tuple(CFG.get("price_source_priority", ["yahoo", "stooq"])),
                CFG.get("yahoo_period", "5y"), MAX_AGE,
            )
            quote_ccy = m.get("Valuta_Ticker", "").strip() or m.get("Valuta", "").strip()
            px, fx_note = fx.normalize(px, quote_ccy, BASE_CCY, CFG.get("yahoo_period", "5y"), MAX_AGE)
            rec["Kilde"] = src
            rec["Egen_Valuta"] = BASE_CCY
            rec["Egen_FX"] = fx_note
            rec.update(metrics_absolute(px, CFG.get("risk_free_annual", 0.02), CFG.get("trading_days", 252)))
            print(f"   Priser: {len(px)} dager via {src} | FX={fx_note} | Avk12M={rec.get('Egen_Avkastning_12M_%')} Sharpe1Y={rec.get('Egen_Sharpe_1Y')}")
        except Exception as e:
            rec["Feil"] = f"Prisfeil: {e}"
            print(f"   {rec['Feil']}")
            rows.append(rec)
            continue
        # Relativ del mot proxy-indeks (hopp over leveraged)
        try:
            bm = ms.loc[ms["ISIN"] == isin, "Benchmark_Navn"].dropna().tolist()
            bm = bm[0] if bm else ""
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
                try:
                    bench = fetch_msci(code, str(px["date"].min().date()), str(px["date"].max().date()), variant)
                    bsrc = f"msci:{code}/{variant}"
                    bench, bfx = fx.normalize(bench, "USD", BASE_CCY, CFG.get("yahoo_period", "5y"), MAX_AGE)
                    rec["Bench_Kilde"] = bsrc
                    rec["Bench_FX"] = bfx
                    rec.update(metrics_relative(px, bench))
                    print(f"   Indeks: {bsrc} FX={bfx} | Beta={rec.get('Egen_Beta')} TE={rec.get('Egen_TE_Ann_%')}")
                except Exception as e:
                    rec["Egen_Rel_Status"] = f"MSCI-feil: {e}"
                    print(f"   {rec['Egen_Rel_Status']}")
            elif not im.get("Forslag_Stooq_Ticker", "").strip() and not im.get("Forslag_Yahoo_Ticker", "").strip():
                rec["Egen_Rel_Status"] = "Ingen indeks-ticker i index_mapping.csv"
            else:
                bench, bsrc = fetch_price(
                    im.get("Forslag_Stooq_Ticker", ""), im.get("Forslag_Yahoo_Ticker", ""),
                    tuple(CFG.get("price_source_priority", ["yahoo", "stooq"])),
                    CFG.get("yahoo_period", "5y"), MAX_AGE,
                )
                bench, bfx = fx.normalize(bench, im.get("Valuta", "").strip(), BASE_CCY, CFG.get("yahoo_period", "5y"), MAX_AGE)
                rec["Bench_Kilde"] = bsrc
                rec["Bench_FX"] = bfx
                rec.update(metrics_relative(px, bench))
                print(f"   Indeks: {bsrc} FX={bfx} | Beta={rec.get('Egen_Beta')} TE={rec.get('Egen_TE_Ann_%')}")
        except Exception as e:
            rec["Egen_Rel_Status"] = f"Indeksfeil: {e}"
            print(f"   {rec['Egen_Rel_Status']}")
        rows.append(rec)

    egen = pd.DataFrame(rows)
    keep = [c for c in MS_COLS if c in ms.columns]
    out = egen.merge(ms[keep], on="ISIN", how="left", suffixes=("", "_MS"))
    for e_col, ms_col in [("Egen_Avkastning_12M_%", "Avkastning_12M_%"), ("Egen_Sharpe_1Y", "Sharpe_1Y"),
                          ("Egen_Stdavvik_1Y_%", "Standardavvik_1Y_%"), ("Egen_Beta", "Beta_3Y")]:
        if e_col in out.columns and ms_col in out.columns:
            out[f"Diff_{e_col.replace('Egen_', '')}"] = [pct_diff(a, b) for a, b in zip(out[e_col], out[ms_col])]

    out_path = ROOT / CFG.get("output_csv", "output/sammenligning.csv")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"\nFerdig på {time.time() - t0:.1f}s. Skrev {len(out)} rader til {out_path}")
    print(f"Nettverkskall denne kjøringen: {len(cache.NET_CALLS)}")
    if not cache.NET_CALLS:
        print("   -> fullt cache-treff, ingen data hentet fra nettet.")
    print("Kolonner med Diff_ viser egen verdi minus Morningstar-verdi (forvent avvik, se README).")


if __name__ == "__main__":
    main()
