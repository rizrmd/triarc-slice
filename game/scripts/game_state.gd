extends Node
## GameState - Autoload for shared game data

# Player data
var player_id: String = ""
var display_name: String = ""
var id_token: String = ""

# Match data
var current_match_id: String = ""
var current_team: int = 0
var match_state: Dictionary = {}
var match_mode: String = "matchmaking" # "matchmaking" or "training"

# Hero selection
var selected_heroes: Array[String] = []
const MAX_HEROES: int = 3

# WebSocket reference (set by main.gd)
var ws: WebSocketPeer = null

# Hero definitions cache
var hero_defs: Dictionary = {}
var action_defs: Dictionary = {}

# Layout cache
var _layout_data: Dictionary = {}

func _ready():
	_load_game_layout()
	_load_hero_definitions()
	_load_action_definitions()
	_load_selected_heroes()

# --- Layout utilities ---

func _load_game_layout() -> void:
	var file = FileAccess.open("res://data/game-layout.json", FileAccess.READ)
	if not file:
		push_warning("game-layout.json not found")
		return
	var json = JSON.new()
	if json.parse(file.get_as_text()) != OK:
		push_warning("Failed to parse game-layout.json")
		return
	_layout_data = json.data

## Find the aspect-ratio key in `boxes` closest to the device's current aspect.
func find_best_aspect(boxes: Dictionary) -> String:
	var viewport_size = get_viewport().get_visible_rect().size
	var aspect = viewport_size.x / viewport_size.y
	var best_key = ""
	var best_diff = INF
	for key in boxes.keys():
		var parts = key.split("-")
		if parts.size() == 2:
			var bp_aspect = float(parts[0]) / float(parts[1])
			var diff = abs(aspect - bp_aspect)
			if diff < best_diff:
				best_diff = diff
				best_key = key
	return best_key

## Return the box dictionary for `scene_name` using the best aspect match.
func get_scene_boxes(scene_name: String) -> Dictionary:
	var scenes: Dictionary = _layout_data.get("scenes", {})
	var scene: Dictionary = scenes.get(scene_name, {})
	var boxes: Dictionary = scene.get("boxes", {})
	if boxes.is_empty():
		return {}
	var best = find_best_aspect(boxes)
	if best.is_empty():
		return {}
	return boxes[best]

## Reference viewports for each aspect preset (must match editor/frontend/src/lib/godot/viewport.ts)
const ASPECT_VIEWPORTS = {
	"9-16": Vector2(1080, 1920),
	"9-20": Vector2(1080, 2400),
	"3-4": Vector2(1536, 2048),
}

## Resolve a box to pixel top-left position & size.
## Editor stores x,y as top-left coords for the reference viewport.
## screen_relative boxes scale with the current viewport; others use fixed pixel coords.
func resolve_box(box: Dictionary, viewport_size: Vector2, aspect_key: String = "") -> Dictionary:
	var w: float = box.get("width", 0)
	var h: float = box.get("height", 0)
	var px: float
	var py: float
	if box.get("screen_relative", false):
		# x,y are top-left in the reference viewport — compute normalized center,
		# then convert to current viewport top-left
		var ref_vp: Vector2 = ASPECT_VIEWPORTS.get(aspect_key, Vector2(1080, 1920))
		var cx_norm = (float(box.get("x", 0)) + w / 2.0) / ref_vp.x
		var cy_norm = (float(box.get("y", 0)) + h / 2.0) / ref_vp.y
		px = cx_norm * viewport_size.x - w / 2.0
		py = cy_norm * viewport_size.y - h / 2.0
	else:
		# x,y are already top-left pixel coords
		px = float(box.get("x", 0))
		py = float(box.get("y", 0))
	return {"x": px, "y": py, "width": w, "height": h}

## Get background slug for a scene using best aspect match.
func get_scene_background(scene_name: String) -> String:
	var scenes: Dictionary = _layout_data.get("scenes", {})
	var scene: Dictionary = scenes.get(scene_name, {})
	var bgs: Dictionary = scene.get("backgrounds", {})
	if bgs.is_empty():
		return ""
	var best = find_best_aspect(bgs)
	if best.is_empty():
		return ""
	return bgs.get(best, "")

