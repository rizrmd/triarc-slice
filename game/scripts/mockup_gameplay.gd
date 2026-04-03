extends Control
## MockupGameplay - Testing scene untuk mockup mode (F12)
## Scene ini TERPISAH dari gameplay normal untuk menghindari bug

@onready var heroes_container: Control = $HeroesContainer
@onready var hand_container: Control = $HandContainer
@onready var energy_bar: Control = $UIOverlay/EnergyBar
@onready var current_label: Label = $UIOverlay/EnergyBar/CurrentLabel
@onready var max_label: Label = $UIOverlay/EnergyBar/MaxLabel
@onready var energy_full: TextureRect = $UIOverlay/EnergyBar/EnergyFull
@onready var reroll_button: TextureButton = $UIOverlay/RerollButton
@onready var back_button: Button = $UIOverlay/BackButton
@onready var fade_rect: ColorRect = $UIOverlay/FadeRect
@onready var status_label: Label = $UIOverlay/StatusLabel
@onready var time_animap: AnimapPlayer = $TimeAnimap
@onready var info_animap: AnimapPlayer = $InfoAnimap
@onready var reroll_count_label: Label = $UIOverlay/RerollButton/RerollCountLabel

# Time elapsed
var _time_elapsed_sec: float = 0.0
var _server_match_started_at_ms: int = 0

const HERO_SCENE = preload("res://scenes/hero.tscn")
const ACTION_CARD_SCENE = preload("res://scenes/action_card.tscn")

# Mock data untuk testing - MENYESUAIKAN GAMBAR REFERENSI
# Menggunakan slot 0,1,2 seperti gameplay normal
var mock_ally_heroes: Array[Dictionary] = [
	{"slug": "night-venom", "hp": 2500, "max_hp": 2500, "slot": 0},
	{"slug": "arcane-paladin", "hp": 3200, "max_hp": 3200, "slot": 1},
	{"slug": "tyrant-overlord", "hp": 3800, "max_hp": 3800, "slot": 2},
]

var mock_enemy_heroes: Array[Dictionary] = [
	{"slug": "earth-warden", "hp": 3600, "max_hp": 3600, "slot": 0},
	{"slug": "dawn-priest", "hp": 2800, "max_hp": 2800, "slot": 1},
	{"slug": "flame-warlock", "hp": 2314, "max_hp": 2400, "slot": 2},
]

var mock_hand: Array[Dictionary] = [
	{"action": "poison-strike", "cost": 3, "slot": 0},  # Manual target testing
	{"action": "flame-lance", "cost": 3, "slot": 1},
	{"action": "stand-firm", "cost": 2, "slot": 2},
	{"action": "shadowstep", "cost": 3, "slot": 3},
	{"action": "taunt", "cost": 2, "slot": 4},
]

var current_energy: int = 10
var max_energy: int = 10
var _layout_boxes: Dictionary = {}
var _layout_aspect_key: String = "9-16"

# Hero dictionaries (separate seperti gameplay.gd)
var my_heroes: Dictionary = {}  # slot -> Hero node
var enemy_heroes: Dictionary = {}  # slot -> Hero node
var hand_cards: Array = []

# Energy regeneration
var _energy_regen_timer: float = 0.0
var _energy_regen_interval: float = 1.0  # Regenerasi 1 energy per detik
var _dot_tick_timer: float = 0.0  # Timer untuk DoT tick

# Target selection state (for manual targeting cards like Poison Strike)
var _selecting_target: bool = false
var _pending_card_data: Dictionary = {}  # {card, caster_hero, action_slug, slot_index, card_index}
var _target_selection_label: Label = null

# Status effects tracking
var _active_dot_effects: Dictionary = {}  # enemy_instance_id -> {damage_per_tick, ticks_remaining, tick_timer}
const DOT_TICK_INTERVAL: float = 1.0  # DoT damage setiap 1 detik
const DOT_MAX_STACKS: int = 3  # Max 3 stack DoT

func _ready():
	print("[MockupGameplay] Mockup mode activated - scene terpisah dari gameplay normal")
	
	# Add to gameplay group agar card drag & drop bisa menemukan node ini
	add_to_group("gameplay")
	
	# Setup UI
	reroll_button.pressed.connect(_on_reroll_pressed)
	back_button.pressed.connect(_on_back_pressed)
	
	# Setup animap players
	_setup_time_animap()
	_setup_info_animap()
	
	# Load layout
	_layout_boxes = GameState.get_scene_boxes("gameplay")
	_layout_aspect_key = GameState.forced_gameplay_aspect_key if not GameState.forced_gameplay_aspect_key.is_empty() else "9-16"
	
	print("[MockupGameplay] Layout boxes loaded: ", _layout_boxes.size(), " keys")
	print("[MockupGameplay] Layout aspect key: ", _layout_aspect_key)
	if _layout_boxes.size() > 0:
		print("[MockupGameplay] Available keys: ", _layout_boxes.keys())
	else:
		print("[MockupGameplay] ERROR: No layout boxes found! Check game-layout.json")
	
	# Setup background
	_apply_background()
	
	# Setup initial positions
	_setup_ui_positions()
	
	# Spawn mock heroes - PERSIS seperti gameplay.gd
	_spawn_mock_heroes()
	
	# Spawn mock hand
	_spawn_mock_hand()
	
	# Play entrance animation
	_play_entrance_animation()
	
	# Update status
	_update_status("MOCKUP MODE - Testing Only")
	
	# Set time to match reference (2:05)
	_time_elapsed_sec = 125.0  # 2 menit 5 detik
	_update_time_text()

