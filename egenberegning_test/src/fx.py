"""FX-normalisering til én basisvaluta (config: base_currency).

Alle serier regnes i samme basisvaluta fordi:
  - avkastning/vol/Sharpe pavirkes av valutabevegelser
  - Beta/Alpha/TE mot indeks blir feil hvis ETF og indeks er i ulik valuta
    (EUNL.DE i EUR mot MSCI World i USD ga Beta 0,4 i stedet for ~1,0)

Par-henting fra Yahoo (i prioritert rekkefolge):
  1. f"{base}{quote}=X"  -> kvoten QUOTE per 1 BASE  -> rate QUOTE->BASE = 1/kvoten
  2. f"{quote}{base}=X"  -> kvoten BASE per 1 QUOTE  -> rate QUOTE->BASE = kvoten
  3. USD-kryss: rate = (USD per QUOTE) / (USD per BASE) – USD-par finnes for
     alle valutaer (AUDUSD, USDJPY, ...), saa eksotiske kryss (TWD->EUR osv.)
     loses alltid.
Eksempel: EURUSD=X (USD per EUR) brukes til USD->EUR som 1/EURUSD.

Kurser caches lokalt i data/fx/ med samme inkrementelle logikk som priser.
"""
from __future__ import annotations

import pandas as pd

import cache
from fetch_prices import PERIOD_YEARS, _fetch_yahoo_window


def _fetch_pair(pair: str, period: str, max_age_days: int) -> pd.DataFrame:
    """Henter ett Yahoo-valutapar med cache. Kaster ved feil/tomme data."""
    cached = cache.load("fx", pair)
    today = pd.Timestamp.today().normalize()
    if cache.is_fresh(cached, max_age_days):
        return cached
    start = (
        pd.Timestamp(cached["date"].max()) + pd.Timedelta(days=1)
        if cached is not None
        else today - pd.DateOffset(years=PERIOD_YEARS.get(period, 5))
    )
    cache.note_net(f"fx:{pair}")
    new = _fetch_yahoo_window(pair, start, today)
    df = cache.merge(cached, new)
    if df.empty:
        raise RuntimeError(f"Ingen kurser for {pair}")
    from fetch_prices import clean_bad_ticks as _clean

    df, _ev = _clean(df, f"fx:{pair}")
    cache.log_events("bad_ticks", _ev)
    cache.save("fx", pair, df)
    return df


def _usd_per(ccy: str, period: str, max_age_days: int) -> pd.DataFrame:
    """Serie med USD per 1 CCY (f.eks. USD per EUR). Brukes til USD-kryss."""
    ccy = ccy.upper()
    if ccy == "USD":
        raise ValueError("Intern feil: _usd_per(USD)")
    # Direkte: {CCY}USD=X er USD per CCY (f.eks. AUDUSD=X, EURUSD=X, GBPUSD=X)
    try:
        df = _fetch_pair(f"{ccy}USD=X", period, max_age_days)
        out = df.copy()
        out["rate"] = out["adj_close"]
        return out[["date", "rate"]]
    except Exception:
        pass
    # Invers: USD{CCY}=X er CCY per USD (f.eks. USDJPY=X) -> inverter
    df = _fetch_pair(f"USD{ccy}=X", period, max_age_days)
    out = df.copy()
    out["rate"] = 1.0 / out["adj_close"]
    return out[["date", "rate"]]


def get_rate(quote: str, base: str, period: str = "5y", max_age_days: int = 4) -> pd.DataFrame | None:
    """Returnerer DataFrame[date, rate] der verdi_i_quote * rate = verdi_i_base.
    None hvis quote == base (ingen konvertering nodvendig)."""
    quote = (quote or "").strip().upper()
    base = (base or "").strip().upper()
    if not quote:
        raise RuntimeError("Tom valutakode – fyll inn Valuta_Ticker / Valuta i mapping-CSV.")
    if quote == base:
        return None

    last_err: Exception | None = None
    for pair, invert in ((f"{base}{quote}=X", True), (f"{quote}{base}=X", False)):
        try:
            df = _fetch_pair(pair, period, max_age_days)
        except Exception as e:  # prov neste par
            last_err = e
            continue

        out = df.copy()
        out["rate"] = 1.0 / out["adj_close"] if invert else out["adj_close"]
        return out[["date", "rate"]]

    # Fallback: USD-kryss for eksotiske par (f.eks. TWD->EUR)
    try:
        q = _usd_per(quote, period, max_age_days)
        b = _usd_per(base, period, max_age_days)
        m = q.merge(b, on="date", suffixes=("_q", "_b"), how="inner").sort_values("date")
        if m.empty:
            raise RuntimeError("ingen overlappende USD-kryssdager")
        m["rate"] = m["rate_q"] / m["rate_b"]
        return m[["date", "rate"]]
    except Exception as e:
        last_err = e

    raise RuntimeError(f"Fant ingen valutakurs for {quote}->{base} paa Yahoo. Detaljer: {last_err}")


def normalize(
    df: pd.DataFrame, quote: str, base: str, period: str = "5y", max_age_days: int = 4
) -> tuple[pd.DataFrame, str]:
    """Gjor om en prisserie til basisvaluta. Returnerer (df, notat).

    Kursen fylles frem (ffill) der valutamarkedet har fridager som aksjemarkedet ikke har.
    """
    base = (base or "").strip().upper()
    quote = (quote or "").strip().upper()
    rate = get_rate(quote, base, period=period, max_age_days=max_age_days)
    if rate is None:
        return df, f"{quote or base} (allerede i {base})"

    m = df.merge(rate, on="date", how="left").sort_values("date")
    m["rate"] = m["rate"].ffill().bfill()
    if m["rate"].isna().any():
        mangler = int(m["rate"].isna().sum())
        raise RuntimeError(f"Mangler {quote}->{base}-kurser for {mangler} av {len(m)} dager.")
    m["adj_close"] = m["adj_close"] * m["rate"]
    return m[["date", "adj_close"]], f"{quote}->{base}"
