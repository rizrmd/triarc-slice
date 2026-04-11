extends Node
## GameState - Autoload for shared game data

signal gameplay_aspect_changed(aspect_key: String)
signal ws_message_received(msg: String)  # Forward WebSocket messages to gameplay

# Player data
var player_id: String = ""
var display_name: String = ""
var id_token: String = ""

# Match data
var current_match_id: String = ""
var current_team: int = 0
var match_state: Dictionary = {}
var match_mode: String = "matchmaking" # "matchmaking" or "training"
var return_to_hero_select_after_gameplay: bool = false
var previous_view_before_gameplay: String = ""  # Track view before gameplay to return correctly

# Hero selection
var selected_heroes: Array[String] = []
const MAX_HEROES: int = 3

# WebSocket reference (set by main.gd)
var ws: WebSocketPeer = null

# AnimapLoader instance passed from loading screen (for caching preloaded animaps)
var animap_loader: AnimapLoader = null

# Local mock mode for testing without server
var local_mock_mode: bool = false

# Scene caching — keep main scene alive while in gameplay
var _cached_main_scene: Node = null

# Hero definitions cache
var hero_defs: Dictionary = {}
var action_defs: Dictionary = {}

# Layout cache
var _layout_data: Dictionary = {}
var forced_gameplay_aspect_key: String = ""
var _last_window_size: Vector2i = Vector2i.ZERO
var _is_adjusting_window_size: bool = false
const _GAMEPLAY_ASPECT_PATH := "user://gameplay_aspect.json"
const _MIN_GAMEPLAY_WINDOW_HEIGHT := 640
const _DEFAULT_GAMEPLAY_ASPECT := "9-16"

func _ready():
	_apply_display_aspect_policy()
	# Clean up any stale animap loader from previous session
	if animap_loader != null:
		animap_loader = null
	_load_game_layout()
	_load_hero_definitions()
	_load_action_definitions()
	_load_selected_heroes()
	_load_saved_gameplay_aspect()
	_apply_gameplay_content_scale()
	apply_gameplay_window_aspect()

func _input(event: InputEvent):
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_F4:
				if event.shift_pressed:
					cycle_gameplay_aspect(-1)
				else:
					cycle_gameplay_aspect(1)
			KEY_F5:
				clear_forced_gameplay_aspect()

func _notification(what: int):
	if what == NOTIFICATION_WM_SIZE_CHANGED:
		enforce_gameplay_window_aspect_ratio()

func _apply_display_aspect_policy() -> void:
	var root := get_tree().root
	if root == null:
		return
	if OS.get_name() in ["Android", "iOS"]:
		root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_EXPAND
	else:
		root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP

# --- Layout utilities ---

func _load_game_layout() -> void:
	var scenes := {}
	for slug in ["startup", "login", "home", "gameplay", "postgame"]:
		var path := "res://data/scene/%s/layout.json" % slug
		var file = FileAccess.open(path, FileAccess.READ)
		if not file:
			continue
		var json = JSON.new()
		if json.parse(file.get_as_text()) == OK:
			scenes[slug] = json.data
		else:
			push_warning("Failed to parse %s" % path)
	_layout_data = {"scenes": scenes}

## Find the aspect-ratio key in `boxes` closest to the device's current aspect.
func find_best_aspect(boxes: Dictionary) -> String:
	if boxes.is_empty():
		return forced_gameplay_aspect_key if not forced_gameplay_aspect_key.is_empty() else _DEFAULT_GAMEPLAY_ASPECT
	if not _uses_aspect_map(boxes):
		return forced_gameplay_aspect_key if not forced_gameplay_aspect_key.is_empty() else _DEFAULT_GAMEPLAY_ASPECT
	if not forced_gameplay_aspect_key.is_empty() and boxes.has(forced_gameplay_aspect_key):
		return forced_gameplay_aspect_key
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
	if not _uses_aspect_map(boxes):
		return boxes
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

func get_available_gameplay_aspects() -> Array[String]:
	var keys: Array[String] = []
	for key in ASPECT_VIEWPORTS.keys():
		keys.append(str(key))
	keys.sort()
	return keys