func _process(delta: float):
	_time_elapsed_sec += delta
	_update_time_text()
	
	# Energy regeneration
	if current_energy < max_energy:
		_energy_regen_timer += delta
		if _energy_regen_timer >= _energy_regen_interval:
			_energy_regen_timer = 0.0
			current_energy = min(current_energy + 1, max_energy)
			_update_energy_display()
	
	# Process DoT ticks
	_process_dot_ticks(delta)

func _setup_time_animap():
	if not time_animap:
		return
	time_animap.fit_mode = "contain"
	time_animap.load_animap("time")
	_build_time_labels()

func _build_time_labels():
	# Hide original text layer if exists
	for layer in time_animap.animap_data.get("layers", []):
		if layer.get("type", "") == "text":
			var orig: Control = time_animap._layer_nodes.get(layer.get("id", ""))
			if orig:
				orig.visible = false
			break
	
	# Use same font as gameplay
	var font: Font = AnimapPlayer.VOLKHOV_FONT
	var font_size := 96
	var color := Color.WHITE
	var text_layer: Dictionary = {}
	for layer in time_animap.animap_data.get("layers", []):
		if layer.get("type", "") == "text":
			text_layer = layer
			break
	
	var lx := float(text_layer.get("x", 0))
	var ly := float(text_layer.get("y", 0))
	var lw := float(text_layer.get("width", 480))
	var lh := float(text_layer.get("height", 160))
	var lscale := float(text_layer.get("scale", 1.0))
	
	# Measure colon width
	var colon_w := font.get_string_size(":", HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	var center_x := lw / 2.0
	var half_colon := colon_w / 2.0
	
	# Create colon label (fixed center)
	var colon_label = Label.new()
	colon_label.name = "ColonLabel"
	colon_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	colon_label.clip_contents = false
	colon_label.add_theme_font_override("font", font)
	colon_label.add_theme_font_size_override("font_size", font_size)
	colon_label.add_theme_color_override("font_color", color)
	colon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	colon_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	colon_label.text = ":"
	colon_label.position = Vector2(lx + center_x - half_colon - lw * 0.05, ly - lh * 0.06)
	colon_label.size = Vector2(colon_w, lh)
	colon_label.scale = Vector2(lscale, lscale)
	time_animap.layer_root.add_child(colon_label)
	
	# Minutes label (right-aligned, left of colon)
	var minutes_label = Label.new()
	minutes_label.name = "MinutesLabel"
	minutes_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	minutes_label.add_theme_font_override("font", font)
	minutes_label.add_theme_font_size_override("font_size", font_size)
	minutes_label.add_theme_color_override("font_color", color)
	minutes_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	minutes_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	minutes_label.text = "02"
	minutes_label.position = Vector2(lx - lw * 0.02, ly)
	minutes_label.size = Vector2(center_x - half_colon, lh)
	minutes_label.scale = Vector2(lscale, lscale)
	time_animap.layer_root.add_child(minutes_label)
	
	# Seconds label (left-aligned, right of colon)
	var seconds_label = Label.new()
	seconds_label.name = "SecondsLabel"
	seconds_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	seconds_label.add_theme_font_override("font", font)
	seconds_label.add_theme_font_size_override("font_size", font_size)
	seconds_label.add_theme_color_override("font_color", color)
	seconds_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	seconds_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	seconds_label.text = "05"
	seconds_label.position = Vector2(lx + center_x + half_colon - lw * 0.03, ly)
	seconds_label.size = Vector2(center_x - half_colon, lh)
	seconds_label.scale = Vector2(lscale, lscale)
	time_animap.layer_root.add_child(seconds_label)

func _update_time_text():
	var minutes_label = time_animap.get_node_or_null("layer_root/MinutesLabel")
	var seconds_label = time_animap.get_node_or_null("layer_root/SecondsLabel")
	if not minutes_label or not seconds_label:
		return
	var total_sec := int(_time_elapsed_sec)
	var minutes := total_sec / 60
	var seconds := total_sec % 60
	minutes_label.text = "%02d" % minutes
	seconds_label.text = "%02d" % seconds

func _setup_info_animap():
	if not info_animap:
		return
	info_animap.fit_mode = "contain"
	var info_box: Dictionary = _layout_boxes.get("info", {})
	var animap_slug := String(info_box.get("animapSlug", "info"))
	info_animap.load_animap(animap_slug)

func _setup_ui_positions():
	var vp_size = get_viewport().get_visible_rect().size
	
	# Energy bar
	if _layout_boxes.has("energy"):
		var r = GameState.resolve_box(_layout_boxes["energy"], vp_size, _layout_aspect_key)
		energy_bar.position = Vector2(r["x"], r["y"])
	
	# Reroll button
	if _layout_boxes.has("reroll"):
		var r = GameState.resolve_box(_layout_boxes["reroll"], vp_size, _layout_aspect_key)
		reroll_button.position = Vector2(r["x"], r["y"])
	
	# Back button (Leave)
	if _layout_boxes.has("settings"):
		var r = GameState.resolve_box(_layout_boxes["settings"], vp_size, _layout_aspect_key)
		back_button.position = Vector2(r["x"], r["y"])
		back_button.size = Vector2(r["width"], r["height"])
	
	# Time animap
	if _layout_boxes.has("time_elapsed") and time_animap:
		var r = GameState.resolve_box(_layout_boxes["time_elapsed"], vp_size, _layout_aspect_key)
		time_animap.position = Vector2(r["x"], r["y"])
		time_animap.size = Vector2(r["width"], r["height"])
	
	# Info animap
	if _layout_boxes.has("info") and info_animap:
		var r = GameState.resolve_box(_layout_boxes["info"], vp_size, _layout_aspect_key)
		info_animap.position = Vector2(r["x"], r["y"])
		info_animap.size = Vector2(r["width"], r["height"])
	
	# Set initial modulate.a = 0 for entrance animation
	energy_bar.modulate.a = 0.0
	reroll_button.modulate.a = 0.0
	back_button.modulate.a = 0.0
	if time_animap:
		time_animap.modulate.a = 0.0
	if info_animap:
		info_animap.modulate.a = 0.0
	
	# Update energy display
	_update_energy_display()

func _spawn_mock_heroes():
	# Spawn enemy heroes (di atas) - menggunakan positions yang benar
	var vp_size = get_viewport().get_visible_rect().size
	var scale_x = vp_size.x / 1080.0
	var scale_y = vp_size.y / 1920.0
	
	print("[MockupGameplay] Viewport: ", vp_size, " Scale: ", scale_x, "x", scale_y)
	
	# Enemy positions (dari game-layout.json 9-16 aspect)
	# enemy1: x=0, y=1650 (energy bar position - WRONG!)
	# Kita perlu cek layout boxes yang benar
	
	for hero_data in mock_enemy_heroes:
		var slot = hero_data["slot"]
		var key = "enemy%d" % (slot + 1)  # Layout menggunakan 1-indexed!
		if not _layout_boxes.has(key):
			print("[MockupGameplay] Warning: layout box not found for ", key)
			continue
		
		var hero = HERO_SCENE.instantiate()
		heroes_container.add_child(hero)
		enemy_heroes[slot] = hero
		
		var box = _layout_boxes[key]
		
		# PERSIS seperti gameplay.gd - gunakan box size langsung
		var r = GameState.resolve_box(box, vp_size, _layout_aspect_key)
		
		hero.position = Vector2(r["x"], r["y"])
		hero.size = Vector2(r["width"], r["height"])
		
		# Setup dulu baru apply layout
		var setup_data = {
			"hero_instance_id": "mock_enemy_%d" % slot,
			"hero_slug": hero_data["slug"],
			"team": 2,
			"slot_index": slot,
			"hp_current": hero_data["hp"],
			"hp_max": hero_data["max_hp"],
			"alive": true
		}
		hero.setup(setup_data, true)
		
		# Baru apply layout size setelah setup
		hero.apply_layout_size(Vector2(r["width"], r["height"]))
		
		hero.modulate.a = 0.0
		hero.scale = Vector2(0.5, 0.5)  # Scale down manual agar tidak terlalu besar
	
	# Ally heroes
	for hero_data in mock_ally_heroes:
		var slot = hero_data["slot"]
		var key = "hero%d" % (slot + 1)  # Layout menggunakan 1-indexed!
		if not _layout_boxes.has(key):
			print("[MockupGameplay] Warning: layout box not found for ", key)
			continue
		
		var hero = HERO_SCENE.instantiate()
		heroes_container.add_child(hero)
		my_heroes[slot] = hero
		
		var box = _layout_boxes[key]
		
		var r = GameState.resolve_box(box, vp_size, _layout_aspect_key)
		
		hero.position = Vector2(r["x"], r["y"])
		hero.size = Vector2(r["width"], r["height"])
		
		# Setup dulu baru apply layout
		var setup_data = {
			"hero_instance_id": "mock_ally_%d" % slot,
			"hero_slug": hero_data["slug"],
			"team": 1,
			"slot_index": slot,
			"hp_current": hero_data["hp"],
			"hp_max": hero_data["max_hp"],
			"alive": true
		}
		hero.setup(setup_data, false)
		
		# Baru apply layout size setelah setup
		hero.apply_layout_size(Vector2(r["width"], r["height"]))
		
		hero.modulate.a = 0.0
		hero.scale = Vector2(0.5, 0.5)  # Scale down manual agar tidak terlalu besar
	
	print("[MockupGameplay] Spawned ", enemy_heroes.size(), " enemy heroes and ", my_heroes.size(), " ally heroes")

func _resolve_hero_box(box: Dictionary, viewport_size: Vector2, aspect_key: String) -> Dictionary:
	# Tidak digunakan lagi - menggunakan GameState.resolve_box langsung seperti gameplay.gd
	return GameState.resolve_box(box, viewport_size, aspect_key)

func _spawn_mock_hand():
	var vp_size = get_viewport().get_visible_rect().size
	
	# Clear hand_cards array
	hand_cards.clear()
	
	for i in range(mock_hand.size()):
		var key = "action%d" % (i + 1)
		if not _layout_boxes.has(key):
			continue
		
		var card = ACTION_CARD_SCENE.instantiate()
		hand_container.add_child(card)
		
		# Get target position from layout
		var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
		
		# Set FINAL position first (untuk reference)
		var target_pos = Vector2(r["x"], r["y"])
		
		# Set START position (off-screen kanan untuk entrance animation)
		card.position = Vector2(target_pos.x + 300, target_pos.y)
		card.size = Vector2(r["width"], r["height"])
		
		var setup_data = {
			"action_slug": mock_hand[i]["action"],
			"slot_index": mock_hand[i]["slot"],
			"action_name": mock_hand[i]["action"].capitalize(),
			"energy_cost": mock_hand[i]["cost"],
			"target_rule": "enemy"
		}
		card.setup(setup_data)
		card.card_drag_started.connect(_on_card_drag_started)
		card.card_drag_ended.connect(_on_card_drag_ended)
		card.modulate.a = 0.0  # Start invisible untuk entrance animation
		
		# Add to hand_cards array
		hand_cards.append(card)
	
	print("[MockupGameplay] Spawned ", hand_cards.size(), " cards")

var reroll_count: int = 999  # Unlimited rerolls (high number)

func _update_energy_display():
	if current_label:
		current_label.text = str(current_energy)
	if max_label:
		max_label.text = str(max_energy)
	
	# Update energy bar fill
	if energy_full and energy_full.material is ShaderMaterial:
		var ratio = float(current_energy) / float(max_energy)
		(energy_full.material as ShaderMaterial).set_shader_parameter("fill_amount", ratio)
	
	# Update reroll count label (show infinity symbol or high number)
	if reroll_count_label:
		reroll_count_label.text = "∞" if reroll_count >= 999 else str(reroll_count)
	
	# Disable reroll button only if not enough energy
	if reroll_button:
		reroll_button.disabled = (current_energy < 2)
		reroll_button.modulate = Color(0.5, 0.5, 0.5, 1.0) if reroll_button.disabled else Color.WHITE
	
	# Update card affordability
	for child in hand_container.get_children():
		if child is Button and child.has_method("can_afford"):
			child.set_enabled(child.can_afford(current_energy))

# Connect signals di _ready() sudah benar, tapi perlu update handler
# card_drag_ended mengirim (card, valid_drop: bool)

# Track card yang sedang di-drag
var _dragging_card: Control = null
var _current_drag_target: Control = null

func _on_card_drag_started(card):
	print("[MockupGameplay] Card drag started: ", card.action_slug)
	_dragging_card = card
	_current_drag_target = null

func _on_card_drag_ended(card, valid_drop: bool):
	print("[MockupGameplay] Card drag ENDED - valid_drop: ", valid_drop, " target: ", _current_drag_target)
	
	if valid_drop and _current_drag_target and _current_drag_target is Hero:
		print("[MockupGameplay] Valid drop on hero: ", _current_drag_target.hero_slug)
		
		# Check if this card requires manual target selection
		var needs_manual_target = _card_needs_manual_target(card.action_slug)
		
		if needs_manual_target:
			# Enter target selection mode - hide card but don't remove yet
			card.visible = false
			_start_target_selection(card, _current_drag_target)
			return
		
		# Simulate casting (auto-target cards)
		current_energy = max(0, current_energy - card.energy_cost)
		_update_energy_display()
		
		# Show casting indicator pada hero target
		_show_casting_indicator(_current_drag_target, card.action_slug)
		
		# Remove card from hand_cards array FIRST
		var card_index = hand_cards.find(card)
		if card_index >= 0:
			hand_cards.remove_at(card_index)
		
		# Remove card from scene
		card.queue_free()
		
		# Reflow remaining cards
		_reindex_hand_cards()
	else:
		print("[MockupGameplay] Drop not valid - card snaps back")
	
	_dragging_card = null
	_current_drag_target = null

func _reindex_hand_cards():
	# Reindex semua card yang tersisa dan reflow ke posisi yang benar
	var vp_size = get_viewport().get_visible_rect().size
	
	for i in range(hand_cards.size()):
		var key = "action%d" % (i + 1)
		if not _layout_boxes.has(key):
			continue
		
		var card = hand_cards[i]
		var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
		
		# Animate card ke posisi baru
		var tween = create_tween()
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_CUBIC)
		tween.tween_property(card, "position", Vector2(r["x"], r["y"]), 0.22)

