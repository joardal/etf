"""Lokalt cache-lag: hver serie (priser og valuta) lastes ned én gang, deretter hentes
kun det som mangler. Naar cachen er fersk gjores det INGEN nettverkskall.

Struktur:
  data/prices/EUNL_DE.csv   (date, adj_close)
  data/fx/EURUSD_X.csv      (date, adj_close)
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# Tellenettverkskall slik at run_test kan vise cache-treff vs faktiske kall
NET_CALLS: list[str] = []


def note_net(tag: str) -> None:
    NET_CALLS.append(tag)


def reset_net() -> None:
    NET_CALLS.clear()


def _path(kind: str, symbol: str) -> Path:
    safe = "".join(c if c.isalnum() else "_" for c in symbol.strip())
    d = DATA_DIR / kind
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{safe}.csv"


def load(kind: str, symbol: str) -> pd.DataFrame | None:
    """Leser cachen. Returnerer None hvis fil mangler eller er uleselig."""
    p = _path(kind, symbol)
    if not p.exists():
        return None
    try:
        df = pd.read_csv(p, parse_dates=["date"])
    except Exception:
        return None
    if df.empty or "date" not in df.columns:
        return None
    return df[["date", "adj_close"]]


def save(kind: str, symbol: str, df: pd.DataFrame) -> None:
    out = df.dropna(subset=["date", "adj_close"])
    out = out.drop_duplicates(subset="date", keep="last").sort_values("date")
    out.to_csv(_path(kind, symbol), index=False)


def merge(old: pd.DataFrame | None, new: pd.DataFrame) -> pd.DataFrame:
    """Slår sammen eldre og ny cachet historikk, siste verdi vinner per dato."""
    base = new if old is None or old.empty else pd.concat([old, new], ignore_index=True)
    base = base.dropna(subset=["date", "adj_close"])
    base = base.drop_duplicates(subset="date", keep="last").sort_values("date")
    return base.reset_index(drop=True)


def is_fresh(df: pd.DataFrame, max_age_days: int) -> bool:
    """True hvis serien dekker frem til i dag (innenfor grace-perioden)."""
    if df is None or df.empty:
        return False
    last = pd.Timestamp(df["date"].max())
    return (pd.Timestamp.today().normalize() - last) <= pd.Timedelta(days=max_age_days)


def log_events(name: str, events: list[dict]) -> None:
    """Appender hendelser (f.eks. bad ticks) til output/<name>.csv, uten duplikater."""
    if not events:
        return
    import csv as _csv

    out_dir = ROOT / "output"
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / f"{name}.csv"
    existing: set[tuple] = set()
    if p.exists():
        try:
            with open(p, encoding="utf-8-sig") as f:
                r = _csv.DictReader(f)
                existing = {(row.get("symbol"), row.get("date"), row.get("type")) for row in r}
        except Exception:
            pass
    new = [e for e in events if (e.get("symbol"), e.get("date"), e.get("type")) not in existing]
    if not new:
        return
    fields: list[str] = []
    for e in new:
        for k in e.keys():
            if k not in fields:
                fields.append(k)
    write_header = not p.exists()
    with open(p, "a", encoding="utf-8-sig", newline="") as f:
        w = _csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        if write_header:
            w.writeheader()
        w.writerows(new)
