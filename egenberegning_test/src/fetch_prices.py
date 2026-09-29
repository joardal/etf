"""Henter daglige ETF-kurser med lokalt cache-lag.

Yahoo er primær (ingen nøkkel). Stooq har ingen API-nøkkel: CSV-endepunktet slipper
kun gjennom vanlige nettlesere (UA-sperre + JS-verifisering), så Yahoo er default.

Cache-modellen:
  1. Første kjøring henter full historikk (f.eks. 5 år) og lagrer i data/prices/.
  2. Senere kjøringer henter kun radene etter siste cachedato (inkrementelt).
  3. Er cachen fersk (innenfor grace-dager) gjøres det ingen nettverkskall.
  4. Feil mot nettet med eksisterende cache => bruker vi cachen med advarsel.
"""
from __future__ import annotations

import io

import pandas as pd
import requests

import cache

BROWSER_UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

PERIOD_YEARS = {"1y": 1, "2y": 2, "3y": 3, "5y": 5, "10y": 10}

# Enkelt-dags hopp over dette regnes som feilprint/splitt, ikke markedsbevegelse.
# (2x-gearet ETF gjorde maks ~±20 %/dag selv i april 2025-kaoset.)
JUMP_THRESHOLD = 0.40
# Runde splitt-forhold: kun disse reskaleres automatisk (resten kuttes/flagges).
SPLIT_RATIOS = (2, 3, 4, 5, 10, 20, 50, 100, 200,
                1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 10, 1 / 20, 1 / 50, 1 / 100, 1 / 200)


def _near_round_ratio(factor: float, tol: float = 0.03) -> bool:
    return any(abs(factor / r - 1) <= tol for r in SPLIT_RATIOS)


def _norm_date(s: pd.Series) -> pd.Series:
    """Gjor datoer tidssone-naive, men BEHOLDER lokalklokken (borsens egen dato).

    Viktig: ikke konverter via UTC – det flytter f.eks. Xetra-datoer en dag tilbake
    mens NY-indeksdatoer star igjen, og dagene matcher feil i mergesjonen.
    """
    d = pd.to_datetime(s)
    if getattr(d.dt, "tz", None) is not None:
        d = d.dt.tz_localize(None)
    return d.dt.normalize()