func _show_casting_indicator(hero: Hero, action_slug: String):
	# Tampilkan casting pie chart dan action name seperti di gameplay normal
	var cast_duration_ms = 1500  # 1.5 detik cast time
	
	print("[MockupGameplay] Showing cast indicator on hero=", hero.hero_slug, " action=", action_slug)
	print("[MockupGameplay] Hero cast_indicator visible before: ", hero._cast_indicator.visible if hero._cast_indicator else "no indicator")
	
	hero._show_casting("mock_cast_%s_%d" % [action_slug, Time.get_ticks_msec()], cast_duration_ms, action_slug)
	
	print("[MockupGameplay] Hero cast_indicator visible after: ", hero._cast_indicator.visible if hero._cast_indicator else "no indicator")

## Check if a card requires manual target selection
func _card_needs_manual_target(action_slug: String) -> bool:
	var normalized = action_slug.replace("_", "-")
	var path = "res://data/action/%s/action.json" % normalized
	var file = FileAccess.open(path, FileAccess.READ)
	if not file:
		return false
	var json = JSON.new()
	if json.parse(file.get_as_text()) != OK:
		return false
	var targeting = json.data.get("targeting", {})
	var selection = targeting.get("selection", "auto")
	return selection == "manual"

## Start target selection mode
func _start_target_selection(card: Control, caster_hero: Hero):
	_selecting_target = true
	var card_index = hand_cards.find(card)
	_pending_card_data = {
		"card": card,
		"caster_hero": caster_hero,
		"action_slug": card.action_slug,
		"slot_index": card.slot_index,
		"card_index": card_index
	}
	
	_create_target_selection_label()
	_highlight_enemy_targets(true)
	
	print("[MockupGameplay] Target selection mode STARTED - action=", card.action_slug)

