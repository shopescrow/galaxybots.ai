# Sub-Quadratic Attention — Research Framework

A standalone, CPU-first PyTorch research framework that replaces standard
**O(n²)** self-attention with selectable **sub-quadratic** backends, wraps them
in an **AGI agent-pool** layer, and ships a **Streamlit dashboard** that visually
proves the scaling advantage.

The motivating use case is horizontal scaling of autonomous agent networks
(relevant to GalaxyBots.ai agent-to-agent communication): when *n* agents must
communicate all-to-all, naïve attention is O(n²) and doubling the swarm
quadruples the cost. The backends here break that wall.

> Research substrate only. No training, no pretrained weights, no integration
> into production agents. CPU-only by default (`USE_CUDA=1` opts into GPU).

---

## Quickstart

```bash
# From the subquadratic-attention/ directory:
python demo.py                 # scaling report + validation summary
python demo.py --mode performer
pytest -q                      # run the test-suite
streamlit run dashboard.py --server.port 5000
```

## Layout

```
subquadratic-attention/
├── core/
│   ├── __init__.py
│   ├── attention.py     # the four backends + n×n guard + cost model
│   ├── agent_pool.py    # AGIAgentPool / Agent scaling manager
│   └── benchmarks.py    # timing/memory profiling + matplotlib plots
├── dashboard.py         # 3-tab Streamlit dashboard
├── demo.py              # CLI scaling demo
├── tests/
│   ├── test_attention.py
│   └── test_scaling.py
├── requirements.txt
└── README.md
```

---

## The four backends

All backends share the signature `forward(Q, K, V, mask=None)` where `Q,K,V`
have shape `(..., n, d)` (any number of leading batch/head dims) and `mask` is an
optional `(..., n)` boolean key-padding mask. Each backend also exposes
`complexity_report(seq_len)` returning the FLOPs / peak-memory model.

### 1. Linear attention — `O(n·d²)`

Standard attention computes `softmax(QKᵀ/√d)·V`, forming the `n×n` matrix `QKᵀ`.
Linear attention replaces `exp(qᵢ·kⱼ)` with a **kernel feature map**
`φ(x) = elu(x) + 1` (non-negative, so the implicit weights stay positive) and
exploits associativity:

```
outᵢ = Σⱼ (φ(qᵢ)ᵀφ(kⱼ)) vⱼ  /  Σⱼ φ(qᵢ)ᵀφ(kⱼ)
     = φ(qᵢ)ᵀ (Σⱼ φ(kⱼ)vⱼᵀ) / φ(qᵢ)ᵀ(Σⱼ φ(kⱼ))
       └──────── KV : (d × d) ────────┘
```

By computing `KV = Σⱼ φ(kⱼ)vⱼᵀ` **first** (shape `d×d`, independent of `n²`), the
whole op is `O(n·d²)` time and `O(n·d + d²)` memory. **No `n×n` matrix is ever
formed** — verified at test time by `NxNGuard`.

### 2. Performer (FAVOR+) — `O(n·m·d)`

Linear attention with an arbitrary kernel doesn't approximate softmax. Performer
uses **positive orthogonal random features** that give an *unbiased* estimate of
the softmax kernel:

```
φ(x) = exp(Wx − ‖x‖²/2) / √m       (per-row max subtracted for stability)
```

`W ∈ ℝ^{m×d}` is built **from scratch**: draw Gaussian blocks (`torch.randn`),
orthonormalize the rows (`torch.linalg.qr`), then rescale rows to χ-distributed
norms so the marginals match iid Gaussians (preserves unbiasedness).
Orthogonality sharply reduces estimator variance. Same associative math as linear
attention ⇒ `O(n·m·d)`, no `n×n` matrix.

### 3. Sliding-Window + Global — `O(n·(w+g)·d)`

Longformer-style hybrid: each query attends to a **local band** of width `w`
(its neighbours) plus a handful of **global control tokens** `g` that every
position can always see (and which see everyone). The local band is computed one
diagonal offset at a time (`torch.roll`), touching only `O(n·w)` score entries
instead of the full matrix. Good for sequence-structured agent topologies.

### 4. Hierarchical — `~O(n^1.5·d)`

