"""
dashboard.py
============

Streamlit dashboard that *visually proves* the sub-quadratic scaling advantage.

Three tabs:

  1. Architecture Explorer    -- pick a backend, slide n from 8..4096, and watch
                                 the theoretical FLOPs curve on a log-log plot,
                                 with the O(n^2) "scaling wall" highlighted.
  2. Live Agent Benchmark     -- run real wall-time + memory benchmarks across a
                                 sweep of agent counts with a progress bar, and
                                 read off the efficiency gain vs the quadratic
                                 baseline.
  3. Agent Communication      -- a force-directed graph of 16..64 agents, with
                                 animated activation during collective reasoning,
                                 attention weights drawn as edge opacity, and
                                 visible cluster boundaries in hierarchical mode.

Run with:  streamlit run dashboard.py --server.port 5000
"""

from __future__ import annotations

import math
import time

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import networkx as nx
import numpy as np
import streamlit as st
import torch

from core import SubQuadraticAttention
from core.agent_pool import AGIAgentPool
from core import benchmarks as bench

st.set_page_config(page_title="Sub-Quadratic Attention", layout="wide")

MODES = ["standard", "linear", "performer", "sliding_window", "hierarchical"]
SUB_MODES = ["linear", "performer", "sliding_window", "hierarchical"]

st.title("Sub-Quadratic Attention for Scaling Agent Networks")
st.caption(
    "Replacing O(n^2) self-attention with selectable sub-quadratic backends so "
    "autonomous agent swarms can scale horizontally without quadratic blow-up."
)

tab_arch, tab_bench, tab_comm = st.tabs(
    ["Architecture Explorer", "Live Agent Benchmark", "Agent Communication Visualizer"]
)


# ---------------------------------------------------------------------------
# Tab 1: Architecture Explorer
# ---------------------------------------------------------------------------
with tab_arch:
    st.subheader("Architecture Explorer")
    st.write(
        "Compare the *theoretical* cost of each attention backend. The dashed "
        "red curve is standard O(n^2) attention -- the scaling wall we break."
    )
    col_a, col_b = st.columns([1, 3])
    with col_a:
        mode = st.selectbox("Backend", SUB_MODES, index=0, key="arch_mode")
        d_model = st.select_slider("d_model", options=[16, 32, 64, 128, 256], value=64)
        n_max = st.slider("max sequence length n", min_value=8, max_value=4096, value=1024, step=8)
        num_features = st.slider("Performer features (m)", 32, 1024, 256, 32)
        window = st.slider("Sliding window (w)", 8, 512, 64, 8)

        attn = SubQuadraticAttention(
            d_model, mode=mode, num_features=num_features, window_size=window
        )
        std = SubQuadraticAttention(d_model, mode="standard")
        rep = attn.complexity_report(n_max)
        std_rep = std.complexity_report(n_max)
        st.metric("Backend complexity", rep.complexity)
        st.metric(
            "FLOP speedup @ n_max",
            f"{std_rep.flops / max(rep.flops, 1.0):,.1f}x",
        )
        st.metric(
            "Memory saved @ n_max",
            f"{std_rep.peak_memory_elems / max(rep.peak_memory_elems, 1.0):,.1f}x",
        )

    with col_b:
        ns = [n for n in [2 ** i for i in range(3, 13)] if n <= n_max]
        if ns[-1] != n_max:
            ns.append(n_max)
        fig, ax = plt.subplots(figsize=(8, 5))
        std_y = [std.complexity_report(n).flops for n in ns]
        sub_y = [attn.complexity_report(n).flops for n in ns]
        ax.plot(ns, std_y, "r--o", label=f"standard {std.complexity_report(ns[-1]).complexity}")
        ax.plot(ns, sub_y, "b-o", label=f"{mode} {attn.complexity_report(ns[-1]).complexity}")
        ax.fill_between(ns, sub_y, std_y, color="red", alpha=0.08, label="cost avoided")
        ax.set_xscale("log", base=2)
        ax.set_yscale("log")
        ax.set_xlabel("sequence length n (agents)")
        ax.set_ylabel("theoretical FLOPs (log)")
        ax.set_title("Theoretical FLOPs vs n (log-log)")
        ax.grid(True, which="both", ls=":", alpha=0.5)
        ax.legend()
        st.pyplot(fig)
        plt.close(fig)