def clean_bad_ticks(df: pd.DataFrame, symbol: str) -> tuple[pd.DataFrame, list[dict]]:
    """Renser feilprint og splitt-artefakter fra Yahoo. Alt posisjonelt (ingen label-justering).

    Per hopp > 40 % paa en dag (mot siste IKKE-droppede kurs):
      1. tilbake til gammelt nivaa innen 5 dager -> feilprint, raden droppes
      2. ved serie-slutt (kan ikke bekrefte) -> raden droppes, hentes paa nytt neste kjoring
      3. rundt splitt-forhold (+-3 %) -> splitt, historikken reskaleres til nytt nivaa
      4. turbulent nabolag (annet >15 %-hopp innen +-5 dager) -> BEHOLD alt, flagg
         (ekte krasj, f.eks. Russland-ETF-er, skal aldri glattes bort)
      5. ellers (isolert permanent ikke-rundt nivaaskifte) -> KUTT historikken for
         hoppet (tryggere enn aa fabrikkere), flagg til manuell review
    Returnerer (ren_df, hendelser). Hendelser logges av kalleren til bad_ticks.csv.
    """
    import numpy as np

    events: list[dict] = []
    if df is None or len(df) < 3:
        return df, events
    df = df.sort_values("date").reset_index(drop=True).copy()
    px = df["adj_close"].astype(float).to_numpy(dtype=float).copy()
    dates = pd.to_datetime(df["date"])
    n = len(px)
    drop = [False] * n
    raw = pd.Series(px).pct_change().abs().to_numpy()

    def ref_idx(i: int) -> int:
        k = i - 1
        while k >= 0 and (drop[k] or not np.isfinite(px[k]) or px[k] == 0):
            k -= 1
        return k

    i = 1
    while i < n:
        if drop[i] or not np.isfinite(px[i]):
            i += 1
            continue
        k = ref_idx(i)
        if k < 0:
            i += 1
            continue
        r = px[i] / px[k] - 1
        if abs(r) <= JUMP_THRESHOLD:
            i += 1
            continue
        dstr = str(dates.iloc[i].date())
        base = {"symbol": symbol, "date": dstr, "kurs": round(float(px[i]), 4),
                "forrige": round(float(px[k]), 4), "hopp_%": round(float(r) * 100, 1)}
        # Tilbakegang innen 5 gyldige punkter?
        reverted, j, seen = False, i + 1, 0
        while j < n and seen < 5:
            if np.isfinite(px[j]):
                seen += 1
                if abs(px[j] / px[k] - 1) < JUMP_THRESHOLD:
                    reverted = True
                    break
            j += 1
        if reverted:
            drop[i] = True
            events.append({**base, "type": "feilprint-droppet"})
        elif seen == 0:
            drop[i] = True
            events.append({**base, "type": "siste-rad-droppet"})
        else:
            factor = float(px[i] / px[k])
            lo, hi = max(0, i - 5), min(n, i + 6)
            turb = bool((raw[lo:i] > 0.15).any() or (raw[i + 1:hi] > 0.15).any())
            if turb:
                events.append({**base, "type": "turbulens-beholdt", "faktor": round(factor, 6)})
            elif _near_round_ratio(factor):
                px[:i] = px[:i] * factor
                events.append({**base, "type": "splitt-reskalert", "faktor": round(factor, 6)})
            else:
                for t in range(i):
                    drop[t] = True
                events.append({**base, "type": "historikk-kuttet-VERIFISER",
                               "faktor": round(factor, 6)})
        i += 1

    keep = [t for t in range(n) if not drop[t]]
    out = df.iloc[keep].copy().reset_index(drop=True)
    out["adj_close"] = px[keep]
    if len(events) > 5:
        events.append({"symbol": symbol, "date": "-", "type": "ADVARSEL-mange-hopp",
                       "kurs": "", "forrige": "", "hopp_%": f"{len(events)} hendelser – sjekk serien manuelt"})
    return out, events


def _hist_to_df(hist: pd.DataFrame, min_rows: int) -> pd.DataFrame:
    """Yahoo-history -> DataFrame[date, adj_close]. Bruker Adj Close (utbyttejustert)."""
    if hist is None or len(hist) < min_rows:
        return pd.DataFrame(columns=["date", "adj_close"])
    hist = hist.reset_index()
    date_col = "Date" if "Date" in hist.columns else hist.columns[0]
    if "Adj Close" in hist.columns and hist["Adj Close"].notna().sum() > 0:
        price = hist["Adj Close"]
    else:
        price = hist["Close"]
    out = pd.DataFrame({"date": _norm_date(hist[date_col]), "adj_close": pd.to_numeric(price, errors="coerce")})
    return out.dropna(subset=["date", "adj_close"]).sort_values("date").reset_index(drop=True)


