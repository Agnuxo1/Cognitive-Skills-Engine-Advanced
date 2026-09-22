# v2 runtime

The v2 runtime is a dependency-free Node.js module for deterministic routing and evidence-aware traces.

```bash
node v2/cli.mjs route "compare two distributed agent architectures"
node v2/cli.mjs trace "audit a climate policy claim"
node v2/cli.mjs manifest
node --test v2/test/engine.test.mjs
```

Import it from an application:

```js
import { addEvidence, createTrace, responseEnvelope, routeTask } from "./v2/engine.mjs";

const routed = routeTask("prove a theorem about a graph algorithm");
let trace = createTrace(routed.task, routed);
trace = addEvidence(trace, {
  source: "proof assistant output",
  method: "checked derivation",
  claim: "the bound holds under the stated assumptions",
  confidence: 0.91,
  limitations: ["does not cover the relaxed case"],
});
console.log(responseEnvelope(trace, "The bounded result is supported by the attached derivation."));
```
