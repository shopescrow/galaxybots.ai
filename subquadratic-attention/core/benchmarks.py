"""
core/benchmarks.py
==================

Timing + memory profiling utilities used by ``demo.py`` and the dashboard.

We benchmark the standard O(n^2) baseline against every sub-quadratic backend
across a sweep of sequence lengths, compute the crossover point (the ``n`` at
which a sub-quadratic backend overtakes standard attention on wall time), and
optionally render matplotlib plots.

Memory is profiled in two complementary ways:

  * theoretical: peak intermediate-tensor elements from the cost model
    (``complexity_report``) -- this is exact and noise-free.
  * empirical: ``tracemalloc`` peak Python/torch allocations around the call.
"""

from __future__ import annotations

import gc
import time
import tracemalloc
from dataclasses import dataclass, field
from typing import Optional

import torch

from .attention import SubQuadraticAttention

DEFAULT_SEQ_LENS = [8, 16, 32, 64, 128, 256, 512, 1024]
SUBQUADRATIC_MODES = ["linear", "performer", "sliding_window", "hierarchical"]


@dataclass
class BenchResult:
    mode: str
    seq_len: int
    d_model: int
    walltime_s: float
    theoretical_flops: float
    theoretical_mem_elems: float
    empirical_peak_bytes: int = 0


@dataclass
class BenchSuite:
    d_model: int
    seq_lens: list[int]
    results: list[BenchResult] = field(default_factory=list)

    def by_mode(self, mode: str) -> list[BenchResult]:
        return [r for r in self.results if r.mode == mode]

    def walltimes(self, mode: str) -> list[float]:
        return [r.walltime_s for r in self.by_mode(mode)]


def _make_inputs(batch: int, n: int, d: int, dtype=torch.float32):
    g = torch.Generator().manual_seed(0)
    q = torch.randn(batch, n, d, generator=g, dtype=dtype)
    k = torch.randn(batch, n, d, generator=g, dtype=dtype)
    v = torch.randn(batch, n, d, generator=g, dtype=dtype)
    return q, k, v


