---
name: tools-and-solvers
version: 1.0
board_position: TS
symbol: TS
description: >
  TOOLS & SOLVERS — operational cell for real-world verification.
  ALWAYS activate when: a problem has an executable specification
  (PDDL planning, SMT, SAT, chess engine, numerical proof, IUPAC/SMILES check).
  Provides verified recipes for pyperplan, z3, python-sat (CaDiCaL),
  python-chess, sympy, numpy. Enforces the anti-refusal rule and the
  anti-BFS guardrail. Converts solver output into the exact format
  expected by the verifier (e.g., LongCoT `solution = [[block,from,to], ...]`).
  Core rule: ∀ problem with ∃ solver → call solver, verify, then emit.
  NEVER refuse a tool call. NEVER enumerate > 10^6 states by hand.
---

# TOOLS & SOLVERS v1.0
# Board position: TS — additive operational cell

---

## §0  CORE PRINCIPLE

```python
# Two laws:
#   L1 (anti-refusal): tool_available(t) ∧ task_requires(t) ⟹ call(t)
#   L2 (anti-BFS):     |state_space| > 10^6 ⟹ ¬brute_force; use solver
#
# Budget:
#   thinking : free CoT (derive plan, pick solver, write code)
#   output   : compressed via A1; final answer in verifier format
```

Routing: when you see any of these signals, come to TS before guessing.

| Signal in question | Solver | Recipe §        |
|--------------------|--------|-----------------|
| "blocks", "stacks", "move block X" | **solve_bw tool** (primary) / pyperplan (backup) | §2 |
| "Sokoban", "Hanoi", "Freecell", classical plan | pyperplan | §2 |
| "Sudoku", "N-queens", "scheduling", integer constraints | z3 SMT | §3 |
| "SAT", CNF, k-SAT, graph coloring, covering | python-sat CaDiCaL | §4 |
| "FEN", "UCI", "best move", "mate in k" | python-chess + engine | §5 |
| "prove", "simplify", "integrate", "solve equation" | sympy | §6 |
| "matrix", "eigenvalues", "Hadamard HH^T = nI" | numpy | §7 |
| "M_i: AxB", "matrix chain", "MCM", "Q1..Q5" parens | **solve_mcm tool** | §10 |
| "Hindley-Milner", "Algorithm W", "let x = e in", "binding trace" | **solve_hm tool** (when available) | §11 |

---

## §1  ANTI-REFUSAL BLOCK  (Hermes-style enforcement)

Paste this as the first line of your inner monologue whenever a tool
exists for the task:

```
[TS-ENFORCE]
 - I have a Python sandbox with pyperplan, z3, python-sat, python-chess,
   sympy, numpy preinstalled.
 - Refusing = failure. "I cannot solve without tools" is forbidden.
 - My move: pick the solver in §2–§7, write code, call python_exec,
   parse stdout, emit the exact format the verifier expects.
```

Forbidden phrases (do NOT emit any of these):
- "I cannot solve this without additional tools"
- "This requires a planner I don't have"
- "Let me give you a general approach"

Allowed behaviour:
- Call `python_exec` with a self-contained script.
- On error, read `stderr`, fix the script, retry once.
- If the solver fails twice, fall back to §8 greedy heuristics and
  mark the answer `# best-effort`.

---

## §2  BlocksWorld — FAST PATH (the one you want 99% of the time)

**Read this first.** BlocksWorld_easy has ~60 blocks. pyperplan is optimal
but can time out on 60 blocks in 25–180 s. The §8 greedy algorithm is
**O(n), always returns a legal plan, and is exactly what LongCoT grades**
(LongCoT only checks legality + goal match, NOT optimality).

### ★★★ PRIMARY PATH — call `solve_bw` and you are DONE ★★★

Since v3g the harness exposes a **dedicated** BlocksWorld tool that does
everything for you — no transcription, no python_exec, no brackets:

