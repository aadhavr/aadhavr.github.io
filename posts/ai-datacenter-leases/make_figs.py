"""
Build the interactive figures for the lease post as standalone HTML fragments.

Usage (from the post folder):
    pip install plotly pandas
    python make_figs.py

Reads:  data/lease_panel.csv  (copy from the ai-datacenter-leases repository)
Writes: figs/1_gross_to_it.html, figs/2_rent_over_time.html, figs/3_rent_by_credit.html

index.qmd includes these files, so the post itself contains no code.
Only the first file loads plotly.js; the rest reuse it.
"""
import statistics
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.graph_objects as go

DATA = Path("data")
FIGS = Path("figs")
FIGS.mkdir(exist_ok=True)

BLUE, ORANGE, GRAY, DARK = "#1f5fa8", "#e07b24", "#8a8a8a", "#222222"
FONT = "IBM Plex Sans, system-ui, -apple-system, Segoe UI, Helvetica, sans-serif"
first_written = []

TICKERS = [("Core Scientific", "CORZ"), ("Mawson", "MIGI"), ("Galaxy", "GLXY"), ("Applied Digital", "APLD"),
           ("TERAWULF", "WULF"), ("Cipher", "CIFR"), ("Hut 8", "HUT"), ("WhiteFiber", "WYFI"), ("Riot", "RIOT"),
           ("Digi Power", "DGXX"), ("CLEANSPARK", "CLSK"), ("CleanCore", "ZONE"), ("Bitdeer", "BTDR"),
           ("HEALTHY CHOICE", "Host Digital"), ("DUOS", "DUOT")]
CREDIT = [("ig_tenant", "Investment-grade tenant"), ("parent_guarantee", "Parent guarantee"),
          ("third_party_backstop", "Third-party backstop"), ("none_stated", "None stated"),
          ("anticipated", "Anticipated, not final")]
CREDIT_LABEL = dict(CREDIT)


def style(fig, height=520, legend_y=1.08, hovermode="closest", **kw):
    fig.update_layout(
        height=height,
        font=dict(family=FONT, size=13, color=DARK),
        plot_bgcolor="white", paper_bgcolor="white",
        hovermode=hovermode,
        hoverlabel=dict(bgcolor="white", font=dict(family=FONT, color=DARK, size=12), bordercolor="#cccccc"),
        legend=dict(orientation="h", yanchor="bottom", y=legend_y, x=0,
                    bgcolor="rgba(255,255,255,0)", borderwidth=0),
        margin=dict(l=62, r=30, t=50, b=50),
        **kw,
    )
    fig.update_xaxes(showgrid=False, showline=True, linecolor="#444", ticks="outside", tickcolor="#444")
    fig.update_yaxes(gridcolor="#ededed", zeroline=False, showline=False)
    return fig


def write(fig, name):
    fig.write_html(
        FIGS / name, full_html=False, include_plotlyjs="cdn" if not first_written else False,
        config={"displayModeBar": False, "responsive": True},
        default_width="100%",
    )
    first_written.append(name)
    print("wrote", FIGS / name)


def ticker(landlord):
    return next((t for k, t in TICKERS if k.lower() in str(landlord).lower()), str(landlord).split()[0])


def short_tenant(t):
    t = str(t).split(" (")[0].strip()
    if t.lower().startswith("undisclosed"):
        return "undisclosed IG tenant" if "invest" in t.lower() else "undisclosed"
    return {"Amazon Data Services": "AWS", "Amazon Web Services": "AWS"}.get(t, t)


def num(x):
    try:
        v = float(x)
        return None if np.isnan(v) else v
    except (TypeError, ValueError):
        return None


def load():
    """Signed leases with price terms (status REVIEWED), with rent per kW-month.

    Rent = filed average annual revenue / MW, or contract value / term / MW.
    MW = critical IT load if stated; otherwise the MW figure with an unstated basis.
    """
    p = pd.read_csv(DATA / "lease_panel.csv", dtype=str).fillna("")
    p = p[p["status"] == "REVIEWED"].copy()
    rows = []
    for _, r in p.iterrows():
        it, unst, gross = num(r["it_mw"]), num(r.get("mw_unstated", "")), num(r["gross_mw"])
        ann, tcv, term = num(r["avg_annual_revenue_musd"]), num(r["contract_value_musd"]), num(r["term_years"])
        if ann is None and tcv is not None and term:
            ann = tcv / term
        mw, basis = (it, "IT") if it else ((unst, "unstated") if unst else ((gross, "gross") if gross else (None, "")))
        if ann is None or not mw:
            continue
        site = str(r.get("site", "")).split(" (")[0]
        if str(r.get("deal_key", "")).endswith("-P2"):
            site = (site + " (expansion)").strip()
        rows.append({
            "lease_id": r["lease_id"], "date": pd.Timestamp(r["announce_date"]), "tick": ticker(r["landlord"]),
            "landlord": r["landlord"], "tenant": short_tenant(r["tenant"]), "site": site,
            "mw": mw, "basis": basis, "it_mw": it, "gross_mw": gross, "term": term,
            "rent": ann / mw * 1e6 / 1000 / 12, "credit": r.get("credit_type", "") or "none_stated",
        })
    d = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)
    d["half"] = d["date"].dt.year.astype(str) + "H" + np.where(d["date"].dt.month <= 6, "1", "2")
    return d


def hover_text(d):
    out = []
    for _, x in d.iterrows():
        site = f", {x['site']}" if x["site"] else ""
        term = f"{x['term']:.0f}-year term" if x["term"] else "term not stated"
        out.append(f"<b>{x['tick']}</b>, {x['tenant']}{site}<br>"
                   f"{x['date']:%b %d, %Y}<br>"
                   f"${x['rent']:.0f} per kW-month<br>"
                   f"{x['mw']:.0f} MW ({'critical IT' if x['basis'] == 'IT' else 'basis not stated'}), {term}<br>"
                   f"Credit support: {CREDIT_LABEL.get(x['credit'], x['credit'])}")
    return out