func _create_target_selection_label():
	if _target_selection_label:
		_target_selection_label.queue_free()
	
	_target_selection_label = Label.new()
	_target_selection_label.name = "TargetSelectionLabel"
	_target_selection_label.text = "SELECT ENEMY TO ATTACK"
	_target_selection_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_target_selection_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_target_selection_label.add_theme_font_size_override("font_size", 48)
	_target_selection_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3, 1.0))
	_target_selection_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	_target_selection_label.add_theme_constant_override("outline_size", 4)
	_target_selection_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	
	var vp_size = get_viewport().get_visible_rect().size
	_target_selection_label.position = Vector2(0, vp_size.y * 0.35)
	_target_selection_label.size = Vector2(vp_size.x, 100)
	
	add_child(_target_selection_label)
	
	# Simple fade in animation (no looping to avoid infinite loop error)
	_target_selection_label.modulate.a = 0.0
	var tween = create_tween()
	tween.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(_target_selection_label, "modulate:a", 1.0, 0.3)

func _highlight_enemy_targets(highlight: bool):
	for hero in enemy_heroes.values():
		if not hero.is_dead():
			hero.set_drag_dimmed(not highlight)

func _exit_target_selection():
	_selecting_target = false
	if _target_selection_label:
		_target_selection_label.queue_free()
		_target_selection_label = null
	_highlight_enemy_targets(false)
	print("[MockupGameplay] Target selection mode ENDED")

