"""
Synkroniserer tilgjengelige kursfiler fra egenberegning_test/data/prices
til kompakte JSON-filer i app/prices/ for lynrask innlasting i TradingView-grafen.
Beregner også sparklines og tekniske nivåer (ATH, SMA50, SMA200, 52W).
"""
import os
import json
import pandas as pd
import numpy as np
from pathlib import Path

BASE_DIR = Path(r"C:\Markedsdata")
PRICES_SRC = BASE_DIR / "egenberegning_test" / "data" / "prices"
MAPPING_FILE = BASE_DIR / "egenberegning_test" / "mapping_progress.csv"
OUT_DIR = BASE_DIR / "app" / "prices"

def run_sync():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Les mapping
    mapping = {}
    if MAPPING_FILE.exists():
        df_map = pd.read_csv(MAPPING_FILE, dtype=str)
        for _, row in df_map.iterrows():
            isin = row.get("ISIN")
            ytick = row.get("Yahoo_Ticker")
            kort = row.get("Kortnavn")
            if isin and pd.notna(ytick):
                file_stem = str(ytick).replace(".", "_").replace("^", "_").upper()
                mapping[file_stem] = {
                    "isin": isin.strip(),
                    "ticker": ytick.strip(),
                    "kortnavn": str(kort) if pd.notna(kort) else "",
                    "navn": str(row.get("Navn_Morningstar") or "")
                }
    
    manifest = {}
    synced_count = 0
    
    # 2. Behandle alle kursfiler i prices mappen
    if PRICES_SRC.exists():
        for csv_path in PRICES_SRC.glob("*.csv"):
            stem = csv_path.stem.upper()
            try:
                df = pd.read_csv(csv_path)
                if "date" not in df.columns or "adj_close" not in df.columns:
                    continue
                
                df = df.dropna(subset=["date", "adj_close"]).sort_values("date")
                if len(df) < 5:
                    continue
                
                records = []
                values = []
                for _, r in df.iterrows():
                    d_str = str(r["date"]).split(" ")[0].split("T")[0]
                    p_val = round(float(r["adj_close"]), 4)
                    records.append({"time": d_str, "value": p_val})
                    values.append(p_val)
                
                info = mapping.get(stem, {})
                isin = info.get("isin")
                target_id = isin if isin else stem
                
                last_price = records[-1]["value"]
                
                # Beregn tekniske nivåer
                ath = max(values)
                pct_ath = round(((last_price - ath) / ath) * 100, 2) if ath > 0 else 0.0
                
                # 52-ukers spenn (siste 252 punkter)
                last_252 = values[-252:]
                h52w_high = max(last_252)
                h52w_low = min(last_252)
                
                # SMA 50 og 200
                sma50 = round(sum(values[-50:]) / 50, 2) if len(values) >= 50 else None
                sma200 = round(sum(values[-200:]) / 200, 2) if len(values) >= 200 else None
                above_sma50 = (last_price >= sma50) if sma50 is not None else None
                above_sma200 = (last_price >= sma200) if sma200 is not None else None
                
                # Sparkline: 24 jevnt fordelte punkter fra siste år (eller hele serien)
                sample_source = last_252 if len(values) >= 252 else values
                if len(sample_source) > 24:
                    indices = np.linspace(0, len(sample_source) - 1, 24, dtype=int)
                    sparkline = [round(sample_source[i], 2) for i in indices]
                else:
                    sparkline = [round(v, 2) for v in sample_source]
                
                payload = {
                    "id": target_id,
                    "isin": isin or "",
                    "ticker": info.get("ticker", stem),
                    "name": info.get("navn", stem),
                    "currency": "EUR",
                    "count": len(records),
                    "first_date": records[0]["time"],
                    "last_date": records[-1]["time"],
                    "last_price": last_price,
                    "ath": ath,
                    "pct_ath": pct_ath,
                    "sma50": sma50,
                    "sma200": sma200,
                    "above_sma200": above_sma200,
                    "h52w_high": h52w_high,
                    "h52w_low": h52w_low,
                    "sparkline": sparkline,
                    "data": records
                }
                
                out_file = OUT_DIR / f"{target_id}.json"
                with open(out_file, "w", encoding="utf-8") as f:
                    json.dump(payload, f, separators=(",", ":"))
                
                manifest[target_id] = {
                    "ticker": payload["ticker"],
                    "isin": isin or "",
                    "count": payload["count"],
                    "last_price": last_price,
                    "last_date": payload["last_date"],
                    "ath": ath,
                    "pct_ath": pct_ath,
                    "above_sma200": above_sma200,
                    "above_sma50": above_sma50,
                    "h52w_high": h52w_high,
                    "h52w_low": h52w_low,
                    "sparkline": sparkline
                }
                synced_count += 1
            except Exception as e:
                pass
                
    # Skriv manifest
    with open(OUT_DIR / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, separators=(",", ":"))
        
    print(f"Synkronisert {synced_count} kursserier og tekniske data til {OUT_DIR}")

if __name__ == "__main__":
    run_sync()