func cycle_gameplay_aspect(step: int):
	var aspects = get_available_gameplay_aspects()
	if aspects.is_empty():
		return
	var current = forced_gameplay_aspect_key
	if current.is_empty():
		current = find_best_aspect(_layout_data.get("scenes", {}).get("gameplay", {}).get("boxes", {}))
	var index = aspects.find(current)
	if index == -1:
		index = 0
	forced_gameplay_aspect_key = aspects[posmod(index + step, aspects.size())]
	_save_gameplay_aspect()
	apply_gameplay_window_aspect()
	gameplay_aspect_changed.emit(forced_gameplay_aspect_key)

func clear_forced_gameplay_aspect():
	if forced_gameplay_aspect_key.is_empty():
		return
	forced_gameplay_aspect_key = ""
	_save_gameplay_aspect()
	apply_gameplay_window_aspect()
	gameplay_aspect_changed.emit(forced_gameplay_aspect_key)

func apply_gameplay_window_aspect():
	_apply_gameplay_content_scale()
	if OS.get_name() in ["Android", "iOS"]:
		return
	var window := get_window()
	if window == null:
		return
	var target_size := get_gameplay_window_size()
	if target_size == Vector2i.ZERO:
		return
	
	# Limit window size to available screen size (accounting for DPI scaling)
	var screen_size := DisplayServer.screen_get_size()
	if target_size.y > screen_size.y:
		var scale := float(screen_size.y) / float(target_size.y)
		target_size = Vector2i(int(target_size.x * scale), screen_size.y)
	if target_size.x > screen_size.x:
		var scale := float(screen_size.x) / float(target_size.x)
		target_size = Vector2i(screen_size.x, int(target_size.y * scale))
	
	window.min_size = get_gameplay_min_window_size()
	window.max_size = Vector2i.ZERO
	window.unresizable = false
	if window.size != target_size:
		_set_window_size(window, target_size)
	else:
		_last_window_size = window.size

func enforce_gameplay_window_aspect_ratio():
	if OS.get_name() in ["Android", "iOS"] or _is_adjusting_window_size:
		return
	var window := get_window()
	if window == null:
		return
	var ratio_size := get_gameplay_window_size()
	if ratio_size == Vector2i.ZERO:
		return
	var current_size := window.size
	if current_size.x <= 0 or current_size.y <= 0:
		return
	var target_ratio := float(ratio_size.x) / float(ratio_size.y)
	var adjusted_size := current_size
	adjusted_size.y = max(window.min_size.y, current_size.y)
	adjusted_size.x = max(window.min_size.x, int(round(float(adjusted_size.y) * target_ratio)))
	
	# Limit to available screen size
	var screen_size := DisplayServer.screen_get_size()
	if adjusted_size.y > screen_size.y:
		adjusted_size.y = screen_size.y
		adjusted_size.x = int(round(float(adjusted_size.y) * target_ratio))
	if adjusted_size.x > screen_size.x:
		adjusted_size.x = screen_size.x
		adjusted_size.y = int(round(float(adjusted_size.x) / target_ratio))
	
	if adjusted_size != current_size:
		_set_window_size(window, adjusted_size)
	else:
		_last_window_size = current_size

func get_gameplay_window_size() -> Vector2i:
	var aspect_key := forced_gameplay_aspect_key if not forced_gameplay_aspect_key.is_empty() else _DEFAULT_GAMEPLAY_ASPECT
	var ref_vp: Vector2 = ASPECT_VIEWPORTS.get(aspect_key, Vector2.ZERO)
	if ref_vp == Vector2.ZERO:
		return Vector2i.ZERO
	return Vector2i(int(ref_vp.x), int(ref_vp.y))

func get_gameplay_min_window_size() -> Vector2i:
	var target_size := get_gameplay_window_size()
	if target_size == Vector2i.ZERO:
		return Vector2i.ZERO
	var target_ratio := float(target_size.x) / float(target_size.y)
	var min_height: int = min(_MIN_GAMEPLAY_WINDOW_HEIGHT, target_size.y)
	var min_width: int = int(round(float(min_height) * target_ratio))
	return Vector2i(min_width, min_height)

func _apply_gameplay_content_scale() -> void:
	var root := get_tree().root
	if root == null:
		return
	var target_size := get_gameplay_window_size()
	if target_size == Vector2i.ZERO:
		return
	root.content_scale_size = target_size

func _set_window_size(window: Window, size: Vector2i):
	_is_adjusting_window_size = true
	window.size = size
	_last_window_size = size
	_is_adjusting_window_size = false

