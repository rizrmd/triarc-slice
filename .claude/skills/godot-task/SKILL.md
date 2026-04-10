---
name: godot-task
description: |
  Execute a single Godot development task — generate scenes and/or scripts, verify compilation.
context: fork
---

# Godot Task Executor

All files below are in `${CLAUDE_SKILL_DIR}/`. Load progressively — read each file when its phase begins, not upfront.

| File | Purpose | When to read |
|------|---------|--------------|
| `quirks.md` | Known Godot gotchas and workarounds | Before writing any code |
| `gdscript.md` | GDScript syntax reference | Before writing any code |
| `scene-generation.md` | Building `.tscn` files via headless GDScript builders | Targets include `.tscn` |
| `script-generation.md` | Writing runtime `.gd` scripts for node behavior | Targets include `.gd` |
| `coordination.md` | Ordering scene + script generation | Targets include both `.tscn` and `.gd` |
| `test-harness.md` | Writing `test/test_{id}.gd` verification scripts | Before writing test harness |
| `doc_api/_common.md` | Index of ~128 common Godot classes (one-line each) | Need API ref; scan to find class names |
| `doc_api/_other.md` | Index of ~732 remaining Godot classes | Need API ref; class isn't in `_common.md` |
| `doc_api/{ClassName}.md` | Full API reference for a single Godot class | Need API ref; look up specific class |

Bootstrap doc_api: `bash ${CLAUDE_SKILL_DIR}/tools/ensure_doc_api.sh`

Execute a single development task from PLAN.md:

$ARGUMENTS

## Workflow

1. **Analyze the task** — read the task's **Targets** to determine what to generate:
   - `scenes/*.tscn` targets → generate scene builder(s)
   - `scripts/*.gd` targets → generate runtime script(s)
   - Both → generate scenes FIRST, then scripts (scenes create nodes that scripts attach to)
2. **Import assets** — run `timeout 60 godot --headless --import` to generate `.import` files for any new textures, GLBs, or resources. Without this, `load()` fails with "No loader found" errors. Re-run after modifying existing assets.
3. **Generate scene(s)** — write GDScript scene builder, compile to produce `.tscn`
4. **Generate script(s)** — write `.gd` files to `scripts/`
5. **Validate** — run `timeout 60 godot --headless --quit` to check for parse errors across all project scripts
6. **Fix errors** — if Godot reports errors, read output, fix files, re-run. Repeat until clean.
7. **Generate test harness** — write `test/test_{task_id}.gd` implementing the task's **Verify** scenario.

## Iteration Tracking

Steps 3-7 form an **implement → validate → fix** loop.

There is no fixed iteration limit — use judgment:
- If there is progress — even in small, iterative steps — keep going.
- If you recognize a **fundamental limitation** (wrong architecture, missing engine feature, broken assumption), stop early. More loops won't help.
- The signal to stop is **"I'm making the same kind of fix repeatedly without convergence"**.

## Reporting to Orchestrator

Always end your response with:
- What was implemented
- Whether compilation passes cleanly

On failure, also include:
- What's still wrong
- What you tried and why it didn't fix it
- Your best guess at the root cause

The caller (godogen orchestrator) will decide whether to adjust the task, re-scaffold, or accept the current state.

## Commands

```bash
# Import new/modified assets (MUST run before scene builders):
timeout 60 godot --headless --import

# Compile a scene builder (produces .tscn):
timeout 60 godot --headless --script <path_to_gd_builder>

# Validate all project scripts (parse check):
timeout 60 godot --headless --quit 2>&1
```

**Error handling:** Parse Godot's stderr/stdout for error lines. Common issues:
- `Parser Error` — syntax error in GDScript, fix the line indicated
- `Invalid call` / `method not found` — wrong node type or API usage, look up the class in `doc_api`
- `Cannot infer type` — `:=` used with `instantiate()` or polymorphic math functions, see type inference rules
- Script hangs — missing `quit()` call in scene builder; kill the process and add `quit()`

## Project Memory

Read `MEMORY.md` before starting work — it contains discoveries from previous tasks (workarounds, Godot quirks, asset details, architectural decisions). After completing your task, write back anything useful you learned: what worked, what failed, technical specifics others will need.