# ---------------------------------------------------------------------------
# Tab 2: Live Agent Benchmark
# ---------------------------------------------------------------------------
with tab_bench:
    st.subheader("Live Agent Benchmark")
    st.write("Run real, on-CPU wall-time and memory benchmarks across agent counts.")

    c1, c2, c3 = st.columns(3)
    with c1:
        bench_modes = st.multiselect("Backends", SUB_MODES, default=["linear", "hierarchical"])
    with c2:
        bench_d = st.select_slider("d_model", options=[16, 32, 64, 128], value=64, key="bench_d")
    with c3:
        max_n = st.select_slider("max agents", options=[128, 256, 512, 1024], value=512)

    seq_lens = [n for n in bench.DEFAULT_SEQ_LENS if n <= max_n]

    if st.button("Run benchmark", type="primary"):
        if not bench_modes:
            st.warning("Pick at least one backend.")
        else:
            progress = st.progress(0.0, text="starting...")

            def _cb(frac, label):
                progress.progress(min(frac, 1.0), text=label)

            suite = bench.run_benchmarks(
                d_model=bench_d,
                seq_lens=seq_lens,
                modes=bench_modes,
                include_standard=True,
                progress=_cb,
            )
            progress.progress(1.0, text="done")
            st.session_state["suite"] = suite

    suite = st.session_state.get("suite")
    if suite is not None:
        # Wall-time chart
        fig_t, ax_t = plt.subplots(figsize=(8, 4.5))
        for m in ["standard"] + [m for m in SUB_MODES if suite.by_mode(m)]:
            rs = sorted(suite.by_mode(m), key=lambda r: r.seq_len)
            if rs:
                ax_t.plot([r.seq_len for r in rs], [r.walltime_s * 1e3 for r in rs], marker="o", label=m)
        ax_t.set_xscale("log", base=2)
        ax_t.set_yscale("log")
        ax_t.set_xlabel("agents (n)")
        ax_t.set_ylabel("wall time / call (ms)")
        ax_t.set_title("Measured wall time")
        ax_t.grid(True, which="both", ls=":", alpha=0.5)
        ax_t.legend()

        # Memory chart (theoretical elements)
        fig_m, ax_m = plt.subplots(figsize=(8, 4.5))
        for m in ["standard"] + [m for m in SUB_MODES if suite.by_mode(m)]:
            rs = sorted(suite.by_mode(m), key=lambda r: r.seq_len)
            if rs:
                ax_m.plot(
                    [r.seq_len for r in rs],
                    [r.theoretical_mem_elems for r in rs],
                    marker="s",
                    label=m,
                )
        ax_m.set_xscale("log", base=2)
        ax_m.set_yscale("log")
        ax_m.set_xlabel("agents (n)")
        ax_m.set_ylabel("peak intermediate (tensor elements)")
        ax_m.set_title("Peak memory footprint")
        ax_m.grid(True, which="both", ls=":", alpha=0.5)
        ax_m.legend()

        cc1, cc2 = st.columns(2)
        cc1.pyplot(fig_t)
        cc2.pyplot(fig_m)
        plt.close(fig_t)
        plt.close(fig_m)

        # Efficiency gain metrics vs quadratic baseline at the largest n.
        st.markdown("#### Efficiency gain vs quadratic baseline (largest n)")
        n_top = max(suite.seq_lens)
        std_top = next((r for r in suite.by_mode("standard") if r.seq_len == n_top), None)
        cols = st.columns(max(1, len(bench_modes)))
        for col, m in zip(cols, bench_modes):
            r = next((x for x in suite.by_mode(m) if x.seq_len == n_top), None)
            if r and std_top:
                speed = std_top.walltime_s / max(r.walltime_s, 1e-9)
                col.metric(f"{m} @ n={n_top}", f"{speed:,.1f}x faster", f"{r.walltime_s*1e3:.2f} ms")

        # Crossover table
        st.markdown("#### Crossover points (n where sub-quadratic overtakes O(n^2))")
        rows = []
        for m in bench_modes:
            cp = bench.crossover_point(suite, m)
            rows.append({"backend": m, "crossover n": cp if cp is not None else "—"})
        st.table(rows)