```
tool call:  solve_bw
arguments:  { "problem_text": "<the ENTIRE puzzle text>" }
returns:    {
  "ok": true,
  "reason": "ok",
  "plan": [[block, from, to], ...],
  "n_moves": 702, "n_stacks": 3, "n_blocks": 60,
  "stacks": [[...], [...], [...]],
  "goal":   [[...], [...], [...]],
  "solution_line": "solution = [[...], ...]"   ← PASTE THIS VERBATIM
}
```

**What to do:**
1. Call `solve_bw` with `problem_text = <the full puzzle — everything
   from "You are being tested" through "solution = ..."> as ONE string.
2. Read the `solution_line` field from the JSON reply.
3. Emit that exact line as your final answer. Stop.

**Why this exists.** The 9B model mis-transcribes 60-block lists when
pasting them into `python_exec` (block swaps, dropped stacks). `solve_bw`
regex-extracts Initial/Goal from the raw prompt — zero transcription steps,
zero chances to mis-type a 60-element list.

**If `ok` is False** (rare — only when the greedy solver gets stuck on a
pathological instance): call `verify_solution` with the question_id and
the `solution_line` anyway. LongCoT may partially credit a legal prefix.

### ★ SECONDARY PATH — python_exec + greedy_bw (only if solve_bw is unavailable)

`greedy_bw`, `simulate_bw`, and `check_bw` are **PRE-INSTALLED** in every
`python_exec` call. DO NOT rewrite them. DO NOT invent your own planner.
DO NOT run a manual simulation. The entire, verified solver is ONE line.

Your python_exec must be **this exact template** — fill in the two lists:

```python
stacks = [ ... ]   # paste the Initial state verbatim, 0-indexed
goal   = [ ... ]   # paste the Goal state verbatim
plan   = greedy_bw(stacks, goal)
ok, why = check_bw(stacks, goal, plan)
print("CHECK:", ok, why)
print("solution =", plan)
```

Then in your final answer, output EXACTLY:

```
solution = <paste the `plan` printed above>
```

No more, no less. If `ok` is True you are done. If `ok` is False, call
`python_exec` again — same template, but print `solution` anyway (LongCoT
may still partially credit a legal prefix) — then stop.

### Full source of the pre-installed function (read-only reference)

```python
# Already defined for you in python_exec — you do NOT need to paste it.
def greedy_bw(stacks, goal):
    N = max(len(stacks), len(goal), 2)      # need ≥ 2 stacks to shuffle
    state = [list(s) for s in stacks] + [[] for _ in range(N - len(stacks))]
    gpad  = [list(g) for g in goal]   + [[] for _ in range(N - len(goal))]
    moves = []

    def find(b):
        for i in range(N):
            if b in state[i]:
                return i
        return -1

    def unstack_top(i, forbidden):
        """Move top of stack i onto any stack j ∉ forbidden, preferring empty/short."""
        if not state[i]:
            return False
        opts = [j for j in range(N) if j != i and j not in forbidden]
        if not opts:
            opts = [j for j in range(N) if j != i]  # relax
        if not opts:
            return False
        j = min(opts, key=lambda k: len(state[k]))
        b = state[i].pop(); state[j].append(b)
        moves.append([b, i, j])
        return True

    # Build each goal stack bottom-up. While building stack gi, we forbid
    # dumping onto gi itself so we never mess up what we just built.
    for gi in range(len(goal)):
        for gh, b in enumerate(gpad[gi]):
            # already correctly placed (built bottom-up, so below-matches-below)
            if gh < len(state[gi]) and state[gi][gh] == b:
                continue
            # Step 1: expose b at the top of its current stack.
            src = find(b)
            if src < 0:  # shouldn't happen
                return moves
            while state[src][-1] != b:
                if not unstack_top(src, forbidden=(gi,)):
                    return moves                # stuck; emit partial
                src = find(b)                   # b may have moved? no: unstacked above it
                if src < 0:
                    return moves
            # Step 2: make stack gi exactly `gh` blocks tall (pop extras).
            while len(state[gi]) > gh:
                if not unstack_top(gi, forbidden=(src,)):
                    return moves
            # Step 3: b may have shifted if it was ON stack gi; re-expose.
            src = find(b)
            if src < 0:
                return moves
            while state[src] and state[src][-1] != b:
                if not unstack_top(src, forbidden=(gi,)):
                    return moves
            # Step 4: move b from src to gi (if different).
            if src != gi:
                state[src].pop(); state[gi].append(b)
                moves.append([b, src, gi])
    return moves

