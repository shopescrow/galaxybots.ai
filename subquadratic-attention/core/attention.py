"""
core/attention.py
==================

Selectable sub-quadratic self-attention backends, implemented from scratch on
top of PyTorch (CPU-first, no flash-attention / xformers / external kernels).

Standard scaled dot-product attention costs O(n^2 * d) time and, worse, it
*materializes* an n x n score matrix which costs O(n^2) memory.  For autonomous
agent networks (GalaxyBots.ai agent-to-agent communication) the number of
participants ``n`` is exactly the thing we want to scale, so the quadratic term
is the scaling wall we are trying to break.

This module provides ``SubQuadraticAttention`` with four selectable backends:

    "linear"        - kernel feature map phi(x)=elu(x)+1, computes K^T V first
                      so no n x n matrix is ever formed.            O(n d^2)
    "performer"     - FAVOR+ positive orthogonal random features, a provably
                      unbiased approximation of softmax attention.  O(n m d)
    "sliding_window"- Longformer-style local band + a few global control
                      tokens that every position can see.           O(n (w+g) d)
    "hierarchical"  - cluster tokens into ~sqrt(n) groups, do full attention
                      *inside* each group, and let group centroids exchange
                      information so distant tokens still communicate.  ~O(n^1.5 d)

Every backend also exposes ``complexity_report(seq_len)`` returning the FLOPs and
peak-memory model used by the benchmark + dashboard layers.

The ``"standard"`` mode is kept as the O(n^2) baseline we compare against.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F


# ---------------------------------------------------------------------------
# n x n materialization guard
# ---------------------------------------------------------------------------
class NxNGuard(torch.overrides.TorchFunctionMode):
    """A ``TorchFunctionMode`` that watches *every* torch operation executed
    inside its ``with`` block and records the shape of each output tensor.

    Because it sits at the public torch dispatch layer it cannot be "cheated":
    if any code path constructs a tensor whose last two dimensions are both
    equal to ``seq_len`` (i.e. an n x n score matrix), this guard will see it.
    We use it in the test-suite to *prove* the linear/performer backends never
    materialize the quadratic score matrix.
    """

    def __init__(self, seq_len: int) -> None:
        super().__init__()
        self.seq_len = seq_len
        self.materialized_nxn = False
        self.max_tensor_numel = 0
        self.largest_shape: tuple[int, ...] = ()

    def __torch_function__(self, func, types, args=(), kwargs=None):
        kwargs = kwargs or {}
        out = func(*args, **kwargs)
        self._inspect(out)
        return out

    def _inspect(self, out) -> None:
        if isinstance(out, torch.Tensor):
            if out.dim() >= 2 and out.shape[-1] == self.seq_len and out.shape[-2] == self.seq_len:
                self.materialized_nxn = True
            if out.numel() > self.max_tensor_numel:
                self.max_tensor_numel = out.numel()
                self.largest_shape = tuple(out.shape)
        elif isinstance(out, (tuple, list)):
            for o in out:
                self._inspect(o)


@dataclass
class ComplexityReport:
    """Theoretical cost model for one attention call at a given sequence length."""

    mode: str
    seq_len: int
    d_model: int
    flops: float
    peak_memory_elems: float
    complexity: str  # human-readable Big-O string

    def as_dict(self) -> dict:
        return {
            "mode": self.mode,
            "seq_len": self.seq_len,
            "d_model": self.d_model,
            "flops": self.flops,
            "peak_memory_elems": self.peak_memory_elems,
            "complexity": self.complexity,
        }


class SubQuadraticAttention(nn.Module):
    """Drop-in self-attention with a selectable sub-quadratic backend.

    Parameters
    ----------
    d_model:
        Feature dimension of queries / keys / values.
    mode:
        One of ``{"standard", "linear", "performer", "sliding_window",
        "hierarchical"}``.
    num_features:
        Number of random features ``m`` for the Performer backend.
    window_size:
        Local attention window ``w`` (total width) for sliding-window mode.
    num_global:
        Number of leading "global control tokens" ``g`` that every position can
        attend to (and which attend to everyone) in sliding-window mode.
    cluster_size:
        Token group size for hierarchical mode.  ``None`` -> auto ``sqrt(n)``.
    eps:
        Numerical-stability floor used in denominators.

    The forward signature is ``forward(Q, K, V, mask=None)`` where ``Q, K, V``
    have shape ``(..., n, d)`` (any number of leading/batch/head dims) and the
    optional ``mask`` is a key-padding mask of shape ``(..., n)`` (``True`` =
    keep, ``False`` = ignore).
    """

    VALID_MODES = ("standard", "linear", "performer", "sliding_window", "hierarchical")

    def __init__(
        self,
        d_model: int,
        mode: str = "linear",
        num_features: int = 256,
        window_size: int = 64,
        num_global: int = 4,
        cluster_size: Optional[int] = None,
        eps: float = 1e-6,
    ) -> None:
        super().__init__()
        if mode not in self.VALID_MODES:
            raise ValueError(f"mode must be one of {self.VALID_MODES}, got {mode!r}")
        self.d_model = d_model
        self.mode = mode
        self.num_features = num_features
        self.window_size = window_size
        self.num_global = num_global
        self.cluster_size = cluster_size
        self.eps = eps

        # The Performer random-feature projection is created lazily (and cached)
        # on first use because its size depends on d_model and num_features.
        # Registered as a buffer so it moves with .to(device)/.double() and is
        # *not* a learnable parameter (random features are fixed once drawn).
        self.register_buffer("_perf_projection", torch.empty(0), persistent=False)

    # ------------------------------------------------------------------
    # shape helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _flatten_batch(x: torch.Tensor) -> tuple[torch.Tensor, tuple[int, ...]]:
        """Collapse all leading dims into a single batch dim -> (B, n, d)."""
        *lead, n, d = x.shape
        return x.reshape(-1, n, d), tuple(lead)

    @staticmethod
    def _restore_batch(x: torch.Tensor, lead: tuple[int, ...]) -> torch.Tensor:
        n, d = x.shape[-2], x.shape[-1]
        return x.reshape(*lead, n, d)

    # ------------------------------------------------------------------
    # forward dispatch
    # ------------------------------------------------------------------
    def forward(
        self,
        Q: torch.Tensor,
        K: torch.Tensor,
        V: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        if Q.dim() < 2:
            raise ValueError("Q/K/V must have shape (..., n, d)")

        q, lead = self._flatten_batch(Q)
        k, _ = self._flatten_batch(K)
        v, _ = self._flatten_batch(V)

        # Normalize the mask to (B, n) boolean if provided.
        m = None
        if mask is not None:
            m = mask.reshape(q.shape[0], q.shape[1]).bool()

        if self.mode == "standard":
            out = self._standard(q, k, v, m)
        elif self.mode == "linear":
            out = self._linear(q, k, v, m)
        elif self.mode == "performer":
            out = self._performer(q, k, v, m)
        elif self.mode == "sliding_window":
            out = self._sliding_window(q, k, v, m)
        else:  # hierarchical
            out = self._hierarchical(q, k, v, m)

        return self._restore_batch(out, lead)

    # ------------------------------------------------------------------
    # 0) Standard O(n^2) baseline
    # ------------------------------------------------------------------
    def _standard(self, q, k, v, m):
        """Textbook scaled dot-product attention.

        scores = Q K^T / sqrt(d)          -> (B, n, n)   <-- the quadratic wall
        attn   = softmax(scores)          -> (B, n, n)
        out    = attn V                   -> (B, n, d)
        """
        d = q.shape[-1]
        scores = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(d)  # (B, n, n)
        if m is not None:
            # mask is over keys: broadcast (B, 1, n)
            scores = scores.masked_fill(~m.unsqueeze(1), float("-inf"))
        attn = torch.softmax(scores, dim=-1)
        return torch.matmul(attn, v)

    # ------------------------------------------------------------------
    # 1) Linear attention  (phi(x) = elu(x) + 1)
    # ------------------------------------------------------------------
    def _feature_map(self, x: torch.Tensor) -> torch.Tensor:
        """Non-negative feature map phi(x) = elu(x) + 1.

        Non-negativity matters: it keeps the implicit attention weights
        positive so the linear-attention denominator (a sum of inner products
        of non-negative vectors) is strictly positive and the result behaves
        like a proper weighted average.
        """
        return F.elu(x) + 1.0

    def _linear(self, q, k, v, m):
        """Linear attention via the kernel/associativity trick.

        softmax attention is  out_i = sum_j  (phi(q_i).phi(k_j)) v_j
                                       / sum_j (phi(q_i).phi(k_j))

        The key insight is associativity of the (un-normalized) numerator:

            sum_j (phi(q_i)^T phi(k_j)) v_j
              = phi(q_i)^T ( sum_j phi(k_j) v_j^T )
              = phi(q_i)^T  *  KV                      where KV = sum_j phi(k_j) v_j^T

        ``KV`` has shape (d, d_v) -- it is *independent of n^2*.  We compute it
        once, so the whole op is O(n d^2) time and O(n d + d^2) memory.  No n x n
        matrix is ever formed.
        """
        phi_q = self._feature_map(q)  # (B, n, d)
        phi_k = self._feature_map(k)  # (B, n, d)

        if m is not None:
            # Zero out padded keys so they contribute nothing to the sums.
            phi_k = phi_k * m.unsqueeze(-1).to(phi_k.dtype)

        # KV = phi_k^T @ V  -> (B, d, d_v).  This is the "compute K.V first" step.
        kv = torch.einsum("bnd,bne->bde", phi_k, v)  # (B, d, d_v)

        # Denominator normalizer: phi_q . (sum_j phi_k_j)  -> (B, n)
        k_sum = phi_k.sum(dim=1)  # (B, d)
        z = torch.einsum("bnd,bd->bn", phi_q, k_sum)  # (B, n)
        z = z.clamp_min(self.eps)

        # Numerator: phi_q @ KV  -> (B, n, d_v)
        num = torch.einsum("bnd,bde->bne", phi_q, kv)
        return num / z.unsqueeze(-1)

    # ------------------------------------------------------------------
    # 2) Performer  (FAVOR+ positive orthogonal random features)
    # ------------------------------------------------------------------
    def _orthogonal_features(self, m_feat: int, d: int, device, dtype) -> torch.Tensor:
        """Build an (m_feat, d) random projection with *orthogonal* rows.

        FAVOR+ shows that making the random projection rows orthogonal (within
        each d-sized block) sharply reduces the variance of the softmax-kernel
        estimate.  We build it from scratch:

            1. draw an iid Gaussian block            (torch.randn)
            2. orthonormalize its rows               (QR decomposition)
            3. rescale rows back to chi-distributed lengths so the marginal of
               each row matches an iid Gaussian (preserves unbiasedness).

        Blocks are stacked when m_feat > d.
        """
        blocks = []
        remaining = m_feat
        while remaining > 0:
            rows = min(d, remaining)
            g = torch.randn(d, d, device=device, dtype=dtype)
            # QR gives Q with orthonormal columns; transpose -> orthonormal rows.
            q_mat, _ = torch.linalg.qr(g)
            blocks.append(q_mat[:rows])
            remaining -= rows
        ortho = torch.cat(blocks, dim=0)  # (m_feat, d), orthonormal rows

        # Rescale each row to a chi-distributed norm so the row marginals match
        # iid N(0, I) draws (this keeps the kernel estimator unbiased).
        norms = torch.randn(m_feat, d, device=device, dtype=dtype).norm(dim=1, keepdim=True)
        return ortho * norms  # (m_feat, d)

    def _performer_features(self, x: torch.Tensor, projection: torch.Tensor) -> torch.Tensor:
        """Positive random features approximating exp(q.k) softmax kernel.

            phi(x) = exp(W x - ||x||^2 / 2) / sqrt(m)

        with a per-row max subtracted for numerical stability.  Using the
        *positive* (exp) features -- rather than trigonometric ones -- keeps all
        features non-negative, which is what makes the linear-attention
        denominator well-behaved (FAVOR+).
        """
        m_feat = projection.shape[0]
        # Wx : (B, n, m)
        proj = torch.einsum("bnd,md->bnm", x, projection)
        x_sq = (x * x).sum(dim=-1, keepdim=True) * 0.5  # ||x||^2 / 2  -> (B, n, 1)
        # Stabilize: subtract the row-wise max of the exponent before exp().
        stabilizer = torch.amax(proj - x_sq, dim=-1, keepdim=True).detach()
        feats = torch.exp(proj - x_sq - stabilizer)
        return feats / math.sqrt(m_feat)

    def _performer(self, q, k, v, m):
        """Performer attention: identical associative math to linear attention
        but with FAVOR+ features phi, so it *approximates softmax* (not just an
        arbitrary kernel).  Cost is O(n m d); no n x n matrix is formed.
        """
        d = q.shape[-1]
        # Lazily create + cache the random projection (fixed once drawn).
        if self._perf_projection.numel() == 0 or self._perf_projection.shape != (
            self.num_features,
            d,
        ) or self._perf_projection.dtype != q.dtype:
            proj = self._orthogonal_features(self.num_features, d, q.device, q.dtype)
            self._perf_projection = proj
        projection = self._perf_projection

        # Performer approximates the *softmax* kernel exp(q.k / sqrt(d)).  The
        # raw positive features approximate exp(q.k), so we fold the 1/sqrt(d)
        # temperature into the inputs by scaling each of q, k by d^(-1/4)
        # (their inner product then carries the d^(-1/2) softmax scaling).
        scale = q.shape[-1] ** -0.25
        phi_q = self._performer_features(q * scale, projection)  # (B, n, m)
        phi_k = self._performer_features(k * scale, projection)  # (B, n, m)

        if m is not None:
            phi_k = phi_k * m.unsqueeze(-1).to(phi_k.dtype)

        kv = torch.einsum("bnm,bne->bme", phi_k, v)  # (B, m, d_v)
        k_sum = phi_k.sum(dim=1)  # (B, m)
        z = torch.einsum("bnm,bm->bn", phi_q, k_sum).clamp_min(self.eps)  # (B, n)
        num = torch.einsum("bnm,bme->bne", phi_q, kv)  # (B, n, d_v)
        return num / z.unsqueeze(-1)

    # ------------------------------------------------------------------
    # 3) Sliding-window + global  (Longformer-style hybrid)
    # ------------------------------------------------------------------
    def _sliding_window(self, q, k, v, m):
        """Local banded attention + a handful of global control tokens.

        Each query attends to a local window of width ``w`` (its neighbours)
        plus ``g`` designated global tokens that every position can always see.
        The local part is computed with a *banded* scheme (a sliding window
        extracted via ``unfold``) so we only ever touch O(n * w) score entries
        instead of the full n x n matrix.  Cost: O(n (w + g) d).
        """
        B, n, d = q.shape
        scale = 1.0 / math.sqrt(d)
        w = min(self.window_size, n)
        half = w // 2
        w_eff = 2 * half + 1
        g = min(self.num_global, n)

        # ---- local band scores via unfold (vectorized, O(n * w * d)) ---------
        # Pad the key/value sequences by `half` on each side, then slide a width
        # w_eff window over them.  ``unfold`` gives exactly n overlapping windows
        # without ever forming the full n x n score matrix.
        k_pad = F.pad(k, (0, 0, half, half))  # (B, n + 2*half, d)
        v_pad = F.pad(v, (0, 0, half, half))
        k_win = k_pad.unfold(1, w_eff, 1).permute(0, 1, 3, 2)  # (B, n, w_eff, d)
        v_win = v_pad.unfold(1, w_eff, 1).permute(0, 1, 3, 2)  # (B, n, w_eff, d)

        local_scores = torch.einsum("bnd,bnwd->bnw", q, k_win) * scale  # (B, n, w_eff)

        # Mask the padded slots (window entries that fall outside [0, n)).
        rel = torch.arange(w_eff, device=q.device) - half  # (w_eff,)
        idx = torch.arange(n, device=q.device).unsqueeze(1) + rel.unsqueeze(0)  # (n, w_eff)
        valid = (idx >= 0) & (idx < n)  # (n, w_eff)
        local_scores = local_scores.masked_fill(~valid.unsqueeze(0), float("-inf"))
        if m is not None:
            m_pad = F.pad(m, (half, half), value=False)  # (B, n + 2*half)
            m_win = m_pad.unfold(1, w_eff, 1)  # (B, n, w_eff)
            local_scores = local_scores.masked_fill(~m_win, float("-inf"))

        # ---- global columns: every query also attends to the g global keys ---
        if g > 0:
            gk = k[:, :g, :]  # (B, g, d)
            global_scores = torch.einsum("bnd,bgd->bng", q, gk) * scale  # (B, n, g)
            if m is not None:
                global_scores = global_scores.masked_fill(~m[:, :g].unsqueeze(1), float("-inf"))
            all_scores = torch.cat([local_scores, global_scores], dim=-1)
        else:
            all_scores = local_scores

        attn = torch.softmax(all_scores, dim=-1)  # (B, n, w_eff + g)
        attn = torch.nan_to_num(attn, nan=0.0)  # rows that were fully -inf

        # ---- combine values --------------------------------------------------
        local_attn = attn[:, :, :w_eff]
        out = torch.einsum("bnw,bnwd->bnd", local_attn, v_win)  # (B, n, d)
        if g > 0:
            gv = v[:, :g, :]  # (B, g, d)
            out = out + torch.einsum("bng,bge->bne", attn[:, :, w_eff:], gv)
        return out

    # ------------------------------------------------------------------
    # 4) Hierarchical  (cluster -> intra full -> inter centroid)
    # ------------------------------------------------------------------
    def _resolve_cluster_size(self, n: int) -> int:
        if self.cluster_size is not None:
            return max(1, min(self.cluster_size, n))
        # Auto: ~sqrt(n) groups of ~sqrt(n) tokens each.
        return max(1, int(round(math.sqrt(n))))

    def _hierarchical(self, q, k, v, m):
        """Two-level hierarchical attention.

        Tokens are partitioned into contiguous clusters of size ``s`` (~sqrt(n)
        groups).  We then do:

          * intra-cluster: *full* attention inside each (small) cluster so local
            structure is captured exactly -- O(num_clusters * s^2 * d).
          * inter-cluster: every cluster is summarized by a centroid; the
            centroids exchange information via attention; the resulting cluster
            context is broadcast back to member tokens so far-apart tokens still
            communicate -- O(num_clusters^2 * d).

        With s ~ sqrt(n) the intra term is the dominant ~O(n^1.5 d), and because
        the inter step works on only sqrt(n) centroids it stays cheap.  No n x n
        matrix is ever formed.
        """
        B, n, d = q.shape
        s = self._resolve_cluster_size(n)
        num_clusters = math.ceil(n / s)
        pad = num_clusters * s - n

        scale = 1.0 / math.sqrt(d)

        # Pad to a whole number of clusters, then reshape to (B, C, s, d).
        def to_clusters(x):
            if pad:
                x = F.pad(x, (0, 0, 0, pad))  # pad along sequence dim
            return x.reshape(B, num_clusters, s, d)

        qc = to_clusters(q)
        kc = to_clusters(k)
        vc = to_clusters(v)

        # Padding mask over the (C, s) grid: real tokens = True.
        if m is not None:
            mc = F.pad(m, (0, pad)).reshape(B, num_clusters, s) if pad else m.reshape(B, num_clusters, s)
        else:
            valid = torch.ones(B, n, device=q.device, dtype=torch.bool)
            mc = (F.pad(valid, (0, pad)) if pad else valid).reshape(B, num_clusters, s)

        # ---- intra-cluster full attention (small s x s blocks) --------------
        intra_scores = torch.einsum("bcsd,bctd->bcst", qc, kc) * scale  # (B,C,s,s)
        intra_scores = intra_scores.masked_fill(~mc.unsqueeze(2), float("-inf"))
        intra_attn = torch.softmax(intra_scores, dim=-1)
        intra_attn = torch.nan_to_num(intra_attn, nan=0.0)
        intra_out = torch.einsum("bcst,bctd->bcsd", intra_attn, vc)  # (B,C,s,d)

        # ---- inter-cluster attention over centroids -------------------------
        denom = mc.sum(dim=2, keepdim=True).clamp_min(1).to(q.dtype)  # (B,C,1)
        q_cent = (qc * mc.unsqueeze(-1)).sum(dim=2) / denom  # (B,C,d)
        k_cent = (kc * mc.unsqueeze(-1)).sum(dim=2) / denom  # (B,C,d)
        v_cent = (vc * mc.unsqueeze(-1)).sum(dim=2) / denom  # (B,C,d)

        cent_scores = torch.einsum("bcd,bed->bce", q_cent, k_cent) * scale  # (B,C,C)
        cent_attn = torch.softmax(cent_scores, dim=-1)
        cent_ctx = torch.einsum("bce,bed->bcd", cent_attn, v_cent)  # (B,C,d)

        # Broadcast each cluster's global context to its member tokens and fuse
        # with the local (intra) result.  A simple average keeps the op linear
        # and differentiable.
        out = 0.5 * intra_out + 0.5 * cent_ctx.unsqueeze(2)  # (B,C,s,d)
        out = out.reshape(B, num_clusters * s, d)
        if pad:
            out = out[:, :n, :]
        return out

    # ------------------------------------------------------------------
    # complexity / cost model
    # ------------------------------------------------------------------
    def complexity_report(self, seq_len: int) -> ComplexityReport:
        """Return the theoretical FLOPs + peak-memory model for one call.

        FLOPs use the convention "1 multiply-add = 2 FLOPs".  Peak memory is
        measured in tensor *elements* (the dominant intermediate), which is what
        makes the quadratic vs sub-quadratic gap obvious.
        """
        n = seq_len
        d = self.d_model

        if self.mode == "standard":
            flops = 4.0 * n * n * d + 2.0 * n * n  # QK^T, scores.V, softmax
            mem = float(n * n)  # the n x n score matrix dominates
            big_o = "O(n^2 * d)"
        elif self.mode == "linear":
            flops = 4.0 * n * d * d + 3.0 * n * d
            mem = float(n * d + d * d)
            big_o = "O(n * d^2)"
        elif self.mode == "performer":
            mft = self.num_features
            flops = 4.0 * n * mft * d + 4.0 * n * mft
            mem = float(n * mft + mft * d)
            big_o = "O(n * m * d)"
        elif self.mode == "sliding_window":
            w = min(self.window_size, n)
            g = min(self.num_global, n)
            flops = 4.0 * n * (w + g) * d
            mem = float(n * (w + g))
            big_o = "O(n * (w + g) * d)"
        else:  # hierarchical
            s = self._resolve_cluster_size(n)
            c = math.ceil(n / s)
            flops = 4.0 * c * s * s * d + 4.0 * c * c * d
            mem = float(c * s * s + c * c)
            big_o = "O(n^1.5 * d)"

        return ComplexityReport(
            mode=self.mode,
            seq_len=n,
            d_model=d,
            flops=flops,
            peak_memory_elems=mem,
            complexity=big_o,
        )


__all__ = ["SubQuadraticAttention", "NxNGuard", "ComplexityReport"]
