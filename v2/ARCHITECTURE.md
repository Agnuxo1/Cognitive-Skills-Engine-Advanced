# Cognitive Skills Engine v2 architecture

Version 2 keeps the original Markdown skills intact and adds a deterministic orchestration layer around them. The design goal is not to make claims about machine consciousness; it is to make agent work easier to route, inspect, replay, and correct.

## Runtime contract

```text
task -> classify -> route -> load skills -> call tools -> attach evidence
     -> update uncertainty -> render response + trace
```

The v2 engine exposes five stable operations:

| Operation | Contract |
| --- | --- |
| `classifyTask` | ranked cell matches with triggering terms |
| `routeTask` | `D5 -> A1 -> domain cells -> synthesis? -> D6` |
| `createTrace` | replayable `cse.trace/v2` record |
| `addEvidence` | provenance, method, confidence, limitations |
| `responseEnvelope` | answer plus compact path and uncertainty |

## Compatibility

The original 1.0 Markdown skills remain at the repository root and are snapshotted under `versions/v1.0.0/`. Existing editor, CLI, browser-extension, Ollama, Hugging Face, and Pinokio artifacts are not removed. v2 is additive and can be consumed independently with Node.js 18+.

## Epistemic guardrails

- A route is a plan, not evidence.
- Every external claim should carry a source and method.
- Confidence is bounded to `[0, 1]`; missing confidence is explicit rather than guessed.
- Low-confidence evidence marks the trace as `material` uncertainty.
- Deterministic routing and tests do not validate the quality of a language model's answer.