func _on_enemy_selected(enemy_hero: Hero):
	if not _selecting_target:
		return
	
	print("[MockupGameplay] Enemy selected: ", enemy_hero.hero_slug)
	
	_exit_target_selection()
	
	var card = _pending_card_data.get("card")
	var caster_hero = _pending_card_data.get("caster_hero")
	
	if card and caster_hero:
		# Deduct energy
		current_energy = max(0, current_energy - card.energy_cost)
		_update_energy_display()
		
		# Calculate and apply damage based on card type
		if card.action_slug == "poison-strike":
			_cast_poison_strike(caster_hero, enemy_hero)
		else:
			# Generic auto-target cards
			_show_casting_indicator(caster_hero, card.action_slug)
		
		# Remove card from hand
		var card_index = hand_cards.find(card)
		if card_index >= 0:
			hand_cards.remove_at(card_index)
		
		card.queue_free()
		_reindex_hand_cards()
	
	_pending_card_data.clear()

## Cast Poison Strike - deals damage and applies DoT
func _cast_poison_strike(caster: Hero, target: Hero):
	# Load action config for base power (we'll use cost * 30 as base power for mockup)
	var base_power = 80  # Base damage for Poison Strike
	
	# Load caster stats
	var caster_def = GameState.get_hero_def(caster.hero_slug)
	var caster_atk = caster_def.get("attack", 100)
	var caster_earth_affinity = caster_def.get("element_affinity", {}).get("earth", 0)
	var caster_shadow_affinity = caster_def.get("element_affinity", {}).get("shadow", 0)
	
	# Load target stats
	var target_def = GameState.get_hero_def(target.hero_slug)
	var target_defense = target_def.get("defense", 50)
	var target_earth_affinity = target_def.get("element_affinity", {}).get("earth", 0)
	var target_shadow_affinity = target_def.get("element_affinity", {}).get("shadow", 0)
	
	# Calculate damage using formula from README:
	# Damage = (Base Power × Caster ATK/100) × (1 + Caster Affinity/100) × (100/(100+Target Def)) × (1 - Target Affinity/100)
	
	# Use highest affinity (Earth or Shadow, whichever is better)
	var caster_affinity = max(caster_earth_affinity, caster_shadow_affinity)
	var target_affinity = min(target_earth_affinity, target_shadow_affinity)  # Worst affinity for defender
	
	var damage = int(
		(float(base_power) * float(caster_atk) / 100.0)
		* (1.0 + float(caster_affinity) / 100.0)
		* (100.0 / (100.0 + float(target_defense)))
		* (1.0 - float(target_affinity) / 100.0)
	)
	
	# Minimum 1 damage
	damage = max(1, damage)
	
	print("[MockupGameplay] Poison Strike damage calculation:")
	print("  Base: ", base_power, " | Caster ATK: ", caster_atk, " | Affinity: ", caster_affinity)
	print("  Target DEF: ", target_defense, " | Target Affinity: ", target_affinity)
	print("  Final Damage: ", damage)
	
	# Show casting indicator first
	_show_casting_indicator(caster, "poison-strike")
	
	# Apply damage after cast duration (1.5 seconds)
	await get_tree().create_timer(1.5).timeout
	
	# Apply instant damage
	target.take_damage(damage)
	
	# Apply DoT effect - "venom-laced attack that delivers toxic internal damage"
	var dot_damage = int(damage * 0.4)  # DoT deals 40% of initial damage per tick
	var dot_ticks = 3  # 3 ticks
	_apply_dot_effect(target, dot_damage, dot_ticks, "poison")
	
	print("[MockupGameplay] Applied Poison DoT: ", dot_damage, " damage/tick for ", dot_ticks, " ticks")

