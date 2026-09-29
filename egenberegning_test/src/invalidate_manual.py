"""Tvinger ny beregning av relativtall for rader som sto som MANUELL.

run_all hopper over ISIN-er som allerede er i checkpoint (Feil tom + Kilde
satt), saa rader med Egen_Rel_Status = "MANUELL: ..." maa fjernes for aa
faa en ny indeks-mapping foert beregnet. Priser/FX ligger i cache, saa dette
koster bare indeks-nedlasting + beregning.

Med argument: python src/invalidate_manual.py "EUR Government Bond,EUR Corporate Bond"
  -> fjerner alle rader i de oppgitte Benchmark_Navn-kategoriene (rekalculering
     etter at proxy-indeksen er byttet).

Kjoerer: python src/invalidate_manual.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CP = ROOT / "output" / "egen_full_checkpoint.csv"

PREFIXES = ("MANUELL", "Ingen indeks-ticker")


def main() -> None:
    if not CP.exists():
        print("Ingen checkpoint – ingenting aa gjore.")
        return
    df = pd.read_csv(CP, dtype=str).fillna("")
    args = [a.strip() for arg in sys.argv[1:] for a in arg.split(",") if a.strip()]

    if args:
        # Finn ISIN-ene i de oppgitte kategoriene via sammenligningsfilen
        sammen = pd.read_csv(ROOT / "output" / "sammenligning_full.csv",
                             encoding="utf-8-sig", dtype=str, low_memory=False)
        isin = set(sammen[sammen["Benchmark_Navn"].isin(args)]["ISIN"].dropna())
        mask = df["ISIN"].isin(isin)
        print(f"Kategorier: {', '.join(args)}")
    else:
        status = df["Egen_Rel_Status"] if "Egen_Rel_Status" in df.columns else pd.Series([""] * len(df))
        mask = status.str.startswith(PREFIXES)

    print(f"Checkpoint: {len(df)} rader | skal rekalkulere: {int(mask.sum())}")
    if not mask.any():
        print("Ingen rader aa rekalkulere.")
        return
    df = df[~mask].copy()
    df.to_csv(CP, index=False, encoding="utf-8-sig")
    print(f"Skrev {len(df)} rader tilbake til checkpoint ({int(mask.sum())} fjernet for ny beregning).")


if __name__ == "__main__":
    main()
