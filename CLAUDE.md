
The working directory is the project root. NEVER `cd` — use relative paths for all commands.

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