## Apply Damage Over Time effect
func _apply_dot_effect(target_hero: Hero, damage_per_tick: int, ticks: int, dot_type: String):
	var enemy_id = target_hero.hero_instance_id
	
	# Check if DoT already exists
	if _active_dot_effects.has(enemy_id):
		# Stack DoT (max 3 stacks)
		var existing = _active_dot_effects[enemy_id]
		if existing.get("stacks", 0) < DOT_MAX_STACKS:
			existing["stacks"] = existing.get("stacks", 0) + 1
			existing["damage_per_tick"] = max(existing["damage_per_tick"], damage_per_tick)  # Use highest damage
			existing["ticks_remaining"] = min(existing["ticks_remaining"] + ticks, 10)  # Cap at 10 ticks
			print("[MockupGameplay] DoT stacked! Stacks: ", existing["stacks"])
	else:
		# New DoT
		_active_dot_effects[enemy_id] = {
			"hero": target_hero,
			"damage_per_tick": damage_per_tick,
			"ticks_remaining": ticks,
			"stacks": 1,
			"type": dot_type
		}
	
	# Show DoT indicator on hero (floating text)
	target_hero.show_dot_applied(dot_type, damage_per_tick, ticks)

## Process DoT ticks (called every frame in _process)
func _process_dot_ticks(delta: float):
	_dot_tick_timer += delta
	
	if _dot_tick_timer >= DOT_TICK_INTERVAL:
		_dot_tick_timer = 0.0
		
		# Process all active DoTs
		var enemies_to_remove: Array = []
		
		for enemy_id in _active_dot_effects.keys():
			var dot = _active_dot_effects[enemy_id]
			var hero: Hero = dot.get("hero")
			
			if not is_instance_valid(hero) or hero.is_dead():
				enemies_to_remove.append(enemy_id)
				continue
			
			# Deal damage
			var total_dot_damage = dot["damage_per_tick"] * dot.get("stacks", 1)
			hero.take_damage(total_dot_damage)
			
			print("[MockupGameplay] DoT tick on ", hero.hero_slug, ": -", total_dot_damage, " HP (stacks: ", dot.get("stacks", 1), ")")
			
			# Reduce ticks
			dot["ticks_remaining"] -= 1
			
			if dot["ticks_remaining"] <= 0:
				enemies_to_remove.append(enemy_id)
				print("[MockupGameplay] DoT expired on ", hero.hero_slug)
		
		# Remove expired DoTs
		for enemy_id in enemies_to_remove:
			_active_dot_effects.erase(enemy_id)

