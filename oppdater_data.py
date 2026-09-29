"""
Hovedoppdateringsskript for ETF Analytics Pro.
Kjøres lokalt eller via GitHub Actions for daglig markedsoppdatering:
1. (Valgfritt) Henter ferske sluttkurser fra Yahoo Finance (inkrementelt via cache).
2. Bygger full leveranse med egenberegninger og bevarte Nordnet-dimensjoner.
3. Synkroniserer kompakte kursfiler og teknisk analyse for webapplikasjonen.
4. Eksporterer oppdatert data.js til appen.
"""
from __future__ import annotations

import io
import sys
import time
import subprocess
from pathlib import Path

# Unngå encoding-feil på Windows-konsoll (cp1252)
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent

def run_step(step_name: str, script_rel_path: str, args: list[str] | None = None) -> bool:
    print(f"\n==================================================")
    print(f"[*] STEG: {step_name}")
    print(f"Kjører: {script_rel_path}")
    print(f"==================================================")
    t0 = time.time()
    cmd = [sys.executable, str(ROOT / script_rel_path)]
    if args:
        cmd.extend(args)
    res = subprocess.run(cmd, cwd=str(ROOT))
    dt = round(time.time() - t0, 1)
    if res.returncode != 0:
        print(f"[!] FEIL i steg '{step_name}' (feilkode {res.returncode}) etter {dt}s")
        return False
    print(f"[OK] Fullført '{step_name}' på {dt}s")
    return True

def main():
    start_total = time.time()
    print("--- Starter ETF Analytics Pro oppdateringspipeline ---")

    # Hvis man sender med --fetch-prices, oppdateres priser først via run_all.py
    if "--fetch-prices" in sys.argv:
        ok = run_step(
            "Hent kurser og beregn nøkkeltall",
            "egenberegning_test/src/run_all.py"
        )
        if not ok:
            sys.exit(1)

    # Steg 1: Bygg leveransefil fra beregningene
    ok = run_step(
        "Bygg Leveransefil (Egenberegning + Nordnet)",
        "egenberegning_test/src/build_leverance.py"
    )
    if not ok:
        sys.exit(1)

    # Steg 2: Synkroniser kursgrafer, sparklines og tekniske indikatorer
    ok = run_step(
        "Synkroniser Tekniske Kursdata & Sparklines",
        "app/sync_prices_for_app.py"
    )
    if not ok:
        sys.exit(1)

    # Steg 3: Eksporter til webappens data.js
    ok = run_step(
        "Eksporter til app/data.js",
        "export_leveranse_to_app.py"
    )
    if not ok:
        sys.exit(1)

    total_time = round(time.time() - start_total, 1)
    print(f"\n[OK] Fullført på {total_time}s! Webappen er oppdatert med ferske data.")

if __name__ == "__main__":
    main()
