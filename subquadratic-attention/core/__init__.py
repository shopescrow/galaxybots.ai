"""Sub-quadratic attention research framework -- core package.

Public API:

    SubQuadraticAttention  -- selectable attention backend (nn.Module)
    NxNGuard               -- TorchFunctionMode that detects n x n materialization
    ComplexityReport       -- theoretical cost model for a single call
    AGIAgentPool, Agent    -- dynamically-scaling agent communication layer
    benchmarks (module)    -- timing / memory profiling + plotting utilities
"""

from .attention import ComplexityReport, NxNGuard, SubQuadraticAttention
from .agent_pool import Agent, AGIAgentPool
from . import benchmarks

__all__ = [
    "SubQuadraticAttention",
    "NxNGuard",
    "ComplexityReport",
    "AGIAgentPool",
    "Agent",
    "benchmarks",
]