func _load_hero_definitions():
	# Hero stats from vg-server content.gleam
	hero_defs = {
		"iron-knight": {"name": "Iron Knight", "max_hp": 3500, "attack": 130, "defense": 180, "tint": Color("#db530a")},
		"arc-strider": {"name": "Arc Strider", "max_hp": 2700, "attack": 155, "defense": 115, "tint": Color("#4a90d9")},
		"necromancer": {"name": "Necromancer", "max_hp": 2300, "attack": 160, "defense": 100, "tint": Color("#5d3a8a")},
		"spellblade-empress": {"name": "Spellblade Empress", "max_hp": 3000, "attack": 145, "defense": 135, "tint": Color("#d4af37")},
		"earth-warden": {"name": "Earth Warden", "max_hp": 3600, "attack": 120, "defense": 170, "tint": Color("#8b7355")},
		"dawn-priest": {"name": "Dawn Priest", "max_hp": 2800, "attack": 100, "defense": 130, "tint": Color("#ffd700")},
		"flame-warlock": {"name": "Flame Warlock", "max_hp": 2400, "attack": 175, "defense": 90, "tint": Color("#ff4500")},
		"blood-alchemist": {"name": "Blood Alchemist", "max_hp": 2600, "attack": 140, "defense": 110, "tint": Color("#8b0000")},
		"gunslinger": {"name": "Gunslinger", "max_hp": 2500, "attack": 165, "defense": 95, "tint": Color("#696969")},
		"night-venom": {"name": "Night Venom", "max_hp": 2400, "attack": 170, "defense": 85, "tint": Color("#2f004f")},
		"princess-emberheart": {"name": "Princess Emberheart", "max_hp": 2900, "attack": 135, "defense": 120, "tint": Color("#ff6b6b")},
		"demon-empress": {"name": "Demon Empress", "max_hp": 3200, "attack": 150, "defense": 140, "tint": Color("#4a0404")},
		"tyrant-overlord": {"name": "Tyrant Overlord", "max_hp": 3800, "attack": 125, "defense": 185, "tint": Color("#2c2c2c")},
		"arcane-paladin": {"name": "Arcane Paladin", "max_hp": 3300, "attack": 115, "defense": 165, "tint": Color("#9370db")},
		"storm-ranger": {"name": "Storm Ranger", "max_hp": 2600, "attack": 160, "defense": 100, "tint": Color("#00ced1")},
		"wind-monk": {"name": "Wind Monk", "max_hp": 2800, "attack": 155, "defense": 105, "tint": Color("#98fb98")},
		"frost-queen": {"name": "Frost Queen", "max_hp": 2700, "attack": 150, "defense": 115, "tint": Color("#b0e0e6")},
	}

