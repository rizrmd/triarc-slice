extends Control
## Gameplay - Main battle scene with heroes, hand, and energy

@onready var heroes_container: Control = $HeroesContainer
@onready var hand_container: Control = $HandContainer
@onready var energy_bar: ProgressBar = $UIOverlay/EnergyBar
@onready var reroll_button: Button = $UIOverlay/RerollButton
@onready var back_button: Button = $UIOverlay/BackButton

const HERO_SCENE = preload("res://scenes/hero.tscn")
const ACTION_CARD_SCENE = preload("res://scenes/action_card.tscn")

# Heroes
var my_heroes: Dictionary = {}  # slot_index -> Hero node
var enemy_heroes: Dictionary = {}  # slot_index -> Hero node
var hand_cards: Array = []
var _used_hand_slots: Array = []  # slot indices of cards used this hand

# State
var current_energy: int = 10
var max_energy: int = 10
var _last_state: Dictionary = {}
var _layout_boxes: Dictionary = {}
var _layout_aspect_key: String = ""

# Drag state
var _dragging_card = null
var _hovered_hero: Node = null

# Dev panel
var _dev_panel: PanelContainer = null
var _dev_label: RichTextLabel = null
var _dev_visible: bool = false

func _ready():
	add_to_group("gameplay")

	reroll_button.pressed.connect(_on_reroll_pressed)
	back_button.pressed.connect(_on_back_pressed)

	_layout_boxes = GameState.get_scene_boxes("gameplay")
	_layout_aspect_key = _get_matched_aspect_key()
	_set_initial_positions()
	_create_dev_panel()

	# Request initial match state
	if not GameState.current_match_id.is_empty():
		GameState.send_json({
			"type": "get_match_state",
			"match_id": GameState.current_match_id
		})

func _process(_delta):
	if _dragging_card:
		_update_drag_hover()

	# Poll and process WebSocket messages
	if GameState.ws:
		GameState.ws.poll()
		var state = GameState.ws.get_ready_state()
		if state == WebSocketPeer.STATE_OPEN:
			while GameState.ws.get_available_packet_count() > 0:
				var msg = GameState.ws.get_packet().get_string_from_utf8()
				_on_ws_message(msg)
		elif state == WebSocketPeer.STATE_CLOSED:
			print("[Gameplay] WebSocket disconnected")
			GameState.ws = null
			_on_disconnected()

func _unhandled_input(event: InputEvent):
	if event is InputEventKey and event.pressed and event.keycode == KEY_F3:
		_toggle_dev_panel()

func _on_ws_message(msg: String):
	var json = JSON.new()
	if json.parse(msg) != OK:
		return
	
	var data: Dictionary = json.data
	var msg_type: String = data.get("type", "")
	
	match msg_type:
		"state_update":
			_update_game_state(data)
		"match_found":
			# Match already started, we're in gameplay
			pass
		"error":
			print("[Gameplay] Error: ", data.get("message", ""))

func _update_game_state(data: Dictionary):
	var match_data = data.get("match", {})
	var heroes_data = data.get("heroes", [])
	var team_states = data.get("team_states", [])
	var hand_data = data.get("hand", [])
	var casts = data.get("casts", [])
	var statuses = data.get("statuses", [])
	
	# Update team energy
	for team_state in team_states:
		if team_state.get("team") == GameState.current_team:
			_tween_energy(team_state.get("energy", 0))
			max_energy = team_state.get("energy_max", 10)
	
	# Update heroes
	for hero_data in heroes_data:
		var slot = hero_data.get("slot_index", 0)
		var team = hero_data.get("team", 0)
		var is_enemy = (team != GameState.current_team)
		
		var hero_node = _get_or_create_hero(slot, is_enemy, hero_data)
		hero_node.update_state(hero_data)
	
	# Update hand (filter to only our team's cards)
	var my_hand: Array = []
	for card in hand_data:
		if card.get("team", 0) == GameState.current_team:
			my_hand.append(card)
	_update_hand(my_hand)
	
	# Update casting indicators
	_update_casting_indicators(casts)
	
	# Check match end
	var winner = match_data.get("winner", 0)
	if winner != 0:
		_on_match_end(winner)

