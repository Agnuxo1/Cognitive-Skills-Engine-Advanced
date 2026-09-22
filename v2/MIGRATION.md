# Migration from v1 to v2

1. Keep using `MASTER-SKILL.md` and the existing skill files if you need a prompt-only workflow.
2. Use `node v2/cli.mjs route "your task"` to obtain a deterministic path.
3. Use `createTrace()` when an application needs a replayable run record.
4. Attach evidence with `addEvidence()` before presenting externally verifiable claims.
5. Treat `versions/v1.0.0/` as the immutable compatibility reference.

The v2 layer does not silently rewrite or delete v1 paths. It adds a machine-readable trace schema and a testable routing contract around them.