# USAGE (paste this in python_exec):
stacks = [...]   # from the problem (0-indexed list of stacks, bottom-to-top)
goal   = [...]   # from the problem (same format)
plan   = greedy_bw(stacks, goal)
# Quick self-check before emitting:
def simulate(stacks, plan):
    N = max(len(stacks), max((m[2] for m in plan), default=0)+1)
    st = [list(s) for s in stacks] + [[] for _ in range(N - len(stacks))]
    for b, f, t in plan:
        assert st[f] and st[f][-1] == b, (b, f, st[f])
        st[f].pop(); st[t].append(b)
    return st
final = simulate(stacks, plan)
print("final == goal:", final[:len(goal)] == [list(g) for g in goal])
print("solution =", plan)
```

Copy the `solution = [[...], ...]` line verbatim into your final answer.
Only commit if the self-check printed `final == goal: True`.

Use §3 (pyperplan) ONLY if the problem explicitly asks for the **shortest**
plan or the grader penalizes plan length.

---

## §3  pyperplan — OPTIMAL classical planning (Sokoban, Hanoi, small BW)

Verified import path (pyperplan 2.1, do NOT use `pyperplan.heuristics.hff`):

```python
from pyperplan.planner import search_plan
from pyperplan.search.a_star import astar_search
from pyperplan.search.breadth_first_search import breadth_first_search
from pyperplan.heuristics.relaxation import hFFHeuristic, hAddHeuristic
from pyperplan.heuristics.blind import BlindHeuristic
from pyperplan.heuristics.lm_cut import LmCutHeuristic
```

### §2.1  BlocksWorld PDDL template (LongCoT-compatible)

```python
# stacks: list of lists, bottom-to-top, e.g. stacks=[["A","B"],["C"]]
# goal  : same format
def blocksworld_pddl(stacks, goal, domain_name="bw"):
    blocks = sorted({b for s in stacks+goal for b in s})
    def atoms(ss):
        A = []
        for s in ss:
            if not s:
                continue
            A.append(f"(ontable {s[0]})")
            for i in range(1, len(s)):
                A.append(f"(on {s[i]} {s[i-1]})")
            A.append(f"(clear {s[-1]})")
        return A
    init = atoms(stacks) + ["(handempty)"]
    gol  = atoms(goal)
    objs = " ".join(blocks)
    problem = f"""(define (problem p)
(:domain blocks)
(:objects {objs})
(:init {' '.join(init)})
(:goal (and {' '.join(gol)})))"""
    return problem
```

### §2.2  Domain file (save as `blocks.pddl`)

```lisp
(define (domain blocks)
 (:requirements :strips)
 (:predicates (on ?x ?y) (ontable ?x) (clear ?x) (handempty) (holding ?x))
 (:action pick-up :parameters (?x)
   :precondition (and (clear ?x) (ontable ?x) (handempty))
   :effect (and (not (ontable ?x)) (not (clear ?x)) (not (handempty)) (holding ?x)))
 (:action put-down :parameters (?x)
   :precondition (holding ?x)
   :effect (and (not (holding ?x)) (clear ?x) (handempty) (ontable ?x)))
 (:action stack :parameters (?x ?y)
   :precondition (and (holding ?x) (clear ?y))
   :effect (and (not (holding ?x)) (not (clear ?y)) (clear ?x) (handempty) (on ?x ?y)))
 (:action unstack :parameters (?x ?y)
   :precondition (and (on ?x ?y) (clear ?x) (handempty))
   :effect (and (holding ?x) (clear ?y) (not (clear ?x)) (not (handempty)) (not (on ?x ?y)))))
