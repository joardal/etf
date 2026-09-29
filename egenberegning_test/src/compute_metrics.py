"""Egne nøkkeltall fra daglige kurser. Samme definisjoner som enrich_etfs.py der det er mulig.

Avvik mot Morningstar er forventet og dokumentert i README (Rf, daglig vs månedlig,
Adj Close, kategori-proxy som benchmark, ingen FX-normalisering i v1).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

WINDOWS = {"1M": 21, "3M": 63, "6M": 126, "12M": 252, "3Y": 756, "5Y": 1260}


def _ret(s: pd.Series) -> pd.Series:
    return s.pct_change().dropna()


def _ann_ret(prices: pd.Series, trading_days: int = 252) -> float | None:
    if len(prices) < 2:
        return None
    n = len(prices) - 1
    total = prices.iloc[-1] / prices.iloc[0] - 1
    return float((1 + total) ** (trading_days / n) - 1)


def _max_dd(prices: pd.Series) -> float | None:
    if len(prices) < 2:
        return None
    dd = (prices - prices.cummax()) / prices.cummax()
    return float(dd.min() * 100)


def metrics_absolute(df: pd.DataFrame, rf_annual: float = 0.02, trading_days: int = 252) -> dict:
    """Krever df[date, adj_close] sortert stigende. Returnerer flatt dict med Egen_-prefiks."""
    out: dict = {"Egen_Antall_Dager": int(len(df))}
    if len(df) < 20:
        out["Egen_Status"] = "For lite data"
        return out
    prices = df["adj_close"].astype(float).reset_index(drop=True)
    rets = _ret(prices)
    rf_d = rf_annual / trading_days

    for label, n in WINDOWS.items():
        win = prices.iloc[-n:] if len(prices) >= n else prices
        key = label.replace("M", "M_").replace("Y", "Y_")  # 1M_ 3M_ 6M_ 12M_ 3Y_ 5Y_
        if "Y_" in key or "M_" in key:
            pass
        tag = label.replace("M", "M").replace("Y", "Y")
        if label in ("3Y", "5Y"):
            out[f"Egen_Avkastning_{tag}_Ann_%"] = round(_ann_ret(win, trading_days) * 100, 2)
            r = _ret(win)
            std = float(r.std() * np.sqrt(trading_days) * 100) if len(r) > 5 else None
            out[f"Egen_Stdavvik_{tag}_%"] = round(std, 2) if std is not None else None
            sharpe = ((_ann_ret(win, trading_days) - rf_annual) / (std / 100)) if std else None
            out[f"Egen_Sharpe_{tag}"] = round(sharpe, 2) if sharpe is not None and np.isfinite(sharpe) else None
        elif label == "12M":
            out["Egen_Avkastning_12M_%"] = round(_ann_ret(win, trading_days) * 100, 2)
            r = _ret(win)
            std = float(r.std() * np.sqrt(trading_days) * 100) if len(r) > 5 else None
            out["Egen_Stdavvik_1Y_%"] = round(std, 2) if std is not None else None
            sharpe = ((_ann_ret(win, trading_days) - rf_annual) / (std / 100)) if std else None
            out["Egen_Sharpe_1Y"] = round(sharpe, 2) if sharpe is not None and np.isfinite(sharpe) else None
        elif label == "1M":
            out["Egen_Avkastning_1M_%"] = round((win.iloc[-1] / win.iloc[0] - 1) * 100, 2)
        elif label == "3M":
            out["Egen_Avkastning_3M_%"] = round((win.iloc[-1] / win.iloc[0] - 1) * 100, 2)
        elif label == "6M":
            out["Egen_Avkastning_6M_%"] = round((win.iloc[-1] / win.iloc[0] - 1) * 100, 2)
        out[f"Egen_MaxDD_{label}_%"] = round(_max_dd(win), 2)

    # Alias: Morningstar kaller 12M for 1Y – speil nøkkelen så sammenligning blir enkel
    if "Egen_MaxDD_12M_%" in out:
        out["Egen_MaxDD_1Y_%"] = out["Egen_MaxDD_12M_%"]

    # P3-tall på full serie
    ann = _ann_ret(prices, trading_days)
    excess = rets - rf_d
    downside = np.minimum(0, excess.to_numpy())
    dd_dev = float(np.sqrt(np.mean(downside**2)) * np.sqrt(trading_days))
    sortino = (ann - rf_annual) / dd_dev if dd_dev > 1e-9 else None
    full_dd = _max_dd(prices)
    calmar = (ann / abs(full_dd / 100)) if full_dd and abs(full_dd) > 1e-9 else None
    dd_series = (prices - prices.cummax()) / prices.cummax()
    ulcer = float(np.sqrt(np.mean((dd_series * 100) ** 2)))
    var95 = float(rets.quantile(0.05))
    cvar = float(rets[rets <= var95].mean() * 100)
    roll_sharpe = None
    if len(rets) >= trading_days:
        rm = rets.rolling(trading_days).mean() * trading_days
        rs = rets.rolling(trading_days).std() * np.sqrt(trading_days)
        roll = ((rm - rf_annual) / rs).dropna()
        if len(roll):
            roll_sharpe = round(float(roll.iloc[-1]), 2)

    out.update(
        {
            "Egen_Sortino": round(sortino, 2) if sortino is not None and np.isfinite(sortino) else None,
            "Egen_Calmar": round(calmar, 2) if calmar is not None and np.isfinite(calmar) else None,
            "Egen_Ulcer": round(ulcer, 2) if np.isfinite(ulcer) else None,
            "Egen_CVaR95_%": round(cvar, 2) if np.isfinite(cvar) else None,
            "Egen_RullSharpe_1Y": roll_sharpe,
            "Egen_Status": "Beregnet",
        }
    )
    return out


def _relative_window(re: pd.Series, rb: pd.Series) -> dict | None:
    """En regresjon paa maanedsdata. Returnerer None ved for lite data."""
    al = pd.concat([re.rename("re"), rb.rename("rb")], axis=1, join="inner").dropna()
    if len(al) < 12 or float(al["rb"].var()) < 1e-12:
        return None
    re, rb = al["re"], al["rb"]
    beta = float(np.cov(re, rb, ddof=1)[0, 1] / np.var(rb, ddof=1))
    corr = float(re.corr(rb))
    # Annualisert alfa via regresjonsintercept (Morningstar-metodikk)
    alpha_m = float(re.mean() - beta * rb.mean())
    alpha_ann = float(((1 + alpha_m) ** 12 - 1) * 100)
    active = re - rb
    te = float(active.std() * np.sqrt(12) * 100)
    ir = float((active.mean() * 12 * 100) / te) if te > 1e-9 else None
    up = rb > 0
    dn = rb < 0
    up_cap = float(re[up].mean() / rb[up].mean() * 100) if up.sum() >= 3 and rb[up].mean() != 0 else None
    dn_cap = float(re[dn].mean() / rb[dn].mean() * 100) if dn.sum() >= 3 and rb[dn].mean() != 0 else None
    return {
        "Beta": round(beta, 2),
        "Alpha_Ann_%": round(alpha_ann, 2),
        "R2": round(corr**2, 3),
        "TE_Ann_%": round(te, 2),
        "IR": round(ir, 2) if ir is not None and np.isfinite(ir) else None,
        "UpsideCap_%": round(up_cap, 1) if up_cap is not None and np.isfinite(up_cap) else None,
        "DownsideCap_%": round(dn_cap, 1) if dn_cap is not None and np.isfinite(dn_cap) else None,
    }


def metrics_relative(
    etf: pd.DataFrame, bench: pd.DataFrame, rf_annual: float = 0.02, trading_days: int = 252
) -> dict:
    """Beta/Alpha/R2/TE/IR (1Y/3Y/5Y) + Capture (3Y) mot proxy-indeks, paa MAANEDSDATA."""
    m = pd.merge(etf[["date", "adj_close"]], bench[["date", "adj_close"]], on="date", suffixes=("_etf", "_bench")).sort_values("date")
    out: dict = {"Egen_Bench_Dager": int(len(m))}
    if m.empty:
        out["Egen_Rel_Status"] = "Ingen overlappende dager"
        return out
    # Maanedsfrekvens er bevisst valgt (samme praksis som Morningstar): daglige
    # kurser fra ulike tidssoner gir falsk dekorrelasjon paa dagsnivaa.
    me = m.set_index("date")["adj_close_etf"].resample("ME").last()
    mb = m.set_index("date")["adj_close_bench"].resample("ME").last()
    rem = me.pct_change()
    rbm = mb.pct_change()
    out["Egen_Bench_Mnd"] = int(min(len(rem.dropna()), len(rbm.dropna())))
    # Vinduer: 1Y/3Y/5Y (appen viser alle tre). Egen_Beta m.fl. er 3Y-aliaser.
    colmap = {"Beta": "Beta_{t}", "Alpha_Ann_%": "Alpha_{t}_%",
              "R2": "R2_{t}", "TE_Ann_%": "TE_{t}_%",
              "IR": "IR_{t}", "UpsideCap_%": "UpsideCap_3Y_%",
              "DownsideCap_%": "DownsideCap_3Y_%"}
    got_any = False
    for tag, n_mnd in (("1Y", 12), ("3Y", 36), ("5Y", 60)):
        w = _relative_window(rem.iloc[-n_mnd:] if len(rem) > n_mnd else rem,
                             rbm.iloc[-n_mnd:] if len(rbm) > n_mnd else rbm)
        if w is None:
            continue
        got_any = True
        for k, v in w.items():
            if k in ("UpsideCap_%", "DownsideCap_%") and tag != "3Y":
                continue  # capture kun 3Y (som i appen)
            out[f"Egen_{colmap[k].format(t=tag)}"] = v
    if not got_any:
        out["Egen_Rel_Status"] = f"For lite data ({out['Egen_Bench_Mnd']} mnd, krever >=12)"
        return out
    # 3Y-aliaser uten suffiks (bakoverkompatibel med sammenligning.csv)
    out["Egen_Beta"] = out.get("Egen_Beta_3Y")
    out["Egen_Alpha_Ann_%"] = out.get("Egen_Alpha_3Y_%")
    out["Egen_R2"] = out.get("Egen_R2_3Y")
    out["Egen_TE_Ann_%"] = out.get("Egen_TE_3Y_%")
    out["Egen_IR"] = out.get("Egen_IR_3Y")
    out["Egen_Rel_Status"] = "Beregnet mot proxy-indeks (mnd.data)"
    return out
    out.update(
        {
            "Egen_Beta": round(beta, 2),
            "Egen_Alpha_Ann_%": round(alpha_ann, 2),
            "Egen_R2": round(corr**2, 3),
            "Egen_TE_Ann_%": round(te, 2),
            "Egen_IR": round(ir, 2) if ir is not None and np.isfinite(ir) else None,
            "Egen_UpsideCap_%": round(up_cap, 1) if up_cap is not None and np.isfinite(up_cap) else None,
            "Egen_DownsideCap_%": round(dn_cap, 1) if dn_cap is not None and np.isfinite(dn_cap) else None,
            "Egen_Rel_Status": "Beregnet mot proxy-indeks (mnd.data)",
        }
    )
    return out