d = load()
it = d[d["basis"] == "IT"]
un = d[d["basis"] == "unstated"]
print(f"leases with a price: {len(d)} ({len(it)} IT basis, {len(un)} unstated); "
      f"median IT rent ${it['rent'].median():.1f} per kW-month")

# ---------------------------------------------------------------- 1. gross power / IT load
g = d[d["gross_mw"].notna() & d["it_mw"].notna()].copy()
g["ratio"] = g["gross_mw"] / g["it_mw"]
g = g.sort_values("ratio")
g["label"] = [f"{x.tick}, {x.tenant}" + (f", {x.site}" if x.site else "") for x in g.itertuples()]
fig = go.Figure()
for y, x in zip(g["label"], g["ratio"]):
    fig.add_trace(go.Scatter(x=[1.0, x], y=[y, y], mode="lines", line=dict(color="#d0d0d0", width=2),
                             hoverinfo="skip", showlegend=False))
fig.add_trace(go.Scatter(
    x=g["ratio"], y=g["label"], mode="markers", marker=dict(color=BLUE, size=11), showlegend=False,
    customdata=np.stack([g["gross_mw"], g["it_mw"]], axis=1),
    hovertemplate="%{y}<br>Gross %{customdata[0]:.0f} MW / IT %{customdata[1]:.0f} MW"
                  "<br>Ratio %{x:.2f}<extra></extra>"))
med = statistics.median(g["ratio"])
fig.add_vline(x=med, line=dict(color=GRAY, width=1, dash="dot"),
              annotation_text=f"median {med:.2f}", annotation_position="top",
              annotation_font=dict(size=11, color="#666"))
style(fig, height=110 + 38 * len(g),
      xaxis=dict(title="Gross power ÷ critical IT load", range=[0.98, 1.6]),
      yaxis=dict(title=None, automargin=True, showgrid=False))
write(fig, "1_gross_to_it.html")

# ---------------------------------------------------------------- 2. rent over time
fig = go.Figure()
ref = max(d["mw"])
for sub, name, filled in ((it, "MW stated as critical IT load", True), (un, "MW basis not stated", False)):
    fig.add_trace(go.Scatter(
        x=sub["date"], y=sub["rent"], mode="markers", name=name,
        marker=dict(size=sub["mw"], sizemode="area", sizeref=2.0 * ref / (34 ** 2), sizemin=5,
                    color=BLUE if filled else "rgba(0,0,0,0)", opacity=0.75 if filled else 1,
                    line=dict(color=BLUE if not filled else "white", width=1.5 if not filled else 0.8)),
        text=hover_text(sub), hovertemplate="%{text}<extra></extra>"))
last = d["date"].max()
first_seg = True
for half, v in it.groupby("half")["rent"]:
    y, h = int(half[:4]), int(half[-1])
    a = pd.Timestamp(y, 1 if h == 1 else 7, 1)
    b = min(pd.Timestamp(y, 6 if h == 1 else 12, 30), last)
    m = float(v.median())
    fig.add_trace(go.Scatter(
        x=[a, b], y=[m, m], mode="lines", line=dict(color=DARK, width=2.5),
        name="Half-year median (IT basis)", legendgroup="median", showlegend=first_seg,
        hovertemplate=f"{half}: median ${m:.0f} (n={len(v)})<extra></extra>"))
    first_seg = False
fig.add_hline(y=float(it["rent"].median()), line=dict(color=GRAY, width=1, dash="dot"),
              annotation_text=f"overall median ${it['rent'].median():.0f}", annotation_position="top left",
              annotation_font=dict(size=11, color="#666"))
style(fig, height=540,
      xaxis=dict(title=None, range=[pd.Timestamp("2024-04-15"), last + pd.Timedelta(days=45)]),
      yaxis=dict(title="Rent, $ per kW of IT load per month", range=[90, 245]))
write(fig, "2_rent_over_time.html")

# ---------------------------------------------------------------- 3. rent by credit support
fig = go.Figure()
rng = np.random.default_rng(7)
for i, (key, label) in enumerate(CREDIT):
    sub = it[it["credit"] == key]
    if sub.empty:
        continue
    jitter = rng.uniform(-0.16, 0.16, len(sub))
    fig.add_trace(go.Scatter(
        x=i + jitter, y=sub["rent"], mode="markers", showlegend=False,
        marker=dict(color=BLUE, size=10, opacity=0.8, line=dict(color="white", width=0.8)),
        text=hover_text(sub), hovertemplate="%{text}<extra></extra>"))
    m = float(sub["rent"].median())
    fig.add_trace(go.Scatter(
        x=[i - 0.3, i + 0.3], y=[m, m], mode="lines", line=dict(color=DARK, width=3), showlegend=False,
        hovertemplate=f"{label}: median ${m:.0f} (n={len(sub)})<extra></extra>"))
    fig.add_annotation(x=i, y=95, text=f"n={len(sub)}", showarrow=False, font=dict(size=11, color="#666"))
style(fig, height=500,
      xaxis=dict(title=None, tickmode="array", tickvals=list(range(len(CREDIT))),
                 ticktext=[lab for _, lab in CREDIT], range=[-0.6, len(CREDIT) - 0.4]),
      yaxis=dict(title="Rent, $ per kW of IT load per month", range=[90, 245]))
write(fig, "3_rent_by_credit.html")

print("\nAll figures written to", FIGS.resolve())