func _load_saved_gameplay_aspect():
	if not FileAccess.file_exists(_GAMEPLAY_ASPECT_PATH):
		return
	var file = FileAccess.open(_GAMEPLAY_ASPECT_PATH, FileAccess.READ)
	if not file:
		return
	var json = JSON.new()
	if json.parse(file.get_as_text()) != OK:
		return
	var saved_key = str(json.data.get("forced_gameplay_aspect_key", ""))
	if saved_key.is_empty():
		forced_gameplay_aspect_key = ""
		return
	if get_available_gameplay_aspects().has(saved_key):
		forced_gameplay_aspect_key = saved_key

func _save_gameplay_aspect():
	var file = FileAccess.open(_GAMEPLAY_ASPECT_PATH, FileAccess.WRITE)
	if not file:
		return
	file.store_string(JSON.stringify({
		"forced_gameplay_aspect_key": forced_gameplay_aspect_key
	}))

## Resolve a box to pixel top-left position & size.
## Editor stores x,y as top-left coords for the reference viewport.
## screen_relative boxes scale with the current viewport; others use fixed pixel coords.
func resolve_box(box: Dictionary, viewport_size: Vector2, aspect_key: String = "") -> Dictionary:
	var w: float = float(box.get("width", 0))
	var h: float = float(box.get("height", 0))
	if box.has("width_percent"):
		w = viewport_size.x * float(box.get("width_percent", 0.0)) / 100.0
	var reference_aspect := _get_card_like_reference_aspect(box)
	if reference_aspect > 0.0:
		h = w * reference_aspect
	elif box.has("height_percent"):
		h = viewport_size.y * float(box.get("height_percent", 0.0)) / 100.0
	var px: float = float(box.get("x", 0))
	var py: float = float(box.get("y", 0))
	if box.has("screen_anchor"):
		var anchor_point := _get_anchor_point(str(box.get("screen_anchor", "top-left")), viewport_size)
		var pivot_point := anchor_point + Vector2(
			float(box.get("anchor_offset_x", px)),
			float(box.get("anchor_offset_y", py))
		)
		var pivot_factor := _get_anchor_factor(str(box.get("pivot", "top-left")))
		px = pivot_point.x - w * pivot_factor.x
		py = pivot_point.y - h * pivot_factor.y
	elif box.get("screen_relative", false):
		var ref_vp: Vector2 = ASPECT_VIEWPORTS.get(aspect_key, Vector2(1080, 1920))
		var cx_norm = (float(box.get("x", 0)) + w / 2.0) / ref_vp.x
		var cy_norm = (float(box.get("y", 0)) + h / 2.0) / ref_vp.y
		px = cx_norm * viewport_size.x - w / 2.0
		py = cy_norm * viewport_size.y - h / 2.0
	return {"x": px, "y": py, "width": w, "height": h}

func _get_card_like_reference_aspect(box: Dictionary) -> float:
	if not (box.has("cardSlug") or box.has("actionSlug") or box.has("poseSlug")):
		return -1.0

	var width_percent := float(box.get("width_percent", 0.0))
	var height_percent := float(box.get("height_percent", 0.0))
	if width_percent > 0.0 and height_percent > 0.0:
		var ref_width := 1080.0 * width_percent / 100.0
		var ref_height := 1920.0 * height_percent / 100.0
		if ref_width > 0.0 and ref_height > 0.0:
			return ref_height / ref_width

	var width := float(box.get("width", 0.0))
	var height := float(box.get("height", 0.0))
	if width > 0.0 and height > 0.0:
		return height / width

	return -1.0

## Apply a layout box to a Control node — resolves position & size from the box data.
## Use this instead of manually setting position/size to avoid double-scaling bugs.
func apply_box(box: Dictionary, control: Control, viewport_size: Vector2, aspect_key: String = "") -> void:
	var r := resolve_box(box, viewport_size, aspect_key)
	control.position = Vector2(r["x"], r["y"])
	control.size = Vector2(r["width"], r["height"])

func _uses_aspect_map(boxes: Dictionary) -> bool:
	for key in boxes.keys():
		if ASPECT_VIEWPORTS.has(str(key)):
			return true
	return false

