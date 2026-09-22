#!/usr/bin/env node
import { addEvidence, createTrace, compactPath, manifest, routeTask } from "./engine.mjs";

const [command, ...args] = process.argv.slice(2);

function parseTraceArgs(values) {
  const taskParts = [];
  const evidence = {};
  const options = new Map([
    ["--source", "source"],
    ["--method", "method"],
    ["--claim", "claim"],
    ["--confidence", "confidence"],
  ]);
  for (let index = 0; index < values.length; index += 1) {
    const key = options.get(values[index]);
    if (!key) {
      taskParts.push(values[index]);
      continue;
    }
    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${values[index]}`);
    evidence[key] = key === "confidence" ? Number(value) : value;
    index += 1;
  }
  return { task: taskParts.join(" ").trim(), evidence };
}

if (command === "route") {
  const task = args.join(" ").trim();
  if (!task) throw new Error("Usage: node v2/cli.mjs route \"your task\"");
  const routed = routeTask(task);
  console.log(JSON.stringify({ ...routed, compactPath: compactPath(routed.path) }, null, 2));
} else if (command === "trace") {
  const { task, evidence } = parseTraceArgs(args);
  if (!task) throw new Error("Usage: node v2/cli.mjs trace \"your task\" [--source S --method M --claim C --confidence 0.8]");
  let trace = createTrace(task);
  if (evidence.source || evidence.method || evidence.claim || evidence.confidence !== undefined) {
    trace = addEvidence(trace, evidence);
  }
  console.log(JSON.stringify(trace, null, 2));
} else if (command === "manifest") {
  console.log(JSON.stringify(manifest(), null, 2));
} else {
  console.log("Cognitive Skills Engine v2\n\nCommands:\n  route \"task\"                              deterministic skill path\n  trace \"task\" [--source S --method M ...]    evidence-aware trace\n  manifest                                      machine-readable board manifest");
}
