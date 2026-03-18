# Triarc Slice - Editor Project Overview

## What Is This?

A visual editor for a Godot-based card game. It lets you create and edit **hero cards**, **action cards**, and arrange **game UI layouts** for different screen sizes.

The editor is a local app: a Go HTTP backend serves a React frontend, and both read/write to the `data/` directory that the Godot game also consumes.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Editor (React SPA)        :5173 (dev)          │
│  - Card Editor (heroes & actions)               │
│  - Game Layout Editor                           │
│  - Card List / Management                       │
└──────────────┬──────────────────────────────────┘
               │ /api/* proxied to :8080
┌──────────────▼──────────────────────────────────┐
│  Backend (Go)              :8080                 │
│  - Serves frontend dist                         │
│  - REST API for CRUD on cards/actions/layout     │
│  - Image processing (base64 → WebP)             │
│  - Serves /data/* and /assets/*                  │
└──────────────┬──────────────────────────────────┘
               │ filesystem
┌──────────────▼──────────────────────────────────┐
│  data/                                           │
│  ├── hero/{slug}/hero.json + img/ + audio/       │
│  ├── action/{slug}/action.json + img/            │
│  └── game-layout.json                            │
│                                                  │
│  assets/                                         │
│  ├── characters/   (sprite sheets)               │
│  ├── ui/           (frames, bars, icons)         │
│  ├── places/       (backgrounds)                 │
│  └── ...                                         │
└──────────────┬──────────────────────────────────┘
               │ read at runtime
┌──────────────▼──────────────────────────────────┐
│  Game (Godot)                                    │
│  - LayoutManager.gd reads game-layout.json       │
│  - ActionCard.gd reads action configs            │
│  - Renders cards and UI from shared data         │
└─────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer    | Technology                                                         |
|----------|--------------------------------------------------------------------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS, Radix UI, react-rnd      |
| Backend  | Go, net/http, chai2010/webp                                        |
| Game     | Godot (GDScript)                                                   |
| Routing  | HashRouter (React Router v7)                                       |

---

## Frontend Pages & Routes

| Route              | Component          | Purpose                                    |
|--------------------|--------------------|--------------------------------------------|
| `/`                | CardList           | Browse, search, create, delete heroes/actions |
| `/edit/:slug`      | EditorPage         | Edit a hero or action card (dispatches by query param) |
| `/game-layout`     | GameLayoutEditor   | Drag-drop layout editor for game UI        |

---

## Key Frontend Components

### CardEditor (`src/CardEditor.tsx` ~75KB)
The main editing surface for hero and action cards. Supports:
- **Layered canvas rendering** - background, foreground sprites, masks, name, HP bar
- **Tabs** - card (canvas), info (lore), stats, audio, pose
- **Undo/Redo** with history stack
- **Auto-save** to backend
- **Mask painting** (alpha masking via destination-out compositing)

### GameLayoutEditor (`src/GameLayoutEditor.tsx` ~54KB)
Visual drag-drop editor for game UI positioning:
- **Viewport presets** - 9:16, iPhone X, Galaxy, iPad, Square, Landscape
- **Box system** - each UI element is a draggable/resizable box
- **Box linking** - boxes reference hero cards, action cards, or poses by slug
- **Normalized coordinates** (0-1 range) for responsive scaling
- **Alignment/distribution tools**
- **Per-aspect-ratio backgrounds**

### Sub-Components
| Component            | Purpose                                           |
|----------------------|---------------------------------------------------|
| CardCanvas           | HTML5 canvas rendering with masking and layers    |
| LayerControls        | Position/scale inputs, copy/paste properties      |
| HeroPoseTab          | Pose editing with mask painting                   |
| PoseCanvas           | Canvas renderer for hero poses                    |
| HeroStatsTab         | HP, attack, defense, element affinities           |
| ActionStatsTab       | Cost, elements, targeting rules                   |
| HeroAudioTab         | Audio file management for voice lines             |
| PropertiesSidebar    | Properties panel for layout boxes                 |
| CardPreview          | Thumbnail card rendering for lists                |
| AssetPicker          | Image browser for selecting assets                |

---

## Backend API (Go - `editor/main.go`)

### Card/Action CRUD
| Method | Endpoint                          | Description                    |
|--------|-----------------------------------|--------------------------------|
| GET    | `/api/cards`                      | List all heroes                |
| GET    | `/api/card/{slug}`                | Get hero config JSON           |
| POST   | `/api/card/{slug}`                | Save hero config               |
| DELETE | `/api/card/{slug}`                | Delete hero                    |
| GET    | `/api/actions`                    | List all actions               |
| GET    | `/api/action/{slug}`              | Get action config JSON         |
| POST   | `/api/action/{slug}`              | Save action config             |
| DELETE | `/api/action/{slug}`              | Delete action                  |
| POST   | `/api/rename-card`                | Rename card (changes slug)     |

### Image Management
| Method | Endpoint                                | Description                        |
|--------|-----------------------------------------|------------------------------------|
| POST   | `/api/card-mask/{slug}`                 | Save mask images (base64 → WebP)   |
| POST   | `/api/action-mask/{slug}`               | Save action mask images            |
| GET    | `/api/card-char/{slug}/{layer}`         | Get character layer image          |
| POST   | `/api/card-char/{slug}/{layer}`         | Upload character layer image       |
| GET    | `/api/card-char-select/{slug}/{layer}`  | List available character images    |
| POST   | `/api/card-audio/{slug}`                | Upload hero audio files            |

### Layout & Assets
| Method | Endpoint                  | Description                    |
|--------|---------------------------|--------------------------------|
| GET    | `/api/game-layout`        | Get game layout JSON           |
| POST   | `/api/game-layout`        | Save game layout JSON          |
| GET    | `/api/assets/{category}`  | List assets (ui, characters, places) |

---

## Data Model

### HeroConfig
```
full_name, frame_image
char_bg_pos/scale, char_fg_pos/scale     ← sprite positioning
name_pos/scale, text_shadow_color/size   ← name rendering
tint                                      ← color overlay
hp_bar_pos/scale/current/max/hue         ← health bar
lore                                      ← flavor text
stats { max_hp, attack, defense, element_affinity { fire, ice, earth, wind, light, shadow } }
pose { char_fg_pos/scale, shadow_pos/scale }
audio { event_name → filename }
visible_layers { char-bg, char-fg, mask-bg, mask-fg, name, hp-bar }
```

### ActionConfig
```
full_name, frame_image
char_bg_pos/scale, char_fg_pos/scale
name_pos/scale, text_shadow_color/size, tint
description, cost, element[]
targeting { side: enemy|ally|any, scope: single|none, selection: manual|auto, allow_self, allow_dead }
```

### GameLayout
```
backgrounds: { aspect_ratio_index → image_url }
boxes: {
  box_id → {
    x, y, width, height, nx, ny (normalized 0-1)
    label, pivot, locked, screen_relative
    cardSlug, actionSlug, poseSlug, asset
  }
}
```

Standard box IDs: `hero1-3`, `enemy1-3`, `action1-5`, `mana`, `health`, `reroll`, `settings`, `clock`, `battery`

---

## File Organization

```
data/
├── hero/
│   └── {slug}/
│       ├── hero.json              ← hero config
│       ├── img/
│       │   ├── char-bg.webp       ← background sprite
│       │   ├── char-fg.webp       ← foreground sprite
│       │   ├── mask-bg.webp       ← background mask
│       │   ├── mask-fg.webp       ← foreground mask
│       │   ├── pose-char-fg.webp  ← pose sprite
│       │   ├── pose-shadow.webp   ← pose shadow
│       │   └── pose-mask-*.webp   ← pose masks
│       └── audio/
│           └── {event}.wav        ← voice lines
├── action/
│   └── {slug}/
│       ├── action.json
│       └── img/
│           ├── char-bg.webp
│           ├── char-fg.webp
│           ├── mask-bg.webp
│           └── mask-fg.webp
└── game-layout.json
```

---

## Layer Rendering Pipeline

Cards are rendered as composited layers on an HTML5 canvas:

1. **Background sprite** (`char-bg`) - positioned and scaled
2. **Background mask** (`mask-bg`) - alpha erases via `destination-out`
3. **Foreground sprite** (`char-fg`) - positioned and scaled
4. **Foreground mask** (`mask-fg`) - alpha erases via `destination-out`
5. **Name text** (`name`) - with shadow, positioned and scaled
6. **HP bar** (`hp-bar`) - heroes only, with hue rotation

Each layer can be toggled visible/invisible. Masks create transparency effects (e.g., fading edges, cutouts).

---

## Game Integration

The Godot game reads the same `data/` files:
- **LayoutManager.gd** - parses `game-layout.json`, positions UI elements using normalized coordinates and pivot points
- **ActionCard.gd** - reads action configs for combat mechanics
- The shared data directory means edits in the editor are immediately available to the game

---

## Running the Editor

The editor ships as compiled binaries (`editor.exe` / `editor.macos`). For development:
- Backend: `go run editor/main.go` (serves on `:8080`)
- Frontend: `cd editor/frontend && npm run dev` (Vite dev server on `:5173`, proxies API to `:8080`)

---

## State Management

No global state library. Each editor page manages its own state via React hooks:
- `useState` for config, selected layers, viewport
- `useRef` for canvas, undo/redo history stacks
- `useCallback` for performance optimization
- Auto-save triggers on config changes via `useEffect`