func _get_anchor_factor(anchor: String) -> Vector2:
	match anchor:
		"top-center":
			return Vector2(0.5, 0.0)
		"top-right":
			return Vector2(1.0, 0.0)
		"center-left":
			return Vector2(0.0, 0.5)
		"center":
			return Vector2(0.5, 0.5)
		"center-right":
			return Vector2(1.0, 0.5)
		"bottom-left":
			return Vector2(0.0, 1.0)
		"bottom-center":
			return Vector2(0.5, 1.0)
		"bottom-right":
			return Vector2(1.0, 1.0)
		_:
			return Vector2.ZERO

func _get_anchor_point(anchor: String, viewport_size: Vector2) -> Vector2:
	var factor := _get_anchor_factor(anchor)
	return Vector2(viewport_size.x * factor.x, viewport_size.y * factor.y)

## Get background slug for a scene using best aspect match.
func get_scene_background(scene_name: String) -> String:
	var scenes: Dictionary = _layout_data.get("scenes", {})
	var scene: Dictionary = scenes.get(scene_name, {})
	if scene.has("background"):
		return str(scene.get("background", ""))
	var bgs: Dictionary = scene.get("backgrounds", {})
	if bgs.is_empty():
		return ""
	return str(bgs.get(_DEFAULT_GAMEPLAY_ASPECT, bgs.get("9-16", "")))

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
	# Action definitions — slugs match vg-server content.gleam and editor data/action/ dirs
	action_defs = {
		"fireball": {"name": "Fireball", "element": "fire", "cost": 3, "target": "enemy"},
		"flame-lance": {"name": "Flame Lance", "element": "fire", "cost": 3, "target": "enemy"},
		"frostbolt": {"name": "Frostbolt", "element": "ice", "cost": 2, "target": "enemy"},
		"blizzard": {"name": "Blizzard", "element": "ice", "cost": 4, "target": "enemy"},
		"ice-nova": {"name": "Ice Nova", "element": "ice", "cost": 3, "target": "enemy"},
		"fortify": {"name": "Fortify", "element": "earth", "cost": 3, "target": "ally"},
		"shield-wall": {"name": "Shield Wall", "element": "earth", "cost": 3, "target": "ally"},
		"stand-firm": {"name": "Stand Firm", "element": "earth", "cost": 2, "target": "self"},
		"poison-strike": {"name": "Poison Strike", "element": "earth", "cost": 3, "target": "enemy"},
		"toxic-coating": {"name": "Toxic Coating", "element": "earth", "cost": 2, "target": "ally"},
		"chain-spark": {"name": "Chain Spark", "element": "wind", "cost": 3, "target": "enemy"},
		"smoke-bomb": {"name": "Smoke Bomb", "element": "wind", "cost": 3, "target": "enemy"},
		"time-slip": {"name": "Time Slip", "element": "wind", "cost": 4, "target": "ally"},
		"arcane-blast": {"name": "Arcane Blast", "element": "light", "cost": 4, "target": "enemy"},
		"holy": {"name": "Holy", "element": "light", "cost": 3, "target": "enemy"},
		"mana-weave": {"name": "Mana Weave", "element": "light", "cost": 2, "target": "ally"},
		"mirror-shield": {"name": "Mirror Shield", "element": "light", "cost": 4, "target": "ally"},
		"rally-cry": {"name": "Rally Cry", "element": "light", "cost": 3, "target": "ally"},
		"cursed-dart": {"name": "Cursed Dart", "element": "shadow", "cost": 2, "target": "enemy"},
		"leech-blade": {"name": "Leech Blade", "element": "shadow", "cost": 3, "target": "enemy"},
		"shadowstep": {"name": "Shadowstep", "element": "shadow", "cost": 3, "target": "enemy"},
		"garrote": {"name": "Garrote", "element": "shadow", "cost": 3, "target": "enemy"},
		"shiv": {"name": "Shiv", "element": "earth", "cost": 1, "target": "enemy"},
		"charge": {"name": "Charge", "element": "earth", "cost": 3, "target": "enemy"},
		"cleave": {"name": "Cleave", "element": "earth", "cost": 3, "target": "enemy"},
		"execute": {"name": "Execute", "element": "earth", "cost": 4, "target": "enemy"},
		"riposte": {"name": "Riposte", "element": "earth", "cost": 2, "target": "self"},
		"intercept": {"name": "Intercept", "element": "earth", "cost": 3, "target": "ally"},
		"taunt": {"name": "Taunt", "element": "earth", "cost": 2, "target": "self"},
		"mark-target": {"name": "Mark Target", "element": "earth", "cost": 2, "target": "enemy"},
		"chain": {"name": "Chain", "element": "earth", "cost": 2, "target": "enemy"},
	}