```

### §2.3  Solve & convert to `[[block,from,to], ...]` LongCoT format

```python
import tempfile, os
from pyperplan.planner import search_plan
from pyperplan.search.a_star import astar_search
from pyperplan.heuristics.relaxation import hFFHeuristic

def solve_bw(stacks, goal):
    prob = blocksworld_pddl(stacks, goal)
    with tempfile.TemporaryDirectory() as d:
        dp = os.path.join(d, "d.pddl"); pp = os.path.join(d, "p.pddl")
        open(dp,"w").write(DOMAIN_PDDL)   # from §2.2
        open(pp,"w").write(prob)
        plan = search_plan(dp, pp, astar_search, hFFHeuristic)
    # plan is list of Operator objects; name looks like "(stack a b)"
    moves = []
    # simulate to reconstruct (block, from_stack_id, to_stack_id) as LongCoT wants
    state = [list(s) for s in stacks]           # mutable copy
    def find(b):
        for i,s in enumerate(state):
            if s and s[-1]==b: return i
        return None
    for op in plan:
        parts = op.name.strip("()").split()
        act = parts[0]
        if act == "pick-up":        # from table → hand
            b = parts[1]; src = find(b); held = (b, src)
        elif act == "unstack":      # from top of pile → hand
            b = parts[1]; src = find(b); held = (b, src)
        elif act == "put-down":     # hand → new table stack
            b = held[0]; src = held[1]
            # pick an empty stack or create new one
            dst = next((i for i,s in enumerate(state) if not s), len(state))
            if dst == len(state): state.append([])
            state[src].pop(); state[dst].append(b)
            moves.append([b, src, dst])
        elif act == "stack":        # hand → top of ?y
            b = parts[1]; y = parts[2]; src = held[1]; dst = find(y)
            state[src].pop(); state[dst].append(b)
            moves.append([b, src, dst])
    return moves
```

### §2.4  LongCoT output block (exact verifier format)

```
solution = [[block, from, to], [block, from, to], ...]
```

Stacks are 0-indexed in the order given by the problem statement.
Emit *only* the assignment line; A1 compression takes care of the rest.

### §2.5  Anti-BFS guardrail

- Never write `for perm in itertools.permutations(blocks): ...`
- Never write a hand-coded BFS over `frozenset` states for n_blocks > 8
- If pyperplan takes > 20s, switch heuristic: `astar_search` → `LmCutHeuristic` or fall back to `breadth_first_search` with small n.

---

## §3  z3 — SMT (Sudoku, N-queens, scheduling, number theory)

```python
from z3 import Solver, Int, And, Or, Distinct, sat
# Sudoku 9×9:
s = Solver()
X = [[Int(f"x_{r}_{c}") for c in range(9)] for r in range(9)]
for r in range(9):
    for c in range(9):
        s.add(And(1 <= X[r][c], X[r][c] <= 9))
for r in range(9): s.add(Distinct(X[r]))
for c in range(9): s.add(Distinct([X[r][c] for r in range(9)]))
for br in range(3):
    for bc in range(3):
        s.add(Distinct([X[3*br+i][3*bc+j] for i in range(3) for j in range(3)]))
# add clues: s.add(X[0][0] == 5) ...
assert s.check() == sat
M = s.model()
grid = [[M[X[r][c]].as_long() for c in range(9)] for r in range(9)]
```

---

## §4  python-sat — CaDiCaL SAT (CNF, k-SAT, graph coloring)

IMPORTANT: the right PyPI package is **`python-sat`**, NOT `pysat`
(`pysat` on PyPI is a NASA space-weather library).

```python
from pysat.solvers import Cadical153, Glucose4
from pysat.formula import CNF
cnf = CNF(); cnf.append([1,-2,3]); cnf.append([-1,2])
with Cadical153(bootstrap_with=cnf) as s:
    sat = s.solve()
    model = s.get_model() if sat else None