func _get_or_create_hero(slot: int, is_enemy: bool, hero_data: Dictionary) -> Node:
	var dict = enemy_heroes if is_enemy else my_heroes

	if dict.has(slot):
		return dict[slot]

	# Create new hero
	var hero = HERO_SCENE.instantiate()
	heroes_container.add_child(hero)
	hero.setup(hero_data, is_enemy)

	# Position and scale based on layout from game-layout.json
	var vp_size = get_viewport().get_visible_rect().size
	var key = "enemy%d" % slot if is_enemy else "hero%d" % slot
	if _layout_boxes.has(key):
		var box = _layout_boxes[key]
		var r = GameState.resolve_box(box, vp_size, _layout_aspect_key)
		hero.position = Vector2(r["x"], r["y"])
		hero.size = Vector2(r["width"], r["height"])
		# Scale sprites to fit the layout box
		hero.apply_layout_size(Vector2(r["width"], r["height"]))

	dict[slot] = hero
	return hero

func _update_hand(hand_data: Array):
	# Skip update if a card is being dragged
	for card in hand_cards:
		if card.is_dragging:
			return
	# Clear existing hand cards
	for card in hand_cards:
		card.queue_free()
	hand_cards.clear()

	# Filter out used slots (cards already cast this hand)
	var filtered_hand: Array = []
	for card_data in hand_data:
		var slot_idx = card_data.get("slot_index", 0)
		if slot_idx not in _used_hand_slots:
			filtered_hand.append(card_data)

	var vp_size = get_viewport().get_visible_rect().size

	# Create new cards positioned in sequential layout slots
	for i in range(filtered_hand.size()):
		var key = "action%d" % (i + 1)
		if not _layout_boxes.has(key):
			continue

		var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
		var card_data = filtered_hand[i]
		var card = ACTION_CARD_SCENE.instantiate()
		hand_container.add_child(card)

		# Set size from layout before building visuals
		card.size = Vector2(r["width"], r["height"])
		card.position = Vector2(r["x"], r["y"])
		card.setup(card_data)
		card.card_drag_started.connect(_on_card_drag_started)
		card.card_drag_ended.connect(_on_card_drag_ended)

		hand_cards.append(card)

func _tween_energy(new_energy: int):
	if current_energy == new_energy:
		return
	
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_method(_set_energy, current_energy, new_energy, 0.5)
	current_energy = new_energy

func _set_energy(value: int):
	energy_bar.max_value = max_energy
	energy_bar.value = value
	energy_bar.get_node("Label").text = "%d/%d" % [int(value), max_energy]
	
	# Update card affordability
	for card in hand_cards:
		card.set_enabled(card.can_afford(int(value)))

func _update_casting_indicators(casts: Array):
	var now_ms = int(Time.get_unix_time_from_system() * 1000.0)

	for cast in casts:
		if cast.get("resolved", false):
			continue

		var cast_id = cast.get("cast_id", "")
		var caster_id = cast.get("caster_hero_instance_id", "")
		var started_at = int(cast.get("started_at", 0))
		var resolves_at = int(cast.get("resolves_at", 0))

		if resolves_at <= now_ms:
			continue

		var total_ms = resolves_at - started_at
		var action_slug = cast.get("action_slug", "")
		var hero = _find_hero_by_instance_id(caster_id)
		if hero:
			hero._show_casting(cast_id, total_ms, action_slug)

func _find_hero_by_instance_id(instance_id: String) -> Node:
	for hero in my_heroes.values():
		if hero.hero_instance_id == instance_id:
			return hero
	for hero in enemy_heroes.values():
		if hero.hero_instance_id == instance_id:
			return hero
	return null

func _on_card_drag_started(_card):
	_dragging_card = _card
	_hovered_hero = null
	_highlight_valid_targets(_card.target_rule)