func _cancel_target_selection():
	var card = _pending_card_data.get("card")
	var card_index = _pending_card_data.get("card_index", -1)
	
	_exit_target_selection()
	_pending_card_data.clear()
	
	if card and card_index >= 0:
		card.visible = true
		card.scale = Vector2(1.0, 1.0)
		card.modulate.a = 1.0
		
		var vp_size = get_viewport().get_visible_rect().size
		var key = "action%d" % (card_index + 1)
		if _layout_boxes.has(key):
			var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
			var tween = create_tween()
			tween.set_ease(Tween.EASE_OUT)
			tween.set_trans(Tween.TRANS_BACK)
			tween.tween_property(card, "position", Vector2(r["x"], r["y"]), 0.3)
		
		print("[MockupGameplay] Target selection cancelled - card restored")

func _input(event: InputEvent):
	if event is InputEventKey and event.pressed and event.keycode == KEY_F12:
		print("[MockupGameplay] F12 pressed - exiting mockup mode")
		_exit_mockup_mode()
	
	# Handle enemy selection during target selection mode
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		if _selecting_target:
			var mouse_pos = get_global_mouse_position()
			var enemy_hero = _get_enemy_hero_at_point(mouse_pos)
			if enemy_hero and not enemy_hero.is_dead():
				_on_enemy_selected(enemy_hero)
				get_viewport().set_input_as_handled()
				return
			else:
				_cancel_target_selection()
				get_viewport().set_input_as_handled()
				return
	
	# Track hover saat drag untuk mengetahui target
	if event is InputEventMouseMotion and _dragging_card:
		var mouse_pos = get_global_mouse_position()
		for hero in get_heroes():
			if hero.get_global_rect().has_point(mouse_pos) and not hero.is_enemy and not hero.is_dead():
				_current_drag_target = hero
				return
		_current_drag_target = null

func _get_enemy_hero_at_point(point: Vector2) -> Hero:
	for hero in enemy_heroes.values():
		if hero.get_global_rect().has_point(point):
			return hero
	return null

func _on_reroll_pressed():
	# Check if player has enough energy (2 mana)
	if current_energy < 2:
		print("[MockupGameplay] Not enough energy! Need 2 mana for reroll")
		return
	
	print("[MockupGameplay] Reroll pressed")
	
	# Deduct 2 energy for reroll
	current_energy -= 2
	_update_energy_display()
	
	# Clear hand_cards array
	hand_cards.clear()
	
	# Clear existing cards
	for child in hand_container.get_children():
		child.queue_free()
	
	# Wait sebentar lalu spawn hand baru
	await get_tree().create_timer(0.1).timeout
	
	# Spawn hand baru
	_spawn_mock_hand()
	
	# Play entrance animation untuk card baru
	_play_reroll_entrance()

func _on_back_pressed():
	print("[MockupGameplay] Back pressed - exiting mockup mode")
	_exit_mockup_mode()

func _play_entrance_animation():
	# Fade out overlay
	var fade_tween = create_tween()
	fade_tween.tween_property(fade_rect, "color:a", 0.0, 0.5)
	
	# Animate heroes (enemy first, then ally)
	var hero_delay = 0.3
	for hero in heroes_container.get_children():
		var tween = create_tween().set_parallel(true)
		tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
		tween.tween_property(hero, "modulate:a", 1.0, 0.4).set_delay(hero_delay)
		tween.tween_property(hero, "scale", Vector2(1.0, 1.0), 0.4).set_delay(hero_delay)
		hero_delay += 0.1
	
	# Animate cards - slide from right to correct position
	var card_delay = 0.6
	for card in hand_container.get_children():
		var target_x = card.position.x - 300  # Slide back to correct X
		var tween = create_tween().set_parallel(true)
		tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
		tween.tween_property(card, "modulate:a", 1.0, 0.35).set_delay(card_delay)
		tween.tween_property(card, "position:x", target_x, 0.45).set_delay(card_delay)
		card_delay += 0.08
	
	# Animate UI elements
	_animate_ui_element(energy_bar, 0.7, Vector2(0, 30))
	_animate_ui_element(reroll_button, 0.8, Vector2(0, 30))
	_animate_ui_element(back_button, 0.75, Vector2(0, -20))
	if time_animap:
		_animate_ui_element(time_animap, 0.68, Vector2(0, -20))
	if info_animap:
		_animate_ui_element(info_animap, 0.65, Vector2(0, -20))

func _play_reroll_entrance():
	var card_delay = 0.0
	for card in hand_container.get_children():
		if card is Button:
			var tween = create_tween().set_parallel(true)
			tween.tween_property(card, "modulate:a", 1.0, 0.35).set_delay(card_delay)
			tween.tween_property(card, "position:x", card.position.x - 300, 0.55).set_delay(card_delay)
			card_delay += 0.12