```

Graph k-coloring → CNF encoder template: variable `x(v,c)` = vertex v has color c.

---

## §5  python-chess — board eval, FEN/UCI I/O

```python
import chess
b = chess.Board(fen)                     # FEN in
for mv in b.legal_moves: ...
b.push_uci("e2e4"); print(b.fen())       # FEN out after UCI
# material heuristic for `uci_to_fen_easy` style problems:
VAL = {chess.PAWN:1, chess.KNIGHT:3, chess.BISHOP:3,
       chess.ROOK:5, chess.QUEEN:9, chess.KING:0}
def eval_board(b):
    s = 0
    for pt,v in VAL.items():
        s += v*(len(b.pieces(pt, chess.WHITE)) - len(b.pieces(pt, chess.BLACK)))
    return s
```

If `chess.engine` + Stockfish is available, prefer UCI engine search for
"best move / mate in k"; otherwise do depth-2 negamax with `eval_board`.

---

## §6  sympy — symbolic algebra, number theory, calculus

```python
from sympy import symbols, solve, simplify, isprime, factorint, Rational, Sum, oo
from sympy.ntheory import quadratic_residues, nextprime, totient
x, n = symbols("x n", integer=True)
# examples:
solve(x**2 - 5*x + 6, x)                 # [2, 3]
factorint(2**64 - 1)
Sum(1/n**2, (n, 1, oo)).doit()           # π²/6
```

---

## §7  numpy — linear algebra, matrix verification

```python
import numpy as np
def is_hadamard(H):
    H = np.asarray(H); n = H.shape[0]
    return (set(np.unique(H)).issubset({-1,1})
            and np.allclose(H @ H.T, n*np.eye(n)))
