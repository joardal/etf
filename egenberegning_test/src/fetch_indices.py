"""Henter referanseindekser. MSCI offisielt (valgfritt) + Stooq/Yahoo som proxy."""
from __future__ import annotations

import pandas as pd

from fetch_prices import fetch_price


def fetch_index_quote(stooq_ticker: str = "", yahoo_ticker: str = "", priority=("stooq", "yahoo")):
    """Samme som ETF-priser, men for indeks-tickere som ^GSPC / ^STOXX / ^spx."""
    return fetch_price(stooq_ticker=stooq_ticker, yahoo_ticker=yahoo_ticker, priority=priority)


def fetch_msci(index_code: str, from_date: str, to_date: str, variant: str = "NETR") -> pd.DataFrame:
    """Offisielle MSCI-nivaaer via pakken `msci-data` (ingen nokkel, pip install msci-data).
    Koder: 990100=World, 891800=ACWI, 664185=EM, 929887=USA, 990300=EAFE.
    Variant: NETR (net total return, default), STRD (price), GRTR (gross). Valuta: USD."""
    try:
        from mscidata import msci
    except ImportError as e:
        raise RuntimeError("Pakken 'msci-data' er ikke installert. Kjor: pip install msci-data") from e
    from fetch_prices import _norm_date

    import cache as cache_mod

    key = f"{index_code}_{variant}"
    cached = cache_mod.load("msci", key)
    if cache_mod.is_fresh(cached, 4):
        df = cached
    else:
        start = (
            (pd.Timestamp(cached["date"].max()) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
            if cached is not None
            else from_date
        )
        cache_mod.note_net(f"msci:{key}")
        raw = msci.get_levels(index_code, start, to_date, variant=variant)
        df = pd.DataFrame({"date": _norm_date(raw["DATE"]), "adj_close": pd.to_numeric(raw["LEVEL"], errors="coerce")})
        df = df.dropna(subset=["date", "adj_close"]).sort_values("date").reset_index(drop=True)
        df = cache_mod.merge(cached, df)
        if df.empty:
            raise RuntimeError(f"Ingen MSCI-data for {index_code} {variant}")
        cache_mod.save("msci", key, df)
    out = pd.DataFrame({"date": pd.to_datetime(df["date"]), "adj_close": pd.to_numeric(df["adj_close"], errors="coerce")})
    return out.dropna(subset=["date", "adj_close"]).sort_values("date").reset_index(drop=True)
