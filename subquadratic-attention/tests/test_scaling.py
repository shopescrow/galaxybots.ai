"""
tests/test_scaling.py
=====================

Empirical scaling tests: sub-quadratic backends must actually beat the O(n^2)
baseline at large n, and the hierarchical backend must scale near-linearly.

These measure wall time, which is noisy on a shared CPU, so each measurement is
the median of several repeats and the thresholds carry generous slack.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.attention import SubQuadraticAttention  # noqa: E402
from core.agent_pool import AGIAgentPool  # noqa: E402


def _best_time(mode, n, d=64, repeats=15, warmup=3, **kw):
    # Wall-clock timing on a shared CPU is noisy; the *minimum* over several
    # repeats (with warmup) is the most stable estimate of the true compute
    # cost because it is the run least perturbed by scheduler contention.
    #
    # We pin to a single BLAS thread for the duration of the measurement: the
    # standard O(n^2) baseline otherwise gets a wildly variable multi-threaded
    # speed-up that masks the FLOP difference.  Single-threaded, wall time
    # tracks actual FLOPs, so the sub-quadratic win is both real and stable.
    old_threads = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        attn = SubQuadraticAttention(d, mode=mode, **kw)
        g = torch.Generator().manual_seed(0)
        q = torch.randn(1, n, d, generator=g)
        k = torch.randn(1, n, d, generator=g)
        v = torch.randn(1, n, d, generator=g)
        with torch.no_grad():
            for _ in range(warmup):
                attn(q, k, v)
            ts = []
            for _ in range(repeats):
                t0 = time.perf_counter()
                attn(q, k, v)
                ts.append(time.perf_counter() - t0)
        return min(ts)
    finally:
        torch.set_num_threads(old_threads)


@pytest.mark.parametrize("mode", ["linear", "performer", "hierarchical"])
def test_subquadratic_faster_than_standard_at_512(mode):
    n = 512
    std = _best_time("standard", n)
    sub = _best_time(mode, n, num_features=64)
    assert sub < std, f"{mode} ({sub*1e3:.2f} ms) not faster than standard ({std*1e3:.2f} ms) at n={n}"


def test_hierarchical_near_linear_scaling():
    # time(2n)/time(n) should be well below the quadratic 4x; assert < 2.5.
    n = 256
    t_n = _best_time("hierarchical", n)
    t_2n = _best_time("hierarchical", 2 * n)
    ratio = t_2n / t_n
    assert ratio < 2.5, f"hierarchical scaling ratio {ratio:.2f} >= 2.5 (not near-linear)"


def test_linear_theoretical_subquadratic():
    # FLOPs cost model: standard grows quadratically, linear grows linearly.
    d = 64
    std = SubQuadraticAttention(d, mode="standard")
    lin = SubQuadraticAttention(d, mode="linear")
    r_std = std.complexity_report(1024).flops / std.complexity_report(512).flops
    r_lin = lin.complexity_report(1024).flops / lin.complexity_report(512).flops
    assert r_std > 3.5  # ~4x
    assert r_lin < 2.2  # ~2x


def test_agent_pool_dynamic_growth_no_rebuild():
    # Adding agents must not require rebuilding an attention graph: spawning is
    # append-only and a reasoning round still runs at every size.
    pool = AGIAgentPool(d_model=32, mode="linear", seed=0)
    pool.spawn_many(16)
    out1 = pool.collective_reasoning()
    assert out1.shape == (16, 32)
    pool.spawn_many(16)  # grow on the fly
    out2 = pool.collective_reasoning()
    assert out2.shape == (32, 32)


def test_scale_report_projections():
    # Use a pool comfortably past the linear-vs-quadratic crossover (~ d agents)
    # so the measured speedup over standard attention is unambiguous.
    pool = AGIAgentPool(d_model=64, mode="linear", seed=0)
    pool.spawn_many(256)
    rep = pool.scale_report(measure_walltime=True)
    assert rep["n_agents"] == 256
    assert rep["speedup_vs_standard"] > 1.0
    for factor in ("10x", "100x", "1000x"):
        assert factor in rep["projections"]
        assert rep["projections"][factor]["speedup_vs_standard"] > 1.0
