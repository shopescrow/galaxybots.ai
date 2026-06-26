"""
core/agent_pool.py
==================

The AGI agent-pool layer that sits on top of the attention backends.

The motivating problem (GalaxyBots.ai): a network of autonomous agents wants to
communicate "all-to-all" -- every agent reads a summary of every other agent's
state before it reasons.  Done naively this is exactly an attention operation
over ``n`` agents and therefore O(n^2): doubling the swarm quadruples the cost.

``AGIAgentPool`` wraps a ``SubQuadraticAttention`` backend so that one round of
"collective reasoning" across the whole swarm scales sub-quadratically.  Adding
an agent is an O(d) append -- it never rebuilds an attention graph -- so the
swarm can grow dynamically while it runs.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

import torch

from .attention import SubQuadraticAttention


@dataclass
class Agent:
    """A single autonomous agent.

    Each agent carries a ``state`` embedding (its "thought vector").  Queries,
    keys and values for the attention round are linear-free projections of this
    state (we keep them identity-projected here so the framework stays a pure
    research substrate -- no trained weights, per the task's "no training"
    scope).
    """

    agent_id: int
    state: torch.Tensor  # shape (d_model,)
    role: str = "worker"
    last_activation: float = 0.0
    metadata: dict = field(default_factory=dict)


class AGIAgentPool:
    """A dynamically-growing pool of agents that communicate via sub-quadratic
    attention.

    Parameters
    ----------
    d_model:
        Dimensionality of each agent's state vector.
    mode:
        Attention backend to use (see ``SubQuadraticAttention``).
    seed:
        Optional RNG seed for reproducible agent spawning.
    **attn_kwargs:
        Forwarded to ``SubQuadraticAttention`` (e.g. ``num_features``,
        ``window_size``, ``cluster_size``).
    """

    def __init__(
        self,
        d_model: int = 64,
        mode: str = "linear",
        seed: Optional[int] = None,
        device: Optional[str] = None,
        **attn_kwargs,
    ) -> None:
        self.d_model = d_model
        self.mode = mode
        self.device = torch.device(device) if device else torch.device("cpu")
        if seed is not None:
            torch.manual_seed(seed)
        self.attention = SubQuadraticAttention(d_model, mode=mode, **attn_kwargs).to(self.device)
        self.agents: list[Agent] = []
        self._next_id = 0
        # Cached state matrix; invalidated whenever the roster changes.  This is
        # the key to "dynamic add does not rebuild the graph": we only append a
        # row, we never reconstruct an n x n structure.
        self._state_matrix: Optional[torch.Tensor] = None

    # ------------------------------------------------------------------
    # roster management
    # ------------------------------------------------------------------
    def spawn_agent(self, state: Optional[torch.Tensor] = None, role: str = "worker", **metadata) -> Agent:
        """Add one agent to the pool. O(d): append a row, invalidate cache."""
        if state is None:
            state = torch.randn(self.d_model, device=self.device)
        else:
            state = state.to(self.device).reshape(self.d_model)
        agent = Agent(agent_id=self._next_id, state=state, role=role, metadata=metadata)
        self.agents.append(agent)
        self._next_id += 1
        self._state_matrix = None  # invalidate (append-only, no graph rebuild)
        return agent

    def spawn_many(self, count: int, role: str = "worker") -> list[Agent]:
        """Convenience: spawn ``count`` agents with random states."""
        return [self.spawn_agent(role=role) for _ in range(count)]

    @property
    def n_agents(self) -> int:
        return len(self.agents)

    def _states(self) -> torch.Tensor:
        """Return the (1, n, d) state matrix, building the cache if needed."""
        if self._state_matrix is None:
            if not self.agents:
                raise RuntimeError("agent pool is empty -- spawn agents first")
            mat = torch.stack([a.state for a in self.agents], dim=0)  # (n, d)
            self._state_matrix = mat.unsqueeze(0)  # (1, n, d)
        return self._state_matrix

    # ------------------------------------------------------------------
    # communication primitives
    # ------------------------------------------------------------------
    def agent_broadcast(self, source_id: int, message: torch.Tensor) -> None:
        """One agent broadcasts a message that additively updates its state.

        This mutates only a single row, so it is O(d) and does not touch the
        attention structure -- it just dirties the cached state matrix.
        """
        message = message.to(self.device).reshape(self.d_model)
        for a in self.agents:
            if a.agent_id == source_id:
                a.state = a.state + message
                self._state_matrix = None
                return
        raise KeyError(f"no agent with id {source_id}")

    def collective_reasoning(self, return_activations: bool = False):
        """Run one round of all-to-all reasoning across the swarm.

        Every agent attends to (a summary of) every other agent and updates its
        state with the attended context.  This is the operation that would be
        O(n^2) with standard attention; here it inherits the backend's
        sub-quadratic cost.

        Returns the new (n, d) state matrix, and optionally a per-agent
        activation magnitude (useful for the dashboard's communication
        visualizer).
        """
        states = self._states()  # (1, n, d)
        with torch.no_grad():
            context = self.attention(states, states, states)  # (1, n, d)
        new_states = context.squeeze(0)
        activations = new_states.norm(dim=-1)  # (n,)
        for a, row, act in zip(self.agents, new_states, activations):
            a.state = row
            a.last_activation = float(act)
        self._state_matrix = None
        if return_activations:
            return new_states, activations
        return new_states

    def attention_weights(self, max_agents: int = 64) -> torch.Tensor:
        """Return an explicit (k, k) attention-weight matrix for visualization.

        This intentionally uses the *standard* softmax formulation on a capped
        subset of agents -- it exists only to draw edges in the dashboard graph,
        not for the scalable compute path.  Capping at ``max_agents`` keeps it
        cheap regardless of swarm size.
        """
        k = min(self.n_agents, max_agents)
        states = self._states()[:, :k, :]  # (1, k, d)
        import math

        q = states
        scores = torch.matmul(q, q.transpose(-2, -1)) / math.sqrt(self.d_model)
        return torch.softmax(scores, dim=-1).squeeze(0)  # (k, k)

    # ------------------------------------------------------------------
    # scaling report
    # ------------------------------------------------------------------
    def scale_report(self, measure_walltime: bool = True) -> dict:
        """Summarize the current swarm cost and project it at 10x/100x/1000x.

        Returns a dict with the current agent count, the theoretical FLOPs (from
        the backend's cost model), the measured wall time for one reasoning
        round, and projected FLOPs for a swarm 10x/100x/1000x larger -- compared
        against what a standard O(n^2) backend would have cost.
        """
        n = self.n_agents
        report = self.attention.complexity_report(n)
        baseline = SubQuadraticAttention(self.d_model, mode="standard").complexity_report(n)

        walltime = None
        if measure_walltime and n > 0:
            states = self._states()
            with torch.no_grad():
                # warmup
                self.attention(states, states, states)
                t0 = time.perf_counter()
                self.attention(states, states, states)
                walltime = time.perf_counter() - t0

        projections = {}
        for factor in (10, 100, 1000):
            scaled_n = n * factor
            proj = self.attention.complexity_report(scaled_n)
            base = SubQuadraticAttention(self.d_model, mode="standard").complexity_report(scaled_n)
            projections[f"{factor}x"] = {
                "n_agents": scaled_n,
                "flops": proj.flops,
                "standard_flops": base.flops,
                "speedup_vs_standard": base.flops / max(proj.flops, 1.0),
            }

        return {
            "n_agents": n,
            "mode": self.mode,
            "complexity": report.complexity,
            "theoretical_flops": report.flops,
            "standard_flops": baseline.flops,
            "speedup_vs_standard": baseline.flops / max(report.flops, 1.0),
            "memory_elems": report.peak_memory_elems,
            "standard_memory_elems": baseline.peak_memory_elems,
            "actual_walltime_s": walltime,
            "projections": projections,
        }


__all__ = ["AGIAgentPool", "Agent"]