```

---

## §8  (moved) BlocksWorld greedy — see §2 FAST PATH at the top of this cell

§2 is now the primary BlocksWorld recipe (O(n), always legal).
§3 pyperplan is the fallback for medium/hard instances where optimal
plan length is graded.

---

## §9  OUTPUT CONTRACT (verifier-facing)

Regardless of solver used, the **last fenced block** of your answer MUST
match what the LongCoT verifier parses:

- BlocksWorld:   `solution = [[block, from, to], ...]`
- Dungeon:       `solution = "UDLR..."`  (string of moves)
- Chess UCI→FEN: `solution = "FEN string"`
- Math numeric:  `solution = <number or sympy expression>`
- SAT/SMT:       `solution = {var: value, ...}`

Always assign to the name `solution`. A1 compression applies to prose
above this line only — never compress the contract itself.

---

PATH tag when TS is used:  include `TS` in your path log, e.g.
`PATH: D5·A1·TS·A6·D6`  (MASTER → TC → Tools&Solvers → CS → END).

---

## §10  Matrix-Chain (MCM_easy) — `solve_mcm` FAST PATH

LongCoT cs/MCM_easy gives a list `M_1: A×B`, `M_2: B×C`, … `M_n: Y×Z` and
asks 5 questions (Q1 optimal paren string, Q2 optimal cost in scalar ops,
Q3 expression-tree depth, Q4 widest "kept" paren span, Q5 = (Q4-Q3)·Q2).

### ★ PRIMARY PATH — call `solve_mcm` and emit the returned line ★

```
tool call:  solve_mcm
arguments:  { "problem_text": "<the ENTIRE puzzle text>" }
returns:    {
  "ok": true,
  "n_matrices": n,
  "Q1": "((M_1*M_2)*M_3)",
  "Q2": <int>, "Q3": <int>, "Q4": <int>, "Q5": <int>,
  "solution_line": "solution = {\"Q1\": \"...\", \"Q2\": ..., ...}"
}
```

Steps:
1. Call `solve_mcm` with `problem_text = <the full puzzle text as one string>`.
2. Read `solution_line` from the JSON reply.
3. Emit that line verbatim. Done.

The harness AUTO-SUBSTITUTES `problem_text` with the original prompt
(`_AUTO_PROMPT_TOOLS`), so even an empty arg works — but pass the real
prompt for forward-compat.

### Verified cost convention

Q2 counts BOTH multiplications AND additions per scalar output:
`cost(A B) = 2 · p · q · r` where A is p×q and B is q×r.

### Verified Q4 paren-span rule

After computing the optimal binary tree T, the printed Q1 expression keeps
parens ONLY around internal nodes that are right children of internal nodes
(left-associative default parsing). Q4 is the LARGEST number of leaves
under any such kept-paren node (1 if no parens are kept).

### Output format

Single line, JSON dict, double quotes, integer values bare:
```
solution = {"Q1": "((M_1*(M_2*M_3))*M_4)", "Q2": 12345, "Q3": 3, "Q4": 2, "Q5": -12345}
```

100 % verified score on the full longcot-mini MCM slice (25/25 in 231 s
on Qwen 3.5 9B / Ollama / 128k context).

---

## §11  Hindley-Milner (HM_easy) — `solve_hm` (planned)

LongCoT cs/HM_easy gives a let-bound program with N ≥ 200 bindings and
asks for two principal type schemes, the result type, the global trace
length M, and 22 specific binding entries from B[1..M].

**Why a tool is mandatory.** Algorithm W on N=364 produces ≥ 700 unification
steps with FIFO equation queue, occurs check, and a global `next_tv`
counter. CoT-execution is INFEASIBLE for any 9B/30B model — the model
WILL hallucinate (e.g. emit `forall a0 . a0 -> a0` for a concrete product
type).

### When `solve_hm` is registered (HARNESS DOES NOT YET EXPOSE IT)

```
tool call:  solve_hm
arguments:  { "problem_text": "<the ENTIRE puzzle text>" }
returns:    {
  "ok": true,
  "q1": "<scheme>", "q2": "<scheme>", "q3": "<type>",
  "q4": <int>,                # M = total bindings
  "q5": [{"j": <int>, "binding_str": "i=<dec>; <prefix>"}, ...],
  "solution_line": "solution = {\"q1\": ..., \"q2\": ..., ...}"
}
```

Steps (when available):
1. Call `solve_hm` with the full prompt.
2. Emit `solution_line` verbatim.

### When `solve_hm` is NOT YET registered (current state)

DO NOT attempt CoT execution for N > 30. Best-effort fallback:

```python
# inside python_exec — minimal stub that emits a parseable answer
sol = {
    "q1": "Bool",         # placeholder
    "q2": "Bool",
    "q3": "(Nat × Bool)",  # use Unicode × (U+00D7) for products
    "q4": 0,
    "q5": []              # empty list is valid JSON; verifier will mark wrong
}
import json; print("solution =", json.dumps(sol, ensure_ascii=False))
```

This at least parses (giving the verifier a `wrong` instead of
`wrong_formatting`) so the run isn't lost. Real solving requires
implementing the deterministic Algorithm W in `harness/tools.py`
(see `_solve_mcm` for the same pattern).

### Format spec (full details in A6 §7.1)

```
solution = {"q1": "<scheme>", "q2": "<scheme>", "q3": "<type>",
            "q4": <int>,
            "q5": [{"j": <int>, "binding_str": "i=<dec>; <prefix-type>"}, ...]}
```

- Type printing: `Bool`, `Nat`, `aN`, `(t1 × t2)` (Unicode ×), `t1 -> t2`.
- Scheme printing: `forall a0 a1 ... . τ` or just `τ` if monomorphic.
- Prefix types in q5: `Bool` | `Nat` | `Var <dec>` | `Arr (<T1>) (<T2>)` | `Prod (<T1>) (<T2>)`.
- All quotes are DOUBLE quotes; emit on a single line.