func _load_action_definitions():
	# Action definitions from vg-server content.gleam
	action_defs = {
		"fireball": {"name": "Fireball", "element": "fire", "cost": 3, "target": "enemy"},
		"inferno": {"name": "Inferno", "element": "fire", "cost": 5, "target": "enemy"},
		"flame_shield": {"name": "Flame Shield", "element": "fire", "cost": 3, "target": "ally"},
		"meteor": {"name": "Meteor", "element": "fire", "cost": 7, "target": "enemy"},
		"burn": {"name": "Burn", "element": "fire", "cost": 2, "target": "enemy"},
		"ice_shard": {"name": "Ice Shard", "element": "ice", "cost": 2, "target": "enemy"},
		"frost_armor": {"name": "Frost Armor", "element": "ice", "cost": 3, "target": "ally"},
		"blizzard": {"name": "Blizzard", "element": "ice", "cost": 6, "target": "enemy"},
		"frost_nova": {"name": "Frost Nova", "element": "ice", "cost": 4, "target": "enemy"},
		"deep_freeze": {"name": "Deep Freeze", "element": "ice", "cost": 5, "target": "enemy"},
		"rock_throw": {"name": "Rock Throw", "element": "earth", "cost": 2, "target": "enemy"},
		"earth_shield": {"name": "Earth Shield", "element": "earth", "cost": 4, "target": "ally"},
		"quake": {"name": "Quake", "element": "earth", "cost": 5, "target": "enemy"},
		"stone_skin": {"name": "Stone Skin", "element": "earth", "cost": 3, "target": "ally"},
		"wind_slash": {"name": "Wind Slash", "element": "wind", "cost": 2, "target": "enemy"},
		"gust": {"name": "Gust", "element": "wind", "cost": 3, "target": "ally"},
		"lightning_strike": {"name": "Lightning Strike", "element": "wind", "cost": 4, "target": "enemy"},
		"tailwind": {"name": "Tailwind", "element": "wind", "cost": 3, "target": "ally"},
		"heal": {"name": "Heal", "element": "light", "cost": 3, "target": "ally"},
		"smite": {"name": "Smite", "element": "light", "cost": 3, "target": "enemy"},
		"divine_shield": {"name": "Divine Shield", "element": "light", "cost": 4, "target": "ally"},
		"mass_heal": {"name": "Mass Heal", "element": "light", "cost": 6, "target": "self"},
		"bless": {"name": "Bless", "element": "light", "cost": 4, "target": "ally"},
		"judgment": {"name": "Judgment", "element": "light", "cost": 6, "target": "enemy"},
		"shadow_strike": {"name": "Shadow Strike", "element": "shadow", "cost": 3, "target": "enemy"},
		"dark_bolt": {"name": "Dark Bolt", "element": "shadow", "cost": 4, "target": "enemy"},
		"curse": {"name": "Curse", "element": "shadow", "cost": 5, "target": "enemy"},
		"life_drain": {"name": "Life Drain", "element": "shadow", "cost": 4, "target": "enemy"},
		"dark_ritual": {"name": "Dark Ritual", "element": "shadow", "cost": 5, "target": "self"},
		"attack": {"name": "Attack", "element": "earth", "cost": 0, "target": "enemy"},
		"defend": {"name": "Defend", "element": "earth", "cost": 1, "target": "self"},
		"cleanse": {"name": "Cleanse", "element": "light", "cost": 3, "target": "ally"},
		"focus": {"name": "Focus", "element": "light", "cost": 2, "target": "self"},
	}

func get_hero_def(slug: String) -> Dictionary:
	return hero_defs.get(slug, {})

func get_action_def(slug: String) -> Dictionary:
	return action_defs.get(slug, {})

func get_all_hero_slugs() -> Array:
	return hero_defs.keys()

func select_hero(slug: String) -> bool:
	if selected_heroes.has(slug):
		selected_heroes.erase(slug)
		_save_selected_heroes()
		return false
	if selected_heroes.size() >= MAX_HEROES:
		return false
	selected_heroes.append(slug)
	_save_selected_heroes()
	return true

func is_hero_selected(slug: String) -> bool:
	return selected_heroes.has(slug)

func clear_selected_heroes():
	selected_heroes.clear()
	_save_selected_heroes()

func can_queue() -> bool:
	return selected_heroes.size() == MAX_HEROES

func send_json(data: Dictionary) -> void:
	if ws and ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.send_text(JSON.stringify(data))

# --- Hero selection persistence ---

const _HEROES_PATH = "user://selected_heroes.json"

func _save_selected_heroes() -> void:
	var file = FileAccess.open(_HEROES_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"heroes": selected_heroes}))

func _load_selected_heroes() -> void:
	if not FileAccess.file_exists(_HEROES_PATH):
		return
	var file = FileAccess.open(_HEROES_PATH, FileAccess.READ)
	if not file:
		return
	var json = JSON.new()
	if json.parse(file.get_as_text()) != OK:
		return
	var data: Dictionary = json.data
	var heroes: Array = data.get("heroes", [])
	selected_heroes.clear()
	for slug in heroes:
		if hero_defs.has(slug):
			selected_heroes.append(slug)