func _on_card_drag_ended(card, dropped_on_target):
	_dragging_card = null
	_hovered_hero = null
	_clear_highlights()
	if dropped_on_target:
		# Track the used slot so state_update won't recreate it
		_used_hand_slots.append(card.slot_index)
		# Remove the used card from hand
		hand_cards.erase(card)
		card.queue_free()
		# Auto-reroll when all cards are used (server grants free reroll)
		if hand_cards.is_empty():
			_used_hand_slots.clear()
			GameState.send_json({
				"type": "reroll_hand",
				"match_id": GameState.current_match_id
			})

func _highlight_valid_targets(_target_rule: String):
	for hero in my_heroes.values():
		hero.set_char_brightness(0.4)

func _update_drag_hover():
	var mouse_pos = get_global_mouse_position()
	var new_hover: Node = null

	var card_rect = _dragging_card.get_global_rect()
	var card_center = card_rect.get_center()
	var best_dist = INF

	var all_heroes = []
	all_heroes.append_array(my_heroes.values())
	all_heroes.append_array(enemy_heroes.values())

	for hero in all_heroes:
		if card_rect.intersects(hero.get_global_rect()):
			var dist = card_center.distance_to(hero.get_global_rect().get_center())
			if dist < best_dist:
				best_dist = dist
				new_hover = hero

	if new_hover == _hovered_hero:
		return

	# Restore previous hover
	if _hovered_hero and is_instance_valid(_hovered_hero) and not _hovered_hero.is_enemy:
		_hovered_hero.set_char_brightness(0.4)
	if _hovered_hero and _dragging_card:
		var tween = create_tween()
		tween.tween_property(_dragging_card, "modulate:a", 1.0, 0.15)

	_hovered_hero = new_hover

	# Hovered ally: restore brightness, reduce card opacity
	if _hovered_hero and not _hovered_hero.is_enemy:
		_hovered_hero.set_char_brightness(1.0)
	if _hovered_hero and _dragging_card:
		var tween = create_tween()
		tween.tween_property(_dragging_card, "modulate:a", 0.6, 0.15)

func _clear_highlights():
	for hero in my_heroes.values():
		hero.set_char_brightness(1.0)

func _on_reroll_pressed():
	_used_hand_slots.clear()
	GameState.send_json({
		"type": "reroll_hand",
		"match_id": GameState.current_match_id
	})

func _on_back_pressed():
	# Leave match
	GameState.send_json({
		"type": "leave_match",
		"match_id": GameState.current_match_id
	})
	
	GameState.current_match_id = ""
	get_tree().change_scene_to_file("res://scenes/main.tscn")

func _on_disconnected():
	GameState.current_match_id = ""
	get_tree().change_scene_to_file("res://scenes/main.tscn")

func _on_match_end(winner: int):
	# Disable interactions
	reroll_button.disabled = true
	for card in hand_cards:
		card.disabled = true
	
	# Show result and return to main after delay
	await get_tree().create_timer(3.0).timeout
	get_tree().change_scene_to_file("res://scenes/main.tscn")

func _set_initial_positions():
	var vp_size = get_viewport().get_visible_rect().size
	if _layout_boxes.has("mana"):
		var r = GameState.resolve_box(_layout_boxes["mana"], vp_size, _layout_aspect_key)
		energy_bar.position = Vector2(r["x"], r["y"])
		energy_bar.size = Vector2(r["width"], r["height"])
	if _layout_boxes.has("reroll"):
		var r = GameState.resolve_box(_layout_boxes["reroll"], vp_size, _layout_aspect_key)
		reroll_button.position = Vector2(r["x"], r["y"])
		reroll_button.size = Vector2(r["width"], r["height"])
	if _layout_boxes.has("settings"):
		var r = GameState.resolve_box(_layout_boxes["settings"], vp_size, _layout_aspect_key)
		back_button.position = Vector2(r["x"], r["y"])
		back_button.size = Vector2(r["width"], r["height"])
	# Load background from layout
	var bg_slug = GameState.get_scene_background("gameplay")
	if not bg_slug.is_empty():
		var variant = "narrow" if _layout_aspect_key.begins_with("9") else "wide"
		var path = "res://assets/places/%s-%s.webp" % [bg_slug, variant]
		var tex = load(path)
		if tex:
			$Background.texture = tex

