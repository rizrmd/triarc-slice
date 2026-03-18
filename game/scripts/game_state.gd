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

# Hero selection
var selected_heroes: Array[String] = []
const MAX_HEROES: int = 3

# WebSocket reference (set by main.gd)
var ws: WebSocketPeer = null

# Hero definitions cache
var hero_defs: Dictionary = {}
var action_defs: Dictionary = {}

func _ready():
	_load_hero_definitions()
	_load_action_definitions()

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
		return false
	if selected_heroes.size() >= MAX_HEROES:
		return false
	selected_heroes.append(slug)
	return true

func is_hero_selected(slug: String) -> bool:
	return selected_heroes.has(slug)

func clear_selected_heroes():
	selected_heroes.clear()

func can_queue() -> bool:
	return selected_heroes.size() == MAX_HEROES

func send_json(data: Dictionary) -> void:
	if ws and ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.send_text(JSON.stringify(data))
