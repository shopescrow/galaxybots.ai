# Permanent Memory System for Replit
## Claude Desktop-style persistent memory across all sessions

### Purpose
This document defines the memory persistence pattern every agent session must follow.
`replit.md` is the live memory file — it persists across all sessions and is loaded automatically.

### Memory Structure (What to Track in replit.md)

```
metadata:
  last_modified: <timestamp>
  total_sessions: <count>

context:
  project_goals: []           # Active goals with priority
  current_progress: ""         # Latest progress summary
  key_decisions: []            # Architectural/implementation decisions with rationale
  unresolved_issues: []        # Open bugs, tech debt, blockers with severity
  user_preferences: {}         # Coding style, communication, workflow preferences
  conversation_summary: []     # Key points from recent sessions
```

### Session Rules

1. **On Session Start:** Read `replit.md` and `docs/GALAXYBOTS_STAGES.md` to restore full context.
2. **On Every Significant Change:** Update `replit.md` with what changed — new features, removed features, architectural decisions, new dependencies.
3. **On Session End:** Ensure `replit.md` reflects the final state of the project.
4. **On Decision Made:** Record the decision AND the rationale in `replit.md`.
5. **On Issue Found:** Log unresolved issues with severity in the scratchpad or replit.md.

### What Qualifies as a "Significant Change"
- Adding or removing a feature, route, or page
- Adding or removing a dependency
- Changing the database schema
- Changing the authentication or billing model
- Changing the deployment or build configuration
- Any refactor that moves code between files or renames key modules

### Checkpoint Discipline
- Before destructive operations (data deletion, broad refactors, library swaps), document the current state
- After completing a major feature, update `replit.md` immediately — do not wait until the end of the session
- When multiple changes stack up, batch-update `replit.md` rather than letting it drift

### Error Resilience
- If `replit.md` becomes corrupted or stale, reconstruct it from the codebase using grep/glob/explore tools
- Always verify file paths and route references against actual code before writing them to `replit.md`
- Cross-reference billing tiers, plan names, and feature gates against the actual middleware and route code

### Key Files for Memory
| File | Purpose |
|---|---|
| `replit.md` | Primary persistent memory — loaded every session |
| `docs/GALAXYBOTS_STAGES.md` | Product map — stages, processes, feature tables |
| `reports/cfo-development-audit-2026-04-06.md` | Financial audit with per-task cost breakdown |
| `.local/session_plan.md` | Temporary session task decomposition (delete when done) |

### Python Reference Implementation
A full Python implementation of this pattern (SecureMemoryManager with auto-save, versioning, encryption, compression, search, checkpoints, and rollback) is saved at `docs/memory_system_reference.py`. Key patterns from that implementation that apply to agent sessions:

- **Auto-save on every change** — update `replit.md` immediately, not at end of session
- **Atomic writes** — write to temp file then replace (prevents corruption)
- **Versioning** — git commits serve as checkpoints; Replit checkpoints serve as rollback points
- **Search** — use grep/explore tools to search project memory when context is unclear
- **Session tracking** — note session count and progress in `replit.md` updates