# ---------------------------------------------------------------------------
# Tab 3: Agent Communication Visualizer
# ---------------------------------------------------------------------------
with tab_comm:
    st.subheader("Agent Communication Visualizer")
    st.write(
        "A live agent swarm reasoning together. Node size/color = activation, "
        "edge opacity = attention weight. In hierarchical mode the cluster "
        "boundaries are drawn explicitly."
    )

    g1, g2, g3 = st.columns(3)
    with g1:
        comm_mode = st.selectbox("Backend", SUB_MODES, index=3, key="comm_mode")
    with g2:
        n_agents = st.slider("agents", 16, 64, 32, 4)
    with g3:
        edge_thresh = st.slider("edge visibility threshold", 0.0, 0.3, 0.05, 0.01)

    if "comm_pool" not in st.session_state or st.session_state.get("comm_cfg") != (comm_mode, n_agents):
        cluster = max(2, int(round(math.sqrt(n_agents)))) if comm_mode == "hierarchical" else None
        pool = AGIAgentPool(d_model=64, mode=comm_mode, seed=1, cluster_size=cluster)
        pool.spawn_many(n_agents)
        st.session_state["comm_pool"] = pool
        st.session_state["comm_cfg"] = (comm_mode, n_agents)
        st.session_state["comm_step"] = 0

    pool: AGIAgentPool = st.session_state["comm_pool"]

    b1, b2 = st.columns(2)
    if b1.button("Step reasoning", type="primary"):
        pool.collective_reasoning()
        st.session_state["comm_step"] += 1
    if b2.button("Reset states"):
        cluster = max(2, int(round(math.sqrt(n_agents)))) if comm_mode == "hierarchical" else None
        pool = AGIAgentPool(d_model=64, mode=comm_mode, seed=1, cluster_size=cluster)
        pool.spawn_many(n_agents)
        st.session_state["comm_pool"] = pool
        st.session_state["comm_step"] = 0

    st.caption(f"reasoning steps elapsed: {st.session_state.get('comm_step', 0)}")

    # Build a graph from the (capped) attention weights.
    weights = pool.attention_weights(max_agents=n_agents).cpu().numpy()
    acts = np.array([a.last_activation for a in pool.agents])
    if acts.max() <= 0:
        acts = np.array([float(a.state.norm()) for a in pool.agents])

    # Assign clusters for hierarchical layout/coloring.
    if comm_mode == "hierarchical":
        s = max(2, int(round(math.sqrt(n_agents))))
        cluster_of = [i // s for i in range(n_agents)]
    else:
        cluster_of = [0] * n_agents

    G = nx.DiGraph()
    for i in range(n_agents):
        G.add_node(i, cluster=cluster_of[i])
    for i in range(n_agents):
        for j in range(n_agents):
            if i != j and weights[i, j] >= edge_thresh:
                G.add_edge(i, j, weight=float(weights[i, j]))

    pos = nx.spring_layout(G, seed=2, k=1.2 / math.sqrt(max(n_agents, 1)), iterations=80)

    fig, ax = plt.subplots(figsize=(8, 6))
    cmap = plt.cm.viridis

    # cluster boundaries (convex hull-ish circles) for hierarchical mode
    if comm_mode == "hierarchical":
        n_clusters = max(cluster_of) + 1
        cluster_cmap = plt.cm.tab10
        for c in range(n_clusters):
            members = [i for i in range(n_agents) if cluster_of[i] == c]
            if not members:
                continue
            xs = np.array([pos[i][0] for i in members])
            ys = np.array([pos[i][1] for i in members])
            cx, cy = xs.mean(), ys.mean()
            radius = max(0.08, np.sqrt(((xs - cx) ** 2 + (ys - cy) ** 2).max()) + 0.05)
            circle = plt.Circle(
                (cx, cy), radius, color=cluster_cmap(c % 10), alpha=0.12, zorder=0
            )
            ax.add_patch(circle)
            ax.text(cx, cy + radius, f"cluster {c}", ha="center", fontsize=8, color=cluster_cmap(c % 10))

    # edges with opacity proportional to attention weight
    if G.number_of_edges() > 0:
        wmax = max(d["weight"] for *_, d in G.edges(data=True))
        for u, v, d in G.edges(data=True):
            alpha = min(1.0, 0.15 + 0.85 * d["weight"] / max(wmax, 1e-9))
            ax.annotate(
                "",
                xy=pos[v],
                xytext=pos[u],
                arrowprops=dict(arrowstyle="-|>", color="gray", alpha=alpha, lw=0.8),
                zorder=1,
            )

    # nodes sized + colored by activation
    a_min, a_max = acts.min(), acts.max()
    a_norm = (acts - a_min) / (a_max - a_min + 1e-9)
    for i in range(n_agents):
        x, y = pos[i]
        ax.scatter(
            x, y,
            s=120 + 480 * a_norm[i],
            c=[cmap(a_norm[i])],
            edgecolors="black",
            linewidths=0.5,
            zorder=2,
        )
        ax.text(x, y, str(i), ha="center", va="center", fontsize=6, color="white", zorder=3)

    ax.set_title(f"{comm_mode} swarm :: {n_agents} agents :: {G.number_of_edges()} active edges")
    ax.axis("off")
    sm = plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(vmin=a_min, vmax=a_max))
    sm.set_array([])
    fig.colorbar(sm, ax=ax, label="activation magnitude", fraction=0.04)
    st.pyplot(fig)
    plt.close(fig)

    rep = pool.scale_report(measure_walltime=True)
    m1, m2, m3 = st.columns(3)
    m1.metric("agents", rep["n_agents"])
    m2.metric("speedup vs O(n^2)", f"{rep['speedup_vs_standard']:,.1f}x")
    m3.metric("reasoning wall time", f"{(rep['actual_walltime_s'] or 0)*1e3:.2f} ms")