# Public API for action cards
func get_heroes() -> Array:
	var all = []
	all.append_array(my_heroes.values())
	all.append_array(enemy_heroes.values())
	return all

# --- Dev Panel (desktop only, toggle with F3) ---

func _get_matched_aspect_key() -> String:
	var scenes: Dictionary = GameState._layout_data.get("scenes", {})
	var scene: Dictionary = scenes.get("gameplay", {})
	var boxes: Dictionary = scene.get("boxes", {})
	if boxes.is_empty():
		return ""
	return GameState.find_best_aspect(boxes)

func _create_dev_panel():
	if OS.get_name() in ["Android", "iOS"]:
		return

	_dev_panel = PanelContainer.new()
	_dev_panel.name = "DevPanel"
	_dev_panel.visible = false
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0, 0, 0, 0.8)
	style.set_corner_radius_all(8)
	style.set_content_margin_all(12)
	_dev_panel.add_theme_stylebox_override("panel", style)
	_dev_panel.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_dev_panel.position = Vector2(10, 10)

	_dev_label = RichTextLabel.new()
	_dev_label.bbcode_enabled = true
	_dev_label.fit_content = true
	_dev_label.custom_minimum_size = Vector2(340, 0)
	_dev_label.scroll_active = false
	_dev_label.add_theme_font_size_override("normal_font_size", 14)
	_dev_panel.add_child(_dev_label)

	$UIOverlay.add_child(_dev_panel)

func _toggle_dev_panel():
	if not _dev_panel:
		return
	_dev_visible = not _dev_visible
	_dev_panel.visible = _dev_visible
	if _dev_visible:
		_update_dev_panel()

func _update_dev_panel():
	if not _dev_label:
		return
	var vp_size = get_viewport().get_visible_rect().size
	var aspect = vp_size.x / vp_size.y
	var lines: PackedStringArray = []
	lines.append("[b]Layout Dev Panel[/b]")
	lines.append("Viewport: %d x %d" % [int(vp_size.x), int(vp_size.y)])
	lines.append("Aspect: %.4f  Matched: [color=yellow]%s[/color]" % [aspect, _layout_aspect_key])
	lines.append("")

	# List all available aspect keys
	var scenes: Dictionary = GameState._layout_data.get("scenes", {})
	var scene: Dictionary = scenes.get("gameplay", {})
	var all_boxes: Dictionary = scene.get("boxes", {})
	lines.append("[b]Available aspects:[/b]")
	for key in all_boxes.keys():
		var parts = key.split("-")
		if parts.size() == 2:
			var bp_aspect = float(parts[0]) / float(parts[1])
			var diff = abs(aspect - bp_aspect)
			var marker = " [color=green]<< active[/color]" if key == _layout_aspect_key else ""
			lines.append("  %s (%.4f) diff=%.4f%s" % [key, bp_aspect, diff, marker])
	lines.append("")

	# List all boxes with resolved positions
	lines.append("[b]Boxes (%d):[/b]" % _layout_boxes.size())
	var sorted_keys = _layout_boxes.keys()
	sorted_keys.sort()
	for key in sorted_keys:
		var box = _layout_boxes[key]
		var r = GameState.resolve_box(box, vp_size, _layout_aspect_key)
		var sr = " [color=cyan]SR[/color]" if box.get("screen_relative", false) else ""
		lines.append("  [color=white]%s[/color]: pos(%d,%d) size(%dx%d) pivot=%s%s" % [
			key, int(r["x"]), int(r["y"]), int(r["width"]), int(r["height"]),
			box.get("pivot", "center"), sr
		])
	lines.append("")
	lines.append("[color=gray]Press F3 to close[/color]")
	_dev_label.text = "\n".join(lines)
