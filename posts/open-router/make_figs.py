"""
Build the interactive figures for the post as standalone HTML fragments.

Usage (from the post folder):
    pip install plotly
    python make_figs.py

Reads:  data/*.csv  (written by the analysis scripts)
Writes: figs/1_share.qmd, 2_levels.qmd, 3_price.qmd, 4_quality.qmd,
        5_event.qmd, 6_spend.qmd  (raw-HTML fragments that index.qmd includes)

index.qmd includes these files, so the post itself contains no code.
Only the first file loads plotly.js; the rest reuse it.
"""
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import plotly.io as pio
from plotly.subplots import make_subplots
from pathlib import Path

DATA = Path("data")
FIGS = Path("figs")
FIGS.mkdir(exist_ok=True)

BLUE, ORANGE, GRAY = "#1f5fa8", "#e07b24", "#8a8a8a"
FONT = "IBM Plex Sans, system-ui, -apple-system, Segoe UI, Helvetica, sans-serif"
first_written = []


def load(name):
    return pd.read_csv(DATA / f"{name}.csv", index_col=0, parse_dates=True).sort_index()


def style(fig, title=None, height=520, legend_rows=1, hovermode="x unified", **kw):
    # Title above the plot, legend below the x-axis: the two cannot collide, whatever
    # the screen width or the number of legend rows.
    top, bottom = 58, 58 + 26 * legend_rows
    plot_h = height - top - bottom
    fig.update_layout(
        title=dict(text=title, x=0, xref="paper", xanchor="left",
                   y=0.97, yref="container", yanchor="top",
                   font=dict(size=17, color="#111")),
        height=height,
        font=dict(family=FONT, size=13, color="#222"),
        plot_bgcolor="white", paper_bgcolor="white",
        hovermode=hovermode,
        legend=dict(orientation="h", yanchor="top", y=-40 / plot_h, x=0,
                    bgcolor="rgba(255,255,255,0)", borderwidth=0,
                    font=dict(size=12)),
        margin=dict(l=62, r=62, t=top, b=bottom),
        **kw,
    )
    fig.update_xaxes(showgrid=False, showline=True, linecolor="#444", ticks="outside",
                     tickcolor="#444")
    fig.update_yaxes(gridcolor="#ededed", zeroline=False, showline=False)
    return fig


def write(fig, name):
    # Written as .qmd fragments wrapped in a raw-HTML block. A plain .html file is not
    # reliably passed through by the include shortcode; this is.
    html = fig.to_html(
        full_html=False, include_plotlyjs="cdn" if not first_written else False,
        config={"displayModeBar": False, "responsive": True, "showTips": False},
        default_width="100%",
    )
    path = FIGS / name
    path.write_text("```{=html}\n" + html + "\n```\n")
    first_written.append(name)
    print("wrote", path)


shares = load("weekly_shares")
levels = load("weekly_levels")
prices = load("weekly_prices")
quality = load("weekly_quality")
spend = load("weekly_spend")
events = load("event_windows")

# ---------------------------------------------------------------- 1. share
s = shares[shares.index >= "2025-01-01"]
a = s.rolling(4, min_periods=4).mean()
fig = make_subplots(rows=2, cols=1, shared_xaxes=True, row_heights=[0.68, 0.32],
                    vertical_spacing=0.07)
for col, color, name, dash in [("open_share_all", BLUE, "All tokens", "solid"),
                               ("open_share_no_free", ORANGE, "Without free variants", "dash"),
                               ("open_share_stealth_revealed", GRAY,
                                "Stealth models as later revealed", "dot")]:
    fig.add_trace(go.Scatter(x=s.index, y=s[col], line=dict(color=color, width=1), opacity=0.22,
                             showlegend=False, hoverinfo="skip"), row=1, col=1)
    fig.add_trace(go.Scatter(x=a.index, y=a[col], name=name,
                             line=dict(color=color, width=2.6 if dash == "solid" else 2, dash=dash),
                             hovertemplate="%{y:.1%}<extra>" + name + "</extra>"), row=1, col=1)
for col, color, name in [("free_share", BLUE, "Free variants"),
                         ("stealth_share", ORANGE, "Stealth models")]:
    fig.add_trace(go.Scatter(x=a.index, y=a[col], name=name, line=dict(color=color, width=1.8),
                             legendgroup="lower",
                             hovertemplate="%{y:.1%}<extra>" + name + "</extra>"), row=2, col=1)
