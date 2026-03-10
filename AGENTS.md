# Triarc Slice - Game Architecture Documentation

## Overview

Triarc Slice is a PvP card battler game with the following architecture:
- **Frontend**: Godot 4.x game client
- **Backend**: Gleam + OTP game server
- **Data**: Hero definitions stored as JSON files

## Repository Structure

```
triarc-slice/
├── game/                    # Godot game client
│   ├── scenes/             # Godot scene files (.tscn)
│   ├── scripts/            # GDScript files (.gd)
│   ├── data/               # Game data (heroes, layouts)
│   ├── shaders/            # GLSL shaders
│   └── project.godot       # Godot project configuration
├── data/                   # Hero definitions (shared)
│   └── hero/              # Each hero has its own folder
│       ├── {hero-name}/
│       │   ├── hero.json       # Hero stats, lore, positioning
│       │   └── img/            # Hero images (background, foreground, mask)
│       └── ...
└── editor/                 # Editor tools (if any)
```

## Godot Client Architecture

### Main Scripts

#### 1. Main.gd
- **Purpose**: Main game controller, handles UI and game state
- **Key responsibilities**:
  - Connect to WebSocket server
  - Player registration and authentication
  - Matchmaking queue management
  - Match state display and interaction
  - Card casting and targeting
  - Hero selection and display

#### 2. GameServerClient.gd
- **Purpose**: WebSocket client for server communication
- **Key responsibilities**:
  - WebSocket connection management
  - Message sending/receiving
  - Session persistence (player_id)
  - Signal-based event handling

#### 3. Card.gd
- **Purpose**: Individual hero card display
- **Key responsibilities**:
  - Load hero data from JSON
  - Display hero portrait, name, HP
  - Handle card interactions (click, double-click)

#### 4. LayoutManager.gd
- **Purpose**: Dynamic UI layout system
- **Key responsibilities**:
  - Position cards based on viewport size
  - Responsive layout for different screen sizes
  - Extra box rendering for game elements

### Game Flow

1. **Startup**:
   - Load hero definitions from `data/hero/`
   - Initialize UI components
   - Player clicks "Connect" to establish WebSocket connection

2. **Connection**:
   - Client connects to WebSocket server
   - Server assigns player_id
   - Connection saved to session

3. **Registration**:
   - Player enters display name
   - Client sends `upsert_profile` message
   - Profile stored on server

4. **Matchmaking**:
   - Player selects 3 heroes
   - Client sends `queue_matchmaking` message
   - Server pairs players automatically
   - Client receives `match_found` event

5. **Match Gameplay**:
   - Server assigns teams and spawns heroes
   - Players see their hand of 5 action cards
   - Energy regenerates at 1/sec
   - Server pushes `state_update` events
   - Players can:
     - Select a caster hero (`select_caster`)
     - Cast action cards on valid targets (`cast_action`)
     - Reroll hand (`reroll_hand`, costs 2 energy)

### UI Components

- **Connect Button**: Connect/disconnect from WebSocket server
- **Server URL Input**: WebSocket server address
- **Lobby Panel**: Registration, matchmaking controls
- **Hero Selectors**: Dropdowns for selecting 3 heroes
- **Caster Buttons**: Select which hero will cast
- **Action Buttons**: 5 hand slots with action info
- **Target Buttons**: Ally/Enemy selection for targeting
- **Status Labels**: Energy, match status, queue status

## Server API (WebSocket)

### Connection

```gdscript
# Connect to server
_client.configure("ws://127.0.0.1:8080")
_client.connect_to_server()

# Wait for connection
await _client.connected_to_server
```

### Client → Server Messages

| Message | Fields | Description |
|---------|--------|-------------|
| `upsert_profile` | `display_name` | Register/update player profile |
| `queue_matchmaking` | `hero_slug_1, hero_slug_2, hero_slug_3` | Join matchmaking queue |
| `leave_matchmaking` | - | Leave queue |
| `select_caster` | `match_id, slot_index` | Set active caster |
| `cast_action` | `match_id, hand_slot_index, target_slot` | Cast a card |
| `reroll_hand` | `match_id` | Replace hand (costs 2 energy) |
| `get_state` | `match_id` | Request current match state |