Tokens are partitioned into **~√n contiguous clusters** of ~√n tokens. Then:

- **intra-cluster**: *full* attention inside each small cluster (exact local
  structure) — `O(num_clusters · s² · d)`;
- **inter-cluster**: each cluster is summarized by a centroid; centroids exchange
  information via attention; the result is broadcast back to member tokens so
  far-apart tokens still communicate — `O(num_clusters² · d)`.

With `s ≈ √n` the intra term dominates at `~O(n^1.5·d)`, and the centroid step
stays cheap because it works on only √n summaries. No `n×n` matrix is formed.
The hierarchy is also what produces **visible cluster boundaries** in the
dashboard's communication graph.

---

## Complexity summary

| Backend          | Time            | Peak memory       | Forms n×n? |
|------------------|-----------------|-------------------|:----------:|
| standard         | O(n²·d)         | O(n²)             | yes        |
| linear           | O(n·d²)         | O(n·d + d²)       | no         |
| performer        | O(n·m·d)        | O(n·m + m·d)      | no         |
| sliding_window   | O(n·(w+g)·d)    | O(n·(w+g))        | no         |
| hierarchical     | ~O(n^1.5·d)     | O(n·s + (n/s)²)   | no         |

For fixed `d` (and fixed `m`, `w`, `s`), every sub-quadratic backend is linear
or near-linear in `n`, whereas standard attention is quadratic. The crossover
point (where a sub-quadratic backend overtakes standard on wall time) is computed
empirically by `core.benchmarks.crossover_point`.

---

## Agent-pool layer

`AGIAgentPool` wraps a backend so one round of all-to-all `collective_reasoning()`
over the swarm inherits the sub-quadratic cost:

```python
from core.agent_pool import AGIAgentPool

pool = AGIAgentPool(d_model=64, mode="linear", seed=0)
pool.spawn_many(256)                 # O(d) per agent — no graph rebuild
pool.agent_broadcast(0, msg)         # one agent updates its own state
states = pool.collective_reasoning() # sub-quadratic all-to-all round
report = pool.scale_report()         # FLOPs, wall time, 10×/100×/1000× projections
```

Spawning an agent is an append (O(d)); it **never rebuilds an attention graph**,
so the swarm can grow while it runs.

---

## Dashboard (3 tabs)

1. **Architecture Explorer** — pick a backend, slide `n` from 8→4096, watch the
   log-log theoretical-FLOPs curve with the O(n²) scaling wall highlighted.
2. **Live Agent Benchmark** — run real CPU wall-time + memory benchmarks across
   agent counts with a progress bar; read off the efficiency gain vs the
   quadratic baseline and the crossover points.
3. **Agent Communication Visualizer** — a force-directed graph of 16–64 agents;
   node size/color = activation during `collective_reasoning`, edge opacity =
   attention weight, with explicit **cluster boundaries** in hierarchical mode.

---

## Testing

`pytest -q` covers:

- output shapes (incl. extra leading head dims) for every backend;
- **cosine similarity ≥ 0.85** between standard and linear attention (d=64, n=128);
- **no n×n tensor** materialized in linear/performer (enforced by `NxNGuard`),
  plus a sanity check that the guard *does* fire for standard attention;
- numerical stability (no NaN/Inf under extreme inputs), float32 preserved;
- gradient flow for all backends + `torch.autograd.gradcheck` (float64) on linear;
- sub-quadratic backends **faster than O(n²) at n=512**;
- hierarchical **near-linear** scaling: `time(2n)/time(n) < 2.5` at n=256.

---

## Design decisions

- **Single-file core math** (`core/attention.py`) with heavy inline comments so
  each mathematical step is auditable in one place.
- **`NxNGuard` via `TorchFunctionMode`** intercepts every torch op at dispatch,
  so the "no quadratic tensor" claim is *proven*, not asserted by convention.
- **Random features as a non-persistent buffer**, drawn once and cached, so
  Performer is deterministic within a run and moves with `.to()/.double()`.
- **CPU-first**: no CUDA/flash-attention/xformers dependencies; FAVOR+ random
  features are implemented from scratch. `USE_CUDA=1` is the only GPU opt-in.
- **No training**: projections are identity; this is a scaling substrate, not a
  model to be trained.