def _fetch_yahoo_window(symbol: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """Henter et datovindu fra Yahoo. Tillatt med faa rader (inkrementell oppdatering)."""
    try:
        import yfinance as yf
    except ImportError as e:
        raise RuntimeError("yfinance er ikke installert. Kjør: pip install -r requirements.txt") from e
    cache.note_net(f"yahoo:{symbol}")
    try:
        hist = yf.Ticker(symbol).history(
            start=start.strftime("%Y-%m-%d"),
            end=(end + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
            auto_adjust=False,
        )
    except Exception as e:
        msg = str(e)
        if "Rate limited" in msg or "429" in msg:
            raise RuntimeError("Yahoo: rate-limit (429). Vent noen minutter og prøv igjen med færre tickere.") from e
        raise RuntimeError(f"Yahoo-feil for '{symbol}': {msg}") from e
    return _hist_to_df(hist, min_rows=1)


def _fetch_stooq(symbol: str) -> pd.DataFrame:
    """Stooq krever alltid ticker-suffiks. Uten nettleser-UA svarer det 404; med UA
    svarer det en JS-verifiseringsside som skript ikke kan lose."""
    if not symbol or not symbol.strip():
        raise ValueError("Tom Stooq-ticker.")
    url = f"https://stooq.com/q/d/l/?s={symbol.strip().lower()}&i=d"
    cache.note_net(f"stooq:{symbol}")
    r = requests.get(url, timeout=30, headers=BROWSER_UA)
    text = r.text.strip()
    if r.status_code == 404:
        raise RuntimeError("Stooq: 404 – sjekk ticker-suffiks (eunl.de, ikke eunl) eller bot-blokkering.")
    if "__verify" in text or "verify your browser" in text or text.startswith("<"):
        raise RuntimeError(
            "Stooq: svarte med nettleser-verifiseringsside. Bruk Yahoo, eller last ned CSV manuelt i nettleseren."
        )
    r.raise_for_status()
    if text.startswith("No data") or len(text.splitlines()) < 5:
        raise RuntimeError(f"Stooq: ingen data for '{symbol}'.")
    df = pd.read_csv(io.StringIO(text))
    df.columns = [c.strip() for c in df.columns]
    date_col = "Date" if "Date" in df.columns else df.columns[0]
    close_col = "Close" if "Close" in df.columns else df.columns[4]
    out = pd.DataFrame({"date": _norm_date(df[date_col]), "adj_close": pd.to_numeric(df[close_col], errors="coerce")})
    return out.dropna(subset=["date", "adj_close"]).sort_values("date").reset_index(drop=True)


def fetch_price(
    stooq_ticker: str = "",
    yahoo_ticker: str = "",
    priority: tuple[str, ...] = ("yahoo", "stooq"),
    period: str = "5y",
    max_age_days: int = 4,
) -> tuple[pd.DataFrame, str]:
    """Henter serie med cache. Returnerer (df, kilde), der kilde = 'cache:yahoo:EUNL.DE'
    ved fullt treff, 'yahoo:EUNL.DE' ved oppdatering, eller 'yahoo:EUNL.DE (fra cache ved feil)'."""
    stooq_ticker = (stooq_ticker or "").strip()
    yahoo_ticker = (yahoo_ticker or "").strip()

    chosen: tuple[str, str] | None = None
    for src in priority:
        if src == "yahoo" and yahoo_ticker:
            chosen = ("yahoo", yahoo_ticker)
            break
        if src == "stooq" and stooq_ticker:
            chosen = ("stooq", stooq_ticker)
            break
    if chosen is None:
        raise RuntimeError("Ingen ticker utfylt (verken Stooq eller Yahoo).")

    src, sym = chosen
    cached = cache.load("prices", sym)
    today = pd.Timestamp.today().normalize()

    if cache.is_fresh(cached, max_age_days):
        return cached, f"cache:{src}:{sym}"

    cold_start = today - pd.DateOffset(years=PERIOD_YEARS.get(period, 5))
    start = pd.Timestamp(cached["date"].max()) + pd.Timedelta(days=1) if cached is not None else cold_start

    try:
        if src == "yahoo":
            new = _fetch_yahoo_window(sym, start, today)
        else:
            new = _fetch_stooq(sym)
    except Exception:
        if cached is not None and not cached.empty:
            print(f"   Advarsel: nettfeil for {sym} – bruker eksisterende cache.")
            return cached, f"{src}:{sym} (fra cache ved feil)"
        raise

    merged = cache.merge(cached, new)
    if merged.empty:
        raise RuntimeError(f"Ingen data funnet for '{sym}'. Sjekk ticker og suffiks.")
    merged, events = clean_bad_ticks(merged, f"{src}:{sym}")
    cache.log_events("bad_ticks", events)
    cache.save("prices", sym, merged)
    return merged, f"{src}:{sym}"