func get_hero_def(slug: String) -> Dictionary:
	return hero_defs.get(slug, {})

func get_action_def(slug: String) -> Dictionary:
	return action_defs.get(slug, {})

func get_all_hero_slugs() -> Array:
	return hero_defs.keys()

func select_hero(slug: String) -> Dictionary:
	if selected_heroes.has(slug):
		selected_heroes.erase(slug)
		_save_selected_heroes()
		return {"action": "removed"}
	if match_mode == "training" and selected_heroes.size() >= MAX_HEROES:
		var replaced_slug := selected_heroes[0]
		selected_heroes.remove_at(0)
		selected_heroes.append(slug)
		_save_selected_heroes()
		return {
			"action": "replaced",
			"replaced_slug": replaced_slug,
		}
	if selected_heroes.size() >= MAX_HEROES:
		return {"action": "full"}
	selected_heroes.append(slug)
	_save_selected_heroes()
	return {"action": "added"}

func is_hero_selected(slug: String) -> bool:
	return selected_heroes.has(slug)

func clear_selected_heroes():
	selected_heroes.clear()
	_save_selected_heroes()

func can_queue() -> bool:
	return selected_heroes.size() == MAX_HEROES

func should_return_to_hero_select() -> bool:
	if not return_to_hero_select_after_gameplay:
		return false
	return_to_hero_select_after_gameplay = false
	return true

## Hide and pause the current main scene, then load gameplay on top.
func cache_main_and_enter_gameplay() -> void:
	var root := get_tree().root
	_cached_main_scene = get_tree().current_scene
	_cached_main_scene.process_mode = Node.PROCESS_MODE_DISABLED
	_cached_main_scene.visible = false

	var gameplay = load("res://scenes/gameplay.tscn").instantiate()
	root.add_child(gameplay)
	get_tree().current_scene = gameplay

## Remove gameplay and restore the cached main scene (or fall back to full reload).
func return_to_main() -> void:
	if _cached_main_scene:
		var gameplay = get_tree().current_scene
		if gameplay:
			gameplay.queue_free()

		_cached_main_scene.process_mode = Node.PROCESS_MODE_INHERIT
		_cached_main_scene.visible = true
		get_tree().current_scene = _cached_main_scene

		if _cached_main_scene.has_method("resume_from_gameplay"):
			_cached_main_scene.resume_from_gameplay()

		_cached_main_scene = null
	else:
		get_tree().change_scene_to_file("res://scenes/main.tscn")

func send_json(data: Dictionary) -> void:
	if local_mock_mode:
		# Handle mock mode locally
		_handle_mock_message(data)
		return
	if ws and ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.send_text(JSON.stringify(data))

func _handle_mock_message(data: Dictionary) -> void:
	# Route mock messages to appropriate handlers
	var msg_type = data.get("type", "")
	match msg_type:
		"cast_action":
			_handle_mock_cast_action(data)
		"reroll_hand":
			_handle_mock_reroll_hand(data)
		"get_match_state":
			_handle_mock_get_state(data)
		"leave_match":
			_handle_mock_leave_match(data)

func _handle_mock_cast_action(data: Dictionary) -> void:
	# Forward to gameplay node for local resolution
	var gameplay = get_tree().get_first_node_in_group("gameplay")
	if gameplay and gameplay.has_method("_on_mock_cast_action"):
		gameplay._on_mock_cast_action(data)

func _handle_mock_reroll_hand(data: Dictionary) -> void:
	var gameplay = get_tree().get_first_node_in_group("gameplay")
	if gameplay and gameplay.has_method("_on_mock_reroll_hand"):
		gameplay._on_mock_reroll_hand(data)

func _handle_mock_get_state(data: Dictionary) -> void:
	# In mock mode, gameplay manages its own state
	pass

func _handle_mock_leave_match(data: Dictionary) -> void:
	var gameplay = get_tree().get_first_node_in_group("gameplay")
	if gameplay and gameplay.has_method("_on_back_pressed"):
		gameplay._on_back_pressed()

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
