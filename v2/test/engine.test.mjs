import test from "node:test";
import assert from "node:assert/strict";
import { addEvidence, compactPath, createTrace, routeTask } from "../engine.mjs";

test("routes a mixed science task through synthesis", () => {
  const routed = routeTask("Design a quantum chemistry catalyst and verify its reaction mechanism");
  assert.equal(routed.path[0], "D5");
  assert.equal(routed.path[1], "A1");
  assert.ok(routed.path.includes("A3"));
  assert.ok(routed.path.includes("A4"));
  assert.ok(routed.path.includes("D3"));
  assert.equal(routed.path.at(-1), "D6");
});

test("keeps deterministic compact path encoding", () => {
  assert.equal(compactPath(["D5", "A1", "A6", "D6"]), "MST·TC·CS·OUT");
});

test("creates an uncertainty-aware evidence trace", () => {
  const trace = createTrace("Analyze a distributed agent architecture");
  const updated = addEvidence(trace, { source: "unit-test", method: "deterministic fixture", confidence: 0.62, claim: "route is reproducible", limitations: ["synthetic"] });
  assert.equal(updated.evidence.length, 1);
  assert.equal(updated.uncertainty.level, "material");
  assert.equal(updated.schema, "cse.trace/v2");
});

test("rejects evidence without provenance", () => {
  assert.throws(() => addEvidence(createTrace("test"), { claim: "missing fields" }), /source and method/);
});
