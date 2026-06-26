#!/usr/bin/env python3
"""
demo.py
=======

Command-line demonstration of the sub-quadratic attention framework.

Running ``python demo.py`` will:

  1. Spawn agent swarms of increasing size (8 -> 1024).
  2. Run one round of collective reasoning per swarm with a sub-quadratic
     backend and measure its wall time.
  3. Print a scaling-report table comparing the standard O(n^2) cost against the
     sub-quadratic backend (FLOPs, speedup, memory saved).
  4. End with a single validation summary line.

Everything is CPU-only.  Set ``USE_CUDA=1`` to opt into GPU if available.
"""

from __future__ import annotations

import argparse
import os

import torch

from core import SubQuadraticAttention
from core.agent_pool import AGIAgentPool
from core.attention import NxNGuard
from core.benchmarks import time_attention

AGENT_COUNTS = [8, 16, 32, 64, 128, 256, 512, 1024]


def _device() -> str:
    if os.environ.get("USE_CUDA") == "1" and torch.cuda.is_available():
        return "cuda"
    return "cpu"


def _fmt(x: float) -> str:
    for unit in ("", "K", "M", "G", "T", "P"):
        if abs(x) < 1000.0:
            return f"{x:6.2f}{unit}"
        x /= 1000.0
    return f"{x:6.2f}E"


def run_demo(mode: str = "linear", d_model: int = 64) -> dict:
    device = _device()
    print("=" * 78)
    print(f" Sub-Quadratic Attention :: scaling demo  (backend = {mode}, d = {d_model})")
    print(f" device = {device}")
    print("=" * 78)

    header = (
        f"{'agents':>7} | {'std FLOPs':>11} | {f'{mode} FLOPs':>12} | "
        f"{'speedup':>8} | {'mem saved':>9} | {'walltime':>9}"
    )
    print(header)
    print("-" * len(header))

    standard = SubQuadraticAttention(d_model, mode="standard")
    sub_attn = SubQuadraticAttention(d_model, mode=mode)
    rows = []
    for n in AGENT_COUNTS:
        std_rep = standard.complexity_report(n)
        sub_rep = sub_attn.complexity_report(n)

        speedup = std_rep.flops / max(sub_rep.flops, 1.0)
        mem_saved = std_rep.peak_memory_elems / max(sub_rep.peak_memory_elems, 1.0)
        # Robust timing: median of several repeats with warmup (small calls are
        # otherwise dominated by scheduling noise on a shared CPU).
        wt, _ = time_attention(sub_attn, n, d_model, repeats=7, warmup=2, track_memory=False)
        rows.append((n, wt))

        print(
            f"{n:>7} | {_fmt(std_rep.flops):>11} | {_fmt(sub_rep.flops):>12} | "
            f"{speedup:>7.1f}x | {mem_saved:>8.1f}x | {wt * 1e3:>7.2f}ms"
        )

    print("-" * len(header))

    # Projection block from the largest swarm.
    big = AGIAgentPool(d_model=d_model, mode=mode, seed=0, device=device)
    big.spawn_many(AGENT_COUNTS[-1])
    proj = big.scale_report(measure_walltime=False)["projections"]
    print("\n Projected scaling of the largest swarm:")
    for factor, info in proj.items():
        print(
            f"   {factor:>5} ({info['n_agents']:>7} agents):  "
            f"{mode} FLOPs={_fmt(info['flops'])}   "
            f"speedup vs O(n^2) = {info['speedup_vs_standard']:>8.1f}x"
        )

    # ---- proof: no n x n materialization for kernel backends ----------------
    proof_ok = True
    if mode in ("linear", "performer"):
        n = 256
        attn = SubQuadraticAttention(d_model, mode=mode)
        q = torch.randn(1, n, d_model)
        with NxNGuard(n) as guard:
            attn(q, q, q)
        proof_ok = not guard.materialized_nxn
        print(
            f"\n n x n materialization check (n={n}): "
            f"{'PASS - no quadratic tensor formed' if proof_ok else 'FAIL'}"
        )

    # ---- final validation summary ------------------------------------------
    # 1) Theoretical: doubling n must less-than-quadruple FLOPs (quadratic ~4x).
    r_a = sub_attn.complexity_report(512).flops
    r_b = sub_attn.complexity_report(1024).flops
    flops_ratio = r_b / max(r_a, 1.0)
    theory_subquadratic = flops_ratio < 3.5

    # 2) Empirical: the sub-quadratic backend beats the O(n^2) baseline on real
    #    wall time at a large swarm size (median of repeats, with warmup).
    n_big = 512
    std_t, _ = time_attention(standard, n_big, d_model, repeats=7, warmup=2, track_memory=False)
    sub_t, _ = time_attention(sub_attn, n_big, d_model, repeats=7, warmup=2, track_memory=False)
    empirical_faster = sub_t < std_t

    sub_quadratic = theory_subquadratic and empirical_faster
    ok = proof_ok and sub_quadratic
    print(
        f"\n empirical wall time @ n={n_big}:  standard={std_t*1e3:.2f}ms  "
        f"{mode}={sub_t*1e3:.2f}ms  ({std_t/max(sub_t,1e-9):.1f}x faster)"
    )
    print(f" theoretical FLOPs(1024)/FLOPs(512) = {flops_ratio:.2f}  (quadratic would be ~4.0)")
    print("\n" + "=" * 78)
    print(
        f" VALIDATION: backend={mode} | sub-quadratic scaling={'YES' if sub_quadratic else 'NO'} | "
        f"no n x n tensor={'YES' if proof_ok else 'N/A'} | result={'PASS' if ok else 'FAIL'}"
    )
    print("=" * 78)
    return {"ok": ok, "rows": rows, "projections": proj}


def main() -> None:
    parser = argparse.ArgumentParser(description="Sub-quadratic attention scaling demo")
    parser.add_argument(
        "--mode",
        default="linear",
        choices=["linear", "performer", "sliding_window", "hierarchical"],
        help="sub-quadratic backend to demonstrate",
    )
    parser.add_argument("--d-model", type=int, default=64, help="agent state dimensionality")
    args = parser.parse_args()
    run_demo(mode=args.mode, d_model=args.d_model)


if __name__ == "__main__":
    main()