### Server → Client Messages

| Message | Fields | Description |
|---------|--------|-------------|
| `connected` | `player_id` | Connection established |
| `state_update` | `match, team_state, hand, heroes...` | Full match state |
| `match_found` | `match_id, team` | Matched with opponent |
| `event` | `event_type, data` | Game event (cast_started, damage_dealt, etc.) |
| `error` | `code, message` | Error response |

### Message Format

**Client → Server:**
```json
{"type": "upsert_profile", "display_name": "Player1"}
{"type": "queue_matchmaking", "hero_slug_1": "iron-knight", "hero_slug_2": "dawn-priest", "hero_slug_3": "arc-strider"}
{"type": "select_caster", "match_id": "123", "slot_index": 1}
{"type": "cast_action", "match_id": "123", "hand_slot_index": 1, "target_slot": 2}
{"type": "reroll_hand", "match_id": "123"}
```

**Server → Client:**
```json
{"type": "connected", "player_id": "uuid123"}
{"type": "match_found", "match_id": "match456", "team": 1}
{"type": "state_update", "data": {"match": {...}, "heroes": [...], "hand": [...]}}
{"type": "event", "event_type": "cast_started", "data": {"caster_slot": 1, "action_slug": "fireball"}}
{"type": "error", "code": "NOT_ENOUGH_ENERGY", "message": "Need 3 energy"}
```

## Client Signals

The `GameServerClient` emits these signals:

- `connected_to_server(player_id: String)` - Successfully connected
- `disconnected_from_server()` - Connection lost
- `match_state_updated(state: Dictionary)` - Match state changed
- `match_found(match_id: String, team: int)` - Entered a match
- `event_received(event_type: String, data: Dictionary)` - Game event
- `error_received(code: String, message: String)` - Error occurred

## Hero Data Format

Each hero has a `hero.json` file:

```json
{
  "full_name": "Display Name",
  "lore": "Hero description...",
  "stats": {
    "max_hp": 1000,
    "attack": 100,
    "defense": 50,
    "element_affinity": {
      "fire": 10,
      "ice": 0,
      "earth": 5,
      "wind": -5,
      "light": 0,
      "shadow": 0
    }
  },
  "char_bg_pos": {"x": 0, "y": 0},
  "char_fg_pos": {"x": 0, "y": 0},
  "char_bg_scale": 100,
  "char_fg_scale": 100,
  "name_pos": {"x": 0, "y": 0},
  "name_scale": 50,
  "tint": "#ffffff"
}
```

## Key Game Mechanics

### Elements
- **Fire**: Strong vs Ice, weak vs Water/Earth
- **Ice**: Strong vs Wind, weak vs Fire
- **Earth**: Strong vs Wind, weak vs Fire
- **Wind**: Strong vs Earth, weak vs Ice
- **Light**: Strong vs Shadow
- **Shadow**: Strong vs Light

### Energy System
- Max energy: 10
- Start energy: 10
- Regen: 1 energy per second
- Reroll cost: 2 energy

### Combat
- 2 teams per match
- 3 heroes per team
- 5 visible hand cards
- Actions have:
  - Energy cost
  - Casting time (ms)
  - Target type (ally/enemy/self)
  - Element
  - Effect (damage, heal, shield, status)

## Development Workflow

1. **Modify Hero Data**: Edit JSON files in `data/hero/`
2. **Game Logic**: Modify GDScript in `game/scripts/`
3. **Server Logic**: Modify Gleam files in `vg_server/src/`
4. **Test**: Run both client and server locally

## Server Setup

```bash
cd vg_server
export PATH="$HOME/.local/bin:$PATH"
gleam run
# Server starts on port 8080
```

## Client Setup

1. Open Godot project: `game/project.godot`
2. Run with F5 or Play button
3. Click "Connect" to connect to server
4. Register profile, then queue for matchmaking

## Debugging Tips

- Use Godot's remote debugger for client issues
- Check WebSocket connection status in Network tab
- Enable verbose logging in GameServerClient
- Verify hero JSON files are valid
- Check server logs for message handling
- Use `ws://` for local, `wss://` for production
