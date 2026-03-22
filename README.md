# Triarc Slice

This repository contains the Godot gameplay slice, the editor used to author layouts and animaps, and the supporting content/data for heroes and actions.

## Gameplay

Gameplay is a lane-based battle screen with:

- Three allied heroes at the bottom.
- Three enemy heroes at the top.
- A five-card action hand.
- An energy bar and reroll control.
- A draggable info button on the gameplay HUD.

### Core Loop

1. Enter a match.
2. Drag an action card onto one of your allied heroes to cast it.
3. Spend energy to play cards and use reroll when needed.
4. Track enemy casts, hero HP, and the elapsed match timer.

### Info Button

The gameplay HUD includes an info button with custom drag behavior:

- On mouse down, it switches into its `dragging` animap state.
- After drag starts, allied heroes, enemy heroes, and action cards are dimmed.
- The currently hovered target returns to normal brightness.
- On release, the button returns to its original position.
- After a valid drop, it reappears with a small zoom animation.

## Project Layout

- `game/`: Godot project, scenes, scripts, and exported game assets.
- `editor/`: content/layout editor and its frontend.
- `data/`: source-of-truth content for heroes, actions, layouts, and animaps.
- `scripts/`: utility scripts for content sync and migration.

## Development Notes

- Gameplay layout data lives in `data/game-layout.json`.
- If you change files under `editor/frontend/src/`, rebuild with:

```bash
npm --prefix editor/frontend run build
```

- If you edit content data under `data/`, sync the server content with:

```bash
node scripts/sync-content.mjs
```