fig.update_yaxes(title_text="Open-weight share", tickformat=".0%", range=[0, 1], row=1, col=1)
fig.update_yaxes(title_text="Share of tokens", tickformat=".0%", rangemode="tozero", row=2, col=1)
style(fig, title="Open-weight models' share of OpenRouter tokens", height=680, legend_rows=2)
write(fig, "1_share.qmd")

# ---------------------------------------------------------------- 2. levels
lv = levels.rolling(4, min_periods=4).mean()
fig = make_subplots(rows=2, cols=1, shared_xaxes=True, row_heights=[0.66, 0.34],
                    vertical_spacing=0.07)
fig.add_trace(go.Scatter(x=lv.index, y=lv["tokens_open"] / 1e12, name="Open-weight models",
                         line=dict(color=ORANGE, width=2.6),
                         hovertemplate="%{y:.2f}T<extra>Open</extra>"), row=1, col=1)
fig.add_trace(go.Scatter(x=lv.index, y=lv["tokens_closed"] / 1e12, name="Closed models",
                         line=dict(color=BLUE, width=2.6),
                         hovertemplate="%{y:.2f}T<extra>Closed</extra>"), row=1, col=1)
fig.add_trace(go.Scatter(x=lv.index, y=lv["share_open"], name="Open share of paid tokens",
                         line=dict(color=ORANGE, width=2),
                         hovertemplate="%{y:.1%}<extra>Open share</extra>"), row=2, col=1)
fig.update_yaxes(title_text="Tokens per week (T)", type="log", row=1, col=1)
fig.update_yaxes(title_text="Open share", tickformat=".0%", range=[0, 1], row=2, col=1)
style(fig, title="Both sides grew. Open grew faster.", height=660)
write(fig, "2_levels.qmd")

# ---------------------------------------------------------------- 3. price
pr = prices.rolling(4, min_periods=4).mean()
fig = go.Figure()
fig.add_trace(go.Scatter(x=pr.index, y=pr["ratio_g"], name="Price ratio, closed / open (model average)",
                         line=dict(color=BLUE, width=2.4),
                         hovertemplate="%{y:.1f}x<extra>Model average</extra>"))
fig.add_trace(go.Scatter(x=pr.index, y=pr["ratio_w"], name="Price ratio (token-weighted)",
                         line=dict(color=BLUE, width=1.3, dash="dash"),
                         hovertemplate="%{y:.1f}x<extra>Token-weighted</extra>"))
fig.add_trace(go.Scatter(x=pr.index, y=pr["open_share_paid"], name="Open share of paid tokens",
                         yaxis="y2", line=dict(color=ORANGE, width=2.6),
                         hovertemplate="%{y:.1%}<extra>Open share</extra>"))
style(fig, title="The price gap barely moved while the share tripled", height=540,
      yaxis=dict(title="Closed price / open price", type="log"),
      yaxis2=dict(title="Open share of paid tokens", overlaying="y", side="right",
                  tickformat=".0%", range=[0, 1], showgrid=False))
write(fig, "3_price.qmd")

# ---------------------------------------------------------------- 4. quality
q = quality.copy()
q["frontier_rel"] = np.log(q["front_closed"] / q["front_open"])
qa = q.rolling(4, min_periods=4).mean()
fig = make_subplots(rows=2, cols=1, shared_xaxes=True, row_heights=[0.6, 0.4],
                    vertical_spacing=0.08, specs=[[{}], [{"secondary_y": True}]])
fig.add_trace(go.Scatter(x=q.index, y=q["front_closed"], name="Best closed model",
                         line=dict(color=BLUE, width=2.4, shape="hv"),
                         hovertemplate="%{y:.1f}<extra>Best closed</extra>"), row=1, col=1)
fig.add_trace(go.Scatter(x=q.index, y=q["front_open"], name="Best open model",
                         line=dict(color=ORANGE, width=2.4, shape="hv"),
                         hovertemplate="%{y:.1f}<extra>Best open</extra>"), row=1, col=1)
fig.add_trace(go.Scatter(x=qa.index, y=qa["frontier_rel"], name="Relative gap, log(closed / open)",
                         line=dict(color=GRAY, width=2.2),
                         hovertemplate="%{y:.2f}<extra>Relative gap</extra>"),
              row=2, col=1, secondary_y=False)
