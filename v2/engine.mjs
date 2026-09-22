/**
 * Cognitive Skills Engine v2
 * Deterministic routing, traceable evidence, and compatibility-first skill loading.
 * Node.js >= 18, zero runtime dependencies.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE_VERSION = "2.0.0";

export const BOARD = Object.freeze({
  D5: { symbol: "MST", name: "Master Router", group: "core" },
  A1: { symbol: "TC", name: "Token Compression", group: "core" },
  A2: { symbol: "MM", name: "Mathematician Mind", group: "science" },
  A3: { symbol: "PH", name: "Physicist Mind", group: "science" },
  A4: { symbol: "CH", name: "Chemist Mind", group: "science" },
  A5: { symbol: "BIO", name: "Biologist Mind", group: "science" },
  A6: { symbol: "CS", name: "Computer Scientist Mind", group: "science" },
  B1: { symbol: "HIS", name: "Historian Mind", group: "humanities" },
  B2: { symbol: "PHI", name: "Philosopher Mind", group: "humanities" },
  B3: { symbol: "PSY", name: "Psychologist Mind", group: "humanities" },
  B4: { symbol: "LIN", name: "Linguist Mind", group: "humanities" },
  B5: { symbol: "GEO", name: "Geographer Mind", group: "humanities" },
  B6: { symbol: "ECO", name: "Economist Mind", group: "humanities" },
  C1: { symbol: "POL", name: "Political Scientist Mind", group: "applied" },
  C2: { symbol: "LAW", name: "Jurist Mind", group: "applied" },
  C3: { symbol: "MED", name: "Medical Mind", group: "applied" },
  C4: { symbol: "AST", name: "Astronomer Mind", group: "applied" },
  C5: { symbol: "ENG", name: "Engineer Mind", group: "applied" },
  C6: { symbol: "ART", name: "Arts Mind", group: "applied" },
  D1: { symbol: "ENV", name: "Environmental Mind", group: "applied" },
  D2: { symbol: "CUL", name: "Culture Mind", group: "applied" },
  D3: { symbol: "SCI+", name: "Science Synthesis", group: "synthesis" },
  D4: { symbol: "HUM+", name: "Humanities Synthesis", group: "synthesis" },
  D6: { symbol: "OUT", name: "Output Renderer", group: "core" },
});

const RULES = Object.freeze({
  A2: ["proof", "theorem", "bound", "algebra", "topology", "combinator", "optimization", "geometry", "equation"],
  A3: ["quantum", "relativity", "mechanics", "thermodynamic", "electromagnet", "particle", "cosmology", "wave", "entropy"],
  A4: ["reaction", "molecule", "chemistry", "organic", "inorganic", "catalyst", "spectroscop", "polymer", "crystal"],
  A5: ["genetic", "evolution", "cell", "protein", "dna", "ecology", "metabolism", "neuroscience", "crispr"],
  A6: ["algorithm", "complexity", "machine learning", "software", "code", "data structure", "distributed", "neural network", "cryptograph", "database", "agent"],
  B1: ["history", "historical", "ancient", "medieval", "revolution", "war", "civilization", "empire", "period"],
  B2: ["philosoph", "ethic", "epistem", "metaphys", "ontology", "aesthetic", "kant", "plato", "meaning"],
  B3: ["psycholog", "cognition", "behavior", "emotion", "memory", "personality", "therapy", "freud", "jung"],
  B4: ["language", "grammar", "syntax", "phonology", "semantic", "translation", "discourse", "pragmatic", "corpus"],
  B5: ["geograph", "climate", "geopolitic", "cartograph", "landscape", "migration", "urban", "territory", "spatial"],
  B6: ["econom", "market", "finance", "trade", "game theory", "gdp", "microeconom", "macroeconom", "behavioral"],
  C1: ["politic", "democracy", "governance", "international", "state", "power", "institution", "diplomacy", "sovereignty"],
  C2: ["law", "legal", "contract", "constitutional", "criminal", "tort", "jurisdiction", "statute", "rights"],
  C3: ["medicine", "disease", "diagnos", "treatment", "pharmac", "anatomy", "clinical", "pathology", "surgery"],
  C4: ["astronom", "astrophys", "galaxy", "star", "black hole", "telescope", "exoplanet", "nebula", "redshift"],
  C5: ["engineer", "design", "structure", "circuit", "material", "system", "manufactur", "control", "robotics", "architecture"],
  C6: ["art", "music", "literature", "painting", "architecture", "theater", "cinema", "poetry", "style"],
  D1: ["environment", "sustainab", "pollution", "biodiversity", "carbon", "climate change", "ecosystem", "conservation"],
  D2: ["culture", "society", "anthropolog", "ritual", "identity", "tradition", "myth", "semiotic", "globalization"],
});

const SCIENCE = new Set(["A2", "A3", "A4", "A5", "A6", "C3", "C4", "C5", "D1"]);
const HUMANITIES = new Set(["B1", "B2", "B3", "B4", "B5", "B6", "C1", "C2", "C6", "D2"]);

// Explicit aliases keep the v2 loader compatible with the v1 directory layout.
// The board symbols are intentionally not used as filenames: several v1 skills
// live in different category folders and use their full descriptive names.
const SKILL_FILES = Object.freeze({
  D5: "../MASTER-SKILL.md",
  A1: "core/token-compression.md",
  A2: "science/mathematician-mind.md",
  A3: "science/physicist-mind.md",
  A4: "science/chemist-mind.md",
  A5: "science/biologist-mind.md",
  A6: "science/computer-scientist-mind.md",
  B1: "humanities/historian-mind.md",
  B2: "humanities/philosopher-mind.md",
  B3: "humanities/psychologist-mind.md",
  B4: "humanities/linguist-mind.md",
  B5: "humanities/geographer-mind.md",
  B6: "humanities/economist-mind.md",
  C1: "humanities/political-scientist-mind.md",
  C2: "humanities/jurist-mind.md",
  C3: "science/medical-mind.md",
  C4: "science/astronomer-mind.md",
  C5: "science/engineer-mind.md",
  C6: "arts-culture/arts-mind.md",
  D1: "arts-culture/environmental-mind.md",
  D2: "arts-culture/culture-mind.md",
});

function normalize(text) {
  return String(text ?? "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function scoreCell(task, keywords) {
  return keywords.reduce((score, keyword) => score + (task.includes(keyword) ? (keyword.includes(" ") ? 3 : 2) : 0), 0);
}

export function classifyTask(task, { minScore = 2 } = {}) {
  const normalized = normalize(task);
  if (!normalized) throw new TypeError("A non-empty task is required.");
  return Object.entries(RULES)
    .map(([cell, keywords]) => ({ cell, score: scoreCell(normalized, keywords), keywords: keywords.filter((keyword) => normalized.includes(keyword)) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score || a.cell.localeCompare(b.cell));
}

export function routeTask(task, options = {}) {
  const matches = classifyTask(task, options);
  const cells = matches.length ? matches.map(({ cell }) => cell) : ["A6"];
  const path = ["D5", "A1", ...cells];
  const unique = [...new Set(path)];
  const matchedGroups = new Set(cells.map((cell) => BOARD[cell].group));
  if (cells.length > 1 && cells.every((cell) => SCIENCE.has(cell))) unique.push("D3");
  else if (cells.length > 1 && cells.every((cell) => HUMANITIES.has(cell))) unique.push("D4");
  else if (cells.length > 1 && matchedGroups.size > 1) unique.push("D3");
  unique.push("D6");
  return { task: String(task), path: [...new Set(unique)], matches };
}

export function compactPath(path) {
  return path.map((cell) => BOARD[cell]?.symbol ?? cell).join("·");
}

export function createTrace(task, routed = routeTask(task), metadata = {}) {
  const now = new Date().toISOString();
  return {
    schema: "cse.trace/v2",
    engine: ENGINE_VERSION,
    traceId: metadata.traceId ?? `cse-${Date.now().toString(36)}`,
    createdAt: now,
    task: String(task),
    route: routed.path,
    compactPath: compactPath(routed.path),
    classification: routed.matches,
    evidence: [],
    uncertainty: { level: "unassessed", reasons: ["No evidence records have been attached yet."] },
    decisions: [],
  };
}

export function addEvidence(trace, record) {
  if (!record || !record.source || !record.method) throw new TypeError("Evidence needs source and method.");
  const next = structuredClone(trace);
  next.evidence.push({
    id: record.id ?? `e${next.evidence.length + 1}`,
    source: String(record.source),
    method: String(record.method),
    claim: String(record.claim ?? ""),
    confidence: Number.isFinite(record.confidence) ? Math.max(0, Math.min(1, record.confidence)) : null,
    limitations: Array.isArray(record.limitations) ? record.limitations.map(String) : [],
    capturedAt: record.capturedAt ?? new Date().toISOString(),
  });
  const hasLowConfidence = next.evidence.some((item) => item.confidence !== null && item.confidence < 0.7);
  next.uncertainty = hasLowConfidence
    ? { level: "material", reasons: ["At least one evidence record has confidence below 0.70."] }
    : { level: "bounded", reasons: ["Evidence is attached; inspect limitations before presenting conclusions."] };
  return next;
}

export function responseEnvelope(trace, answer, metadata = {}) {
  return {
    schema: "cse.response/v2",
    engine: ENGINE_VERSION,
    answer: String(answer),
    path: trace.compactPath,
    traceId: trace.traceId,
    evidenceCount: trace.evidence.length,
    uncertainty: trace.uncertainty,
    generatedAt: new Date().toISOString(),
    metadata,
  };
}

export async function loadSkill(cell, skillsRoot = resolve(fileURLToPath(new URL("../skills", import.meta.url)))) {
  const record = BOARD[cell];
  if (!record) throw new RangeError(`Unknown board cell: ${cell}`);
  const candidates = [SKILL_FILES[cell], `${record.symbol.toLowerCase()}-mind.md`].filter(Boolean);
  for (const candidate of candidates) {
    try { return { cell, path: resolve(skillsRoot, candidate), content: await readFile(resolve(skillsRoot, candidate), "utf8") }; }
    catch { /* compatibility aliases are tried in order */ }
  }
  return { cell, path: null, content: `No bundled skill file found for ${cell}; use the cell manifest only.` };
}

export function manifest() {
  return Object.fromEntries(Object.entries(BOARD).map(([cell, info]) => [cell, { ...info, rules: RULES[cell] ?? [] }]));
}