def time_attention(
    module: SubQuadraticAttention,
    n: int,
    d: int,
    batch: int = 1,
    repeats: int = 3,
    warmup: int = 1,
    track_memory: bool = True,
) -> tuple[float, int]:
    """Return (median wall time in seconds, empirical peak bytes) for one call."""
    q, k, v = _make_inputs(batch, n, d)

    with torch.no_grad():
        for _ in range(warmup):
            module(q, k, v)

        peak_bytes = 0
        if track_memory:
            gc.collect()
            tracemalloc.start()

        times = []
        for _ in range(repeats):
            t0 = time.perf_counter()
            module(q, k, v)
            times.append(time.perf_counter() - t0)

        if track_memory:
            _, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            peak_bytes = int(peak)

    times.sort()
    return times[len(times) // 2], peak_bytes


def run_benchmarks(
    d_model: int = 64,
    seq_lens: Optional[list[int]] = None,
    modes: Optional[list[str]] = None,
    include_standard: bool = True,
    batch: int = 1,
    repeats: int = 3,
    track_memory: bool = True,
    progress=None,
) -> BenchSuite:
    """Benchmark the requested modes across ``seq_lens``.

    ``progress`` is an optional callback ``progress(fraction, label)`` used by
    the Streamlit dashboard to drive a progress bar.
    """
    seq_lens = seq_lens or list(DEFAULT_SEQ_LENS)
    modes = list(modes or SUBQUADRATIC_MODES)
    all_modes = (["standard"] if include_standard else []) + modes

    suite = BenchSuite(d_model=d_model, seq_lens=seq_lens)
    total = len(all_modes) * len(seq_lens)
    done = 0
    for mode in all_modes:
        module = SubQuadraticAttention(d_model, mode=mode)
        for n in seq_lens:
            # The standard baseline blows up in memory at large n; guard it.
            if mode == "standard" and n > 4096:
                done += 1
                continue
            wt, peak = time_attention(
                module, n, d_model, batch=batch, repeats=repeats, track_memory=track_memory
            )
            rep = module.complexity_report(n)
            suite.results.append(
                BenchResult(
                    mode=mode,
                    seq_len=n,
                    d_model=d_model,
                    walltime_s=wt,
                    theoretical_flops=rep.flops,
                    theoretical_mem_elems=rep.peak_memory_elems,
                    empirical_peak_bytes=peak,
                )
            )
            done += 1
            if progress is not None:
                progress(done / total, f"{mode} @ n={n}")
    return suite


def crossover_point(suite: BenchSuite, mode: str) -> Optional[int]:
    """Smallest ``n`` at which ``mode`` is faster than the standard baseline.

    Returns ``None`` if the standard baseline was never benchmarked or the mode
    never overtakes it within the swept range.
    """
    std = {r.seq_len: r.walltime_s for r in suite.by_mode("standard")}
    if not std:
        return None
    for r in sorted(suite.by_mode(mode), key=lambda x: x.seq_len):
        if r.seq_len in std and r.walltime_s < std[r.seq_len]:
            return r.seq_len
    return None


def speedup_table(suite: BenchSuite) -> list[dict]:
    """Build a per-(mode,n) table of wall-time speedup + memory savings vs std."""
    std_time = {r.seq_len: r.walltime_s for r in suite.by_mode("standard")}
    std_mem = {r.seq_len: r.theoretical_mem_elems for r in suite.by_mode("standard")}
    rows = []
    for r in suite.results:
        if r.mode == "standard":
            continue
        st = std_time.get(r.seq_len)
        sm = std_mem.get(r.seq_len)
        rows.append(
            {
                "mode": r.mode,
                "seq_len": r.seq_len,
                "walltime_ms": r.walltime_s * 1e3,
                "std_walltime_ms": (st * 1e3) if st else None,
                "speedup": (st / r.walltime_s) if st and r.walltime_s > 0 else None,
                "flops": r.theoretical_flops,
                "memory_elems": r.theoretical_mem_elems,
                "memory_saved_x": (sm / r.theoretical_mem_elems) if sm else None,
            }
        )
    return rows


# ---------------------------------------------------------------------------
# plotting (matplotlib) -- returns Figure objects, never calls plt.show()
# ---------------------------------------------------------------------------
def plot_walltime(suite: BenchSuite):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(8, 5))
    modes = ["standard"] + [m for m in SUBQUADRATIC_MODES if suite.by_mode(m)]
    for mode in modes:
        rs = sorted(suite.by_mode(mode), key=lambda x: x.seq_len)
        if not rs:
            continue
        xs = [r.seq_len for r in rs]
        ys = [r.walltime_s * 1e3 for r in rs]
        ax.plot(xs, ys, marker="o", label=mode)
    ax.set_xscale("log", base=2)
    ax.set_yscale("log")
    ax.set_xlabel("sequence length n (agents)")
    ax.set_ylabel("wall time per call (ms)")
    ax.set_title("Attention wall time vs sequence length")
    ax.legend()
    ax.grid(True, which="both", ls=":", alpha=0.5)
    fig.tight_layout()
    return fig


def plot_theoretical_flops(d_model: int, seq_lens: Optional[list[int]] = None, modes=None):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    seq_lens = seq_lens or [2 ** i for i in range(3, 13)]
    modes = modes or (["standard"] + SUBQUADRATIC_MODES)
    fig, ax = plt.subplots(figsize=(8, 5))
    for mode in modes:
        module = SubQuadraticAttention(d_model, mode=mode)
        ys = [module.complexity_report(n).flops for n in seq_lens]
        ax.plot(seq_lens, ys, marker="o", label=f"{mode} ({module.complexity_report(seq_lens[-1]).complexity})")
    ax.set_xscale("log", base=2)
    ax.set_yscale("log")
    ax.set_xlabel("sequence length n")
    ax.set_ylabel("theoretical FLOPs")
    ax.set_title("Theoretical FLOPs vs sequence length (log-log)")
    ax.legend()
    ax.grid(True, which="both", ls=":", alpha=0.5)
    fig.tight_layout()
    return fig


__all__ = [
    "BenchResult",
    "BenchSuite",
    "run_benchmarks",
    "time_attention",
    "crossover_point",
    "speedup_table",
    "plot_walltime",
    "plot_theoretical_flops",
    "DEFAULT_SEQ_LENS",
    "SUBQUADRATIC_MODES",
]
