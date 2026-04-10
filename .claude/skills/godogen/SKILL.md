---
name: godogen
description: |
  This skill should be used when the user asks to "make a game", "build a game", "generate a game", or wants to generate or update a complete Godot game from a natural language description.
---

# Game Generator — Orchestrator

Generate and update Godot games from natural language.

## Capabilities

Read each sub-file from `${CLAUDE_SKILL_DIR}/` when you reach its pipeline stage.

| File | Purpose |
|------|---------|
| `decomposer.md` | Decompose game into a development plan (`PLAN.md`) |
| `scaffold.md` | Design architecture and produce compilable Godot skeleton |

## Pipeline

```
User request
    |
    +- Check if PLAN.md exists (resume check)
    |   +- If yes: read PLAN.md, STRUCTURE.md, MEMORY.md -> skip to task execution
    |   +- If no: continue with fresh pipeline below
    |
    +- Decompose into tasks -> PLAN.md
    +- Design architecture -> STRUCTURE.md + project.godot + stubs
    |
    +- For every task in PLAN.md:
    |   +- Set `**Status:** pending`
    |   +- Fill `**Targets:**` with concrete project-relative files expected to change
    |     (e.g. scenes/main.tscn, scripts/player_controller.gd, project.godot)
    |     inferred from task text + scene/script mappings in STRUCTURE.md
    |
    +- Show user a concise plan summary (game name, numbered task list)
    |
    +- Find next ready task (pending, deps all done)
    +- While a ready task exists:
    |   +- Update PLAN.md: mark task status -> in_progress
    |   +- Skill(skill="godot-task") with task block
    |   +- Mark task completed in PLAN.md OR replan based on the outcome, summarize to user
    |   +- git add . && git commit -m "Task N done"
    |   +- Find next ready task
    |
    +- Summary of completed game
```

PLAN.md task `**Status:**`: one of `pending`, `in_progress`, `done`, `done (partial)`, `skipped`.

## Running Tasks

Each task runs via `Skill(skill="godot-task")` which auto-forks into a sub-agent with clean context. Pass the full task block from PLAN.md as the skill argument:

```
Skill(skill="godot-task") with argument:
  ## N. {Task Name}
  - **Status:** in_progress
  - **Targets:** scenes/main.tscn, scripts/player_controller.gd
  - **Goal:** ...
  - **Requirements:** ...
  - **Verify:** ...
```

## Mid-Pipeline Recovery

- **Reset scenes/scripts** — regenerate project skeleton when a task has corrupted or outgrown the architecture.
- **Rewrite the plan** — edit PLAN.md when a task reveals the approach is wrong or new requirements emerge.

## Debugging

If a task reports failure or you suspect integration issues:
- Read `MEMORY.md` — task execution logs discoveries and workarounds
- Run `timeout 30 godot --headless --quit 2>&1` to check cross-project compilation
