
The working directory is the project root. NEVER `cd` — use relative paths for all commands.

# Godot

The project lives in `game/`, not the repo root, so every godot invocation needs `--path game`. Script paths passed after that are relative to `game/`.

There is no `--script-check` flag. Passing it causes godot to ignore the arg and launch the full game, which looks like a hang.

To type-check a GDScript file, use `--script` + `--check-only`. Because the scene doesn't actually run, godot won't self-quit reliably, so wrap the call with a hard cutoff and inspect the output for `SCRIPT ERROR`:

```
( godot --headless --path game --script scripts/hero.gd --check-only 2>&1 & PID=$!; sleep 10; kill $PID 2>/dev/null; wait $PID 2>/dev/null ) | grep -E "SCRIPT ERROR|ERROR:" || echo "OK"
```

A non-zero exit (often 134 from an Effekseer GDExtension crash during cleanup) is harmless — what matters is whether `SCRIPT ERROR` appeared before the cutoff.

# Editor Frontend

After modifying any files under `editor/frontend/src/`, rebuild the frontend:

```
npm --prefix editor/frontend run build
```

The build output goes to `editor/frontend/dist/` which is served by the editor binary.

# Syncing Game Data to Server

Game content (heroes, actions) lives in `data/` as the source of truth:

- `data/hero/{slug}/hero.json` — hero stats, element affinities, audio, art config
- `data/action/{slug}/action.json` — action cost, element, targeting, gameplay mechanics, art config

After editing data (via the editor UI or by hand), regenerate the server's Gleam content file:

```
node scripts/sync-content.mjs
```

This reads all JSONs and writes `../vg-server/src/vg/content.gleam`. The server must be rebuilt after (`gleam build` in vg-server).

# Hand Card System
See [STRUCTURE.md](./STRUCTURE.md) for detailed architecture.