fig.add_trace(go.Scatter(x=qa.index, y=qa["open_share_paid"], name="Open share of paid tokens",
                         line=dict(color=ORANGE, width=2.2, dash="dot"),
                         hovertemplate="%{y:.1%}<extra>Open share</extra>"),
              row=2, col=1, secondary_y=True)
fig.update_yaxes(title_text="Intelligence Index", row=1, col=1)
fig.update_yaxes(title_text="log(closed / open)", row=2, col=1, secondary_y=False)
fig.update_yaxes(title_text="Open share", tickformat=".0%", range=[0, 1], showgrid=False,
                 row=2, col=1, secondary_y=True)
style(fig, title="The frontier on each side, and the relative gap", height=700, legend_rows=2)
write(fig, "4_quality.qmd")

# ---------------------------------------------------------------- 5. event study
PRE, POST = 4, 8
y = events["y"].to_numpy()


def path(mask):
    rows = []
    for i in np.where(mask.to_numpy())[0]:
        if i - PRE < 0 or i + POST >= len(y):
            continue
        rows.append(y[i - PRE:i + POST + 1] - y[i])
    return np.array(rows)


x = np.arange(-PRE, POST + 1)
fig = go.Figure()
for col, color, label in [("open_event", ORANGE, "Best open model improves"),
                          ("closed_event", BLUE, "Best closed model improves"),
                          ("no_event", GRAY, "No frontier change")]:
    p = path(events[col] == 1)
    if len(p) == 0:
        continue
    m = p.mean(axis=0)
    if len(p) > 1:
        se = p.std(axis=0, ddof=1) / np.sqrt(len(p))
        rgb = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
        fig.add_trace(go.Scatter(x=np.concatenate([x, x[::-1]]),
                                 y=np.concatenate([m + se, (m - se)[::-1]]),
                                 fill="toself", fillcolor=f"rgba{rgb + (0.13,)}",
                                 line=dict(width=0), hoverinfo="skip", showlegend=False))
    fig.add_trace(go.Scatter(x=x, y=m, name=f"{label} (n={len(p)})",
                             line=dict(color=color, width=2.4),
                             hovertemplate="%{y:+.3f}<extra>" + label + "</extra>"))
fig.add_vline(x=0, line=dict(color="#cccccc", width=1))
style(fig, title="Nothing happens after a release", height=540, hovermode="x",
      xaxis=dict(title="Weeks from the event"),
      yaxis=dict(title="Change in log odds of the open share"))
write(fig, "5_event.qmd")

# ---------------------------------------------------------------- 6. spend
sp = spend.rolling(4, min_periods=4).mean()
fig = make_subplots(rows=2, cols=1, shared_xaxes=True, row_heights=[0.62, 0.38],
                    vertical_spacing=0.08)
fig.add_trace(go.Scatter(x=sp.index, y=sp["token_share_open"], name="Share of tokens",
                         line=dict(color=ORANGE, width=2.6),
                         hovertemplate="%{y:.1%}<extra>Tokens</extra>"), row=1, col=1)
fig.add_trace(go.Scatter(x=sp.index, y=sp["spend_share_open"], name="Share of spend",
                         line=dict(color=BLUE, width=2.6), fill="tonexty",
                         fillcolor="rgba(224,123,36,0.12)",
                         hovertemplate="%{y:.1%}<extra>Spend</extra>"), row=1, col=1)
fig.add_trace(go.Scatter(x=sp.index, y=sp["hhi_tokens"], name="Concentration of tokens (HHI)",
                         line=dict(color=ORANGE, width=1.9, dash="dot"),
                         hovertemplate="%{y:.2f}<extra>Token HHI</extra>"), row=2, col=1)
fig.add_trace(go.Scatter(x=sp.index, y=sp["hhi_spend"], name="Concentration of spend (HHI)",
                         line=dict(color=BLUE, width=1.9, dash="dot"),
                         hovertemplate="%{y:.2f}<extra>Spend HHI</extra>"), row=2, col=1)
fig.update_yaxes(title_text="Open-weight share", tickformat=".0%", range=[0, 1], row=1, col=1)
fig.update_yaxes(title_text="Herfindahl index", range=[0, 1], row=2, col=1)
style(fig, title="Open models take the tokens; closed models take the money", height=700, legend_rows=2)
write(fig, "6_spend.qmd")

print("\nAll figures written to", FIGS.resolve())
