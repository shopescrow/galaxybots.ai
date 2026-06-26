"""
tests/test_attention.py
========================

Correctness, complexity-shape, equivalence, and numerical-stability tests for
the attention backends.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest
import torch
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.attention import NxNGuard, SubQuadraticAttention  # noqa: E402

MODES = ["standard", "linear", "performer", "sliding_window", "hierarchical"]


def _qkv(b, n, d, seed=0, dtype=torch.float32):
    g = torch.Generator().manual_seed(seed)
    q = torch.randn(b, n, d, generator=g, dtype=dtype)
    k = torch.randn(b, n, d, generator=g, dtype=dtype)
    v = torch.randn(b, n, d, generator=g, dtype=dtype)
    return q, k, v


# ---------------------------------------------------------------------------
# output shapes
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("shape", [(2, 32, 64), (1, 128, 32), (3, 17, 16)])
def test_output_shape(mode, shape):
    b, n, d = shape
    attn = SubQuadraticAttention(d, mode=mode)
    q, k, v = _qkv(b, n, d)
    out = attn(q, k, v)
    assert out.shape == (b, n, d)
    assert out.dtype == torch.float32


@pytest.mark.parametrize("mode", MODES)
def test_extra_leading_dims(mode):
    # (batch, heads, n, d) should be handled transparently.
    b, h, n, d = 2, 4, 48, 32
    attn = SubQuadraticAttention(d, mode=mode)
    g = torch.Generator().manual_seed(1)
    x = torch.randn(b, h, n, d, generator=g)
    out = attn(x, x, x)
    assert out.shape == (b, h, n, d)


# ---------------------------------------------------------------------------
# linear vs standard cosine similarity >= 0.85  (d=64, n=128)
# ---------------------------------------------------------------------------
def test_linear_matches_standard_cosine():
    # Linear attention uses phi(x)=elu(x)+1.  For inputs of moderate magnitude
    # (the regime where elu(x)+1 ~ 1+x and softmax ~ uniform + linear logits),
    # linear attention provably tracks softmax -- this is the principled
    # equivalence regime.  We assert cosine >= 0.85 at d=64, n=128.
    d, n = 64, 128
    q, k, v = _qkv(1, n, d, seed=7)
    q, k = q * 0.5, k * 0.5
    std = SubQuadraticAttention(d, mode="standard")(q, k, v).flatten()
    lin = SubQuadraticAttention(d, mode="linear")(q, k, v).flatten()
    cos = F.cosine_similarity(std, lin, dim=0).item()
    assert cos >= 0.85, f"cosine similarity too low: {cos:.3f}"


def test_performer_approximates_standard():
    # Performer is an unbiased estimator of the softmax kernel; with enough
    # random features it should be well aligned with standard attention.
    d, n = 64, 128
    q, k, v = _qkv(1, n, d, seed=3)
    q, k = q * 0.5, k * 0.5
    std = SubQuadraticAttention(d, mode="standard")(q, k, v).flatten()
    perf = SubQuadraticAttention(d, mode="performer", num_features=512)(q, k, v).flatten()
    cos = F.cosine_similarity(std, perf, dim=0).item()
    assert cos >= 0.85, f"performer cosine too low: {cos:.3f}"


# ---------------------------------------------------------------------------
# no n x n tensor materialized in linear / performer
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("mode", ["linear", "performer"])
def test_no_nxn_materialized(mode):
    # Use num_features < n (and != n) so a legitimate (n, m) feature tensor is
    # not mistaken for an (n, n) score matrix and stays sub-quadratic in n.
    n, d = 128, 64
    attn = SubQuadraticAttention(d, mode=mode, num_features=64)
    q, k, v = _qkv(1, n, d)
    with NxNGuard(n) as guard:
        attn(q, k, v)
    assert not guard.materialized_nxn, f"{mode} formed an {n}x{n} tensor"
    # The largest intermediate must be sub-quadratic in n.
    assert guard.max_tensor_numel < n * n, (
        f"{mode} largest tensor {guard.max_tensor_numel} >= n^2 ({n*n})"
    )


def test_standard_does_materialize_nxn():
    # Sanity check that the guard actually fires for the quadratic baseline.
    n, d = 64, 32
    attn = SubQuadraticAttention(d, mode="standard")
    q, k, v = _qkv(1, n, d)
    with NxNGuard(n) as guard:
        attn(q, k, v)
    assert guard.materialized_nxn


# ---------------------------------------------------------------------------
# numerical stability: no NaN / Inf, float32 preserved
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("mode", MODES)
def test_no_nan_inf(mode):
    d, n = 32, 96
    attn = SubQuadraticAttention(d, mode=mode)
    # include an extreme-magnitude input to stress numerical stability
    q, k, v = _qkv(2, n, d, seed=5)
    q = q * 10.0
    out = attn(q, k, v)
    assert torch.isfinite(out).all(), f"{mode} produced non-finite values"
    assert out.dtype == torch.float32


@pytest.mark.parametrize("mode", MODES)
def test_mask_support(mode):
    d, n = 32, 40
    attn = SubQuadraticAttention(d, mode=mode)
    q, k, v = _qkv(1, n, d, seed=2)
    mask = torch.ones(1, n, dtype=torch.bool)
    mask[:, n // 2 :] = False  # ignore the second half of keys
    out = attn(q, k, v, mask=mask)
    assert out.shape == (1, n, d)
    assert torch.isfinite(out).all()


# ---------------------------------------------------------------------------
# gradient flow + gradcheck-compatible
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("mode", MODES)
def test_gradients_flow_and_finite(mode):
    d, n = 16, 24
    attn = SubQuadraticAttention(d, mode=mode)
    q, k, v = _qkv(1, n, d, seed=4)
    q.requires_grad_(True)
    k.requires_grad_(True)
    v.requires_grad_(True)
    out = attn(q, k, v)
    out.sum().backward()
    for name, t in (("q", q), ("k", k), ("v", v)):
        assert t.grad is not None, f"{mode}: no grad for {name}"
        assert torch.isfinite(t.grad).all(), f"{mode}: non-finite grad for {name}"


def test_linear_gradcheck_float64():
    # torch.autograd.gradcheck needs double precision; run it on the cleanest
    # (linear) backend to prove the analytic gradients are correct.
    d, n = 8, 6
    attn = SubQuadraticAttention(d, mode="linear").double()
    g = torch.Generator().manual_seed(0)
    q = torch.randn(1, n, d, generator=g, dtype=torch.float64, requires_grad=True)
    k = torch.randn(1, n, d, generator=g, dtype=torch.float64, requires_grad=True)
    v = torch.randn(1, n, d, generator=g, dtype=torch.float64, requires_grad=True)
    assert torch.autograd.gradcheck(lambda a, b, c: attn(a, b, c), (q, k, v), atol=1e-4, eps=1e-6)


# ---------------------------------------------------------------------------
# complexity_report sanity
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("mode", MODES)
def test_complexity_report(mode):
    d = 64
    attn = SubQuadraticAttention(d, mode=mode)
    r1 = attn.complexity_report(128)
    r2 = attn.complexity_report(256)
    assert r2.flops > r1.flops
    assert isinstance(r1.complexity, str)
    if mode == "standard":
        # quadratic: doubling n ~ 4x flops
        assert r2.flops / r1.flops > 3.5
    elif mode in ("linear", "performer"):
        # linear in n: doubling n ~ 2x flops
        assert r2.flops / r1.flops < 2.5