func _animate_ui_element(element: Control, delay: float, offset: Vector2):
	var final_pos = element.position
	element.position += offset
	var tween = create_tween().set_parallel(true)
	tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tween.tween_property(element, "modulate:a", 1.0, 0.35).set_delay(delay)
	tween.tween_property(element, "position", final_pos, 0.4).set_delay(delay)

func _update_status(text: String):
	if status_label:
		status_label.text = text

func _apply_background():
	var bg = get_node_or_null("Background")
	if not bg:
		return
	var bg_slug = GameState.get_scene_background("gameplay")
	if bg_slug.is_empty():
		bg.texture = null
		return
	var variant = "narrow" if _layout_aspect_key.begins_with("9") else "wide"
	var path = "res://assets/places/%s-%s.webp" % [bg_slug, variant]
	var tex = load(path)
	if tex:
		bg.texture = tex

func _exit_mockup_mode():
	print("[MockupGameplay] Exiting mockup mode")
	# Fade out
	var tween = create_tween()
	tween.tween_property(fade_rect, "color:a", 1.0, 0.3)
	tween.tween_callback(func():
		# Change scene back to main
		get_tree().change_scene_to_file("res://scenes/main.tscn")
	)

func _notification(what: int):
	if what == NOTIFICATION_PREDELETE:
		# Cleanup saat scene dihancurkan
		print("[MockupGameplay] Cleanup - removing from gameplay group")
		if is_inside_tree() and is_in_group("gameplay"):
			remove_from_group("gameplay")

# Public API for action cards (compatibility dengan gameplay.gd)
func get_heroes() -> Array:
	var all = []
	for hero in my_heroes.values():
		all.append(hero)
	for hero in enemy_heroes.values():
		all.append(hero)
	return all

func _get_hovered_hero() -> Control:
	# Dapatkan hero yang sedang di-hover saat drag
	var gameplay = get_tree().get_first_node_in_group("gameplay")
	if not gameplay:
		return null
	
	# Gunakan logic yang sama seperti action_card._get_drop_target()
	var cards = []
	for child in hand_container.get_children():
		if child is Button:
			cards.append(child)
	
	if cards.is_empty():
		return null
	
	var card = cards[0]  # Ambil card pertama yang sedang di-drag (sebenarnya kurang akurat)
	# Lebih baik pakai global position dari mouse
	var mouse_pos = card.get_global_mouse_position()
	
	for hero in get_heroes():
		if hero.get_global_rect().has_point(mouse_pos):
			return hero
	
	return null

# --- Info Animap Drag Handling (sama seperti gameplay.gd) ---
var _dragging_info: bool = false
var _info_drag_started: bool = false
var _info_press_position: Vector2 = Vector2.ZERO
var _info_drag_offset: Vector2 = Vector2.ZERO
var _info_drag_start_pos: Vector2 = Vector2.ZERO
var _info_hover_target: Control = null
var _info_drag_virtual_pos: Vector2 = Vector2.ZERO
const INFO_DRAG_THRESHOLD := 8.0

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			if _is_point_over_info_animap(event.position):
				_dragging_info = true
				_info_drag_started = false
				_info_press_position = event.position
				_info_drag_offset = event.position - info_animap.global_position
				_info_drag_start_pos = info_animap.global_position
				if info_animap and info_animap.has_state("dragging"):
					info_animap.set_state("dragging")
				_clear_selected_hero()
				get_viewport().set_input_as_handled()
				return
		elif _dragging_info:
			_finish_info_drag()
			get_viewport().set_input_as_handled()
			return
	if event is InputEventMouseMotion and _dragging_info:
		_update_info_drag(event.position)
		get_viewport().set_input_as_handled()
		return

func _is_point_over_info_animap(point: Vector2) -> bool:
	return info_animap != null and info_animap.visible and info_animap.get_global_rect().has_point(point)

func _update_info_drag(mouse_position: Vector2 = get_global_mouse_position()):
	if not info_animap:
		return
	if not _info_drag_started and mouse_position.distance_to(_info_press_position) >= INFO_DRAG_THRESHOLD:
		_info_drag_started = true
		_info_drag_virtual_pos = _info_drag_start_pos
		info_animap.z_index = 100
		if info_animap.has_state("dragging"):
			info_animap.set_state("dragging")
	if not _info_drag_started:
		return
	_info_drag_virtual_pos = mouse_position - _info_drag_offset
	info_animap.global_position = _info_drag_virtual_pos

func _finish_info_drag():
	if not _dragging_info:
		return
	_dragging_info = false
	_info_drag_started = false
	info_animap.z_index = 0
	if info_animap and info_animap.get_state() == "dragging":
		info_animap.set_state(AnimapLoader.DEFAULT_STATE_ID)
	# Snap back
	_snap_info_back()

func _snap_info_back():
	if not info_animap:
		return
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_BACK)
	tween.tween_property(info_animap, "global_position", _info_drag_start_pos, 0.25)

func _clear_selected_hero():
	# Clear any hero selection when dragging info
	pass
