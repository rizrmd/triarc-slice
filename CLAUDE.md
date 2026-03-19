Use `/godogen` to generate or update this game from a natural language description.

# Project Structure

Game projects follow this layout once `/godogen` runs:

```
project.godot          # Godot config: viewport, input maps, autoloads
STRUCTURE.md           # Architecture reference: scenes, scripts, signals
PLAN.md                # Task DAG — Goal/Requirements/Verify/Status per task
MEMORY.md              # Accumulated discoveries from task execution
scenes/
  build_*.gd           # Headless scene builders (produce .tscn)
  *.tscn               # Compiled scenes
scripts/*.gd           # Runtime scripts
test/
  test_task.gd         # Per-task visual test harness (overwritten each task)
```

The working directory is the project root. NEVER `cd` — use relative paths for all commands.

# Editor Frontend

After modifying any files under `editor/frontend/src/`, rebuild the frontend:

```
npm --prefix editor/frontend run build
```

The build output goes to `editor/frontend/dist/` which is served by the editor binary.
