# CSE Trace Schema v2

The v2 runtime emits a JSON object with `schema: "cse.trace/v2"`. A trace is an audit record for orchestration; it is not a proof that the final answer is correct.

## Required top-level fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | string | Stable schema identifier. |
| `engine` | string | Runtime version, currently `2.0.0`. |
| `traceId` | string | Caller-overridable identifier for correlation. |
| `createdAt` | ISO timestamp | Trace creation time. |
| `task` | string | Original task text. |
| `route` | string[] | Ordered board cells. |
| `compactPath` | string | Human-readable symbolic route. |
| `classification` | object[] | Matching cells, scores, and matched keywords. |
| `evidence` | object[] | Provenance-bearing observations. |
| `uncertainty` | object | `unassessed`, `bounded`, or `material`. |
| `decisions` | object[] | Reserved for host-level decisions. |

## Evidence record

`addEvidence()` requires `source` and `method`. Optional fields are `id`, `claim`, `confidence`, `limitations`, and `capturedAt`. Confidence is normalized to the closed interval `[0, 1]`; an absent confidence remains `null` rather than being silently promoted.

## Uncertainty policy

- `unassessed`: no evidence has been attached.
- `bounded`: evidence exists, but every numeric confidence is at least `0.70`.
- `material`: at least one numeric confidence is below `0.70`.

Applications should display the uncertainty state next to the answer and retain the trace for later review.
