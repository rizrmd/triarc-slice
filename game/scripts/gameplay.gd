extends Control
## Gameplay - Main battle scene with heroes, hand, and energy

@onready var heroes_container: Control = $HeroesContainer
@onready var hand_container: Control = $HandContainer
@onready var energy_bar: TextureRect = $UIOverlay/EnergyBar
@onready var reroll_button: TextureButton = $UIOverlay/RerollButton
@onready var back_button: Button = $UIOverlay/BackButton
@onready var fade_rect: ColorRect = $UIOverlay/FadeRect

const HERO_SCENE = preload("res://scenes/hero.tscn")
const ACTION_CARD_SCENE = preload("res://scenes/action_card.tscn")
const HAND_REFLOW_DURATION := 0.22

# Heroes
var my_heroes: Dictionary = {}  # slot_index -> Hero node
var enemy_heroes: Dictionary = {}  # slot_index -> Hero node
var hand_cards: Array = []
var _used_hand_keys: Array = []  # "action_slug:slot_index" of cards cast this hand
var _prev_server_keys: Dictionary = {}  # keys from previous hand update for stabilization

# State
var current_energy: int = 10
var max_energy: int = 10
var _last_state: Dictionary = {}
var _layout_boxes: Dictionary = {}
var _layout_aspect_key: String = ""
var _available_layout_aspects: Array[String] = []
var _layout_ready: bool = false
var _is_first_state_update: bool = true

# Drag state
var _dragging_card = null
var _hovered_hero: Node = null
var _hover_tween: Tween = null
var _selected_hero: Hero = null

# Dev panel
var _dev_panel: PanelContainer = null
var _dev_label: RichTextLabel = null
var _dev_visible: bool = false

func _ready():
	add_to_group("gameplay")

	reroll_button.pressed.connect(_on_reroll_pressed)
	reroll_button.button_down.connect(func(): reroll_button.modulate = Color(0.8, 0.8, 0.8, 1.0))
	reroll_button.button_up.connect(func(): reroll_button.modulate = Color(1.0, 1.0, 1.0, 1.0))
	back_button.pressed.connect(_on_back_pressed)
	GameState.gameplay_aspect_changed.connect(_on_gameplay_aspect_changed)

	_available_layout_aspects = _get_available_aspect_keys()
	_refresh_layout_data()
	_layout_ready = true
	_apply_layout(false)
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
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F3:
			_toggle_dev_panel()

func _notification(what: int):
	if what == NOTIFICATION_RESIZED and _layout_ready:
		_apply_layout(false)

func _input(event: InputEvent):
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var mouse_pos = get_global_mouse_position()
		var clicked_hero = _get_my_hero_at_point(mouse_pos)
		print("[Gameplay] global click pos=", mouse_pos, " clicked_hero=", clicked_hero.hero_slug if clicked_hero else "none")
		if clicked_hero:
			_set_selected_hero(clicked_hero)
		else:
			_clear_selected_hero()

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

func _on_gameplay_aspect_changed(_aspect_key: String):
	if not _layout_ready:
		return
	_apply_layout(false)

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
	
	# Trigger entrance animation on first state update
	if _is_first_state_update:
		_is_first_state_update = false
		_play_entrance_animation()

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
	hero.hero_clicked.connect(_on_hero_clicked)

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

	if _is_first_state_update:
		hero.modulate.a = 0.0
		hero.scale = Vector2(0.8, 0.8)

	dict[slot] = hero
	return hero

func _update_hand(hand_data: Array):
	# Skip update if a card is being dragged
	for card in hand_cards:
		if card.is_dragging:
			return

	# No hand data in this update — keep current display intact.
	if hand_data.is_empty():
		return

	# Build raw server keys for used-card pruning
	var raw_server_keys: Dictionary = {}
	for cd in hand_data:
		raw_server_keys["%s:%d" % [cd.get("action_slug", ""), cd.get("slot_index", 0)]] = true

	# Prune used entries the server has confirmed as gone
	_used_hand_keys = _used_hand_keys.filter(func(k): return k in raw_server_keys)

	# Stabilize: only keep cards present in BOTH this and previous update.
	# This filters out cards that flip in/out due to server sending both teams' data.
	if not _prev_server_keys.is_empty() and not hand_cards.is_empty():
		hand_data = hand_data.filter(func(cd):
			var key = "%s:%d" % [cd.get("action_slug", ""), cd.get("slot_index", 0)]
			return key in _prev_server_keys)
	_prev_server_keys = raw_server_keys

	# Filter out cards the player already cast
	var filtered_hand: Array = []
	for card_data in hand_data:
		var key = "%s:%d" % [card_data.get("action_slug", ""), card_data.get("slot_index", 0)]
		if key not in _used_hand_keys:
			filtered_hand.append(card_data)

	var vp_size = get_viewport().get_visible_rect().size
	var existing_by_key: Dictionary = {}
	for card in hand_cards:
		existing_by_key[_get_hand_card_key(card.slot_index, card.action_slug)] = card

	var next_hand_cards: Array = []

	# Reuse existing cards when possible so hand reflow can animate.
	for i in range(filtered_hand.size()):
		var key = "action%d" % (i + 1)
		if not _layout_boxes.has(key):
			continue

		var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
		var card_data = filtered_hand[i]
		var card_key = _get_hand_card_key(card_data.get("slot_index", 0), card_data.get("action_slug", ""))
		var card = existing_by_key.get(card_key, null)
		var target_pos = Vector2(r["x"], r["y"])
		var target_size = Vector2(r["width"], r["height"])

		if card == null:
			card = ACTION_CARD_SCENE.instantiate()
			hand_container.add_child(card)

			# Set size from layout before building visuals
			card.size = target_size
			card.position = target_pos
			card.setup(card_data)
			card.card_drag_started.connect(_on_card_drag_started)
			card.card_drag_ended.connect(_on_card_drag_ended)

			if _is_first_state_update:
				card.modulate.a = 0.0
				card.position.y += 200
		else:
			existing_by_key.erase(card_key)
			card.size = target_size
			_move_hand_card(card, target_pos, true)

		card.set_enabled(card.can_afford(current_energy))
		next_hand_cards.append(card)

	for stale_card in existing_by_key.values():
		stale_card.queue_free()

	hand_cards = next_hand_cards

func _tween_energy(new_energy: int):
	if current_energy == new_energy:
		return

	var old_ratio = float(current_energy) / float(max_energy) if max_energy > 0 else 0.0
	var new_ratio = float(new_energy) / float(max_energy) if max_energy > 0 else 0.0

	var tween = create_tween().set_parallel(true)
	tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tween.tween_method(_set_energy, current_energy, new_energy, 0.5)
	tween.tween_method(_set_energy_fill, old_ratio, new_ratio, 0.5)
	current_energy = new_energy

func _set_energy(value: int):
	energy_bar.get_node("CurrentLabel").text = str(int(value))
	energy_bar.get_node("MaxLabel").text = str(max_energy)

	# Update card affordability
	for card in hand_cards:
		card.set_enabled(card.can_afford(int(value)))

func _set_energy_fill(ratio: float):
	energy_bar.get_node("EnergyFull").material.set_shader_parameter("fill_amount", ratio)

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
	print("[Gameplay] drag started action=", _card.action_slug, " slot=", _card.slot_index, " clearing selection")
	_clear_selected_hero()
	_dragging_card = _card
	_hovered_hero = null
	_highlight_valid_targets(_card.target_rule)

func _on_card_drag_ended(card, dropped_on_target):
	_dragging_card = null
	_hovered_hero = null
	if _hover_tween and _hover_tween.is_valid():
		_hover_tween.kill()
	_clear_highlights()
	if dropped_on_target:
		# Track the used card so state_update won't recreate it
		_used_hand_keys.append("%s:%d" % [card.action_slug, card.slot_index])
		# Remove the used card from hand
		hand_cards.erase(card)
		_layout_hand_cards(true)
		card.queue_free()
		# Auto-reroll when all cards are used (server grants free reroll)
		if hand_cards.is_empty():
			_used_hand_keys.clear()
			_prev_server_keys.clear()
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

	_hovered_hero = new_hover

	# Kill previous hover tween before creating a new one
	if _hover_tween and _hover_tween.is_valid():
		_hover_tween.kill()

	# Hovered ally: restore brightness, reduce card opacity
	if _hovered_hero and not _hovered_hero.is_enemy:
		_hovered_hero.set_char_brightness(1.0)
	if _hovered_hero and _dragging_card:
		_hover_tween = create_tween()
		_hover_tween.tween_property(_dragging_card, "modulate:a", 0.6, 0.15)
	elif _dragging_card:
		_hover_tween = create_tween()
		_hover_tween.tween_property(_dragging_card, "modulate:a", 1.0, 0.15)

func _clear_highlights():
	for hero in my_heroes.values():
		hero.set_char_brightness(1.0)

func _on_hero_clicked(hero: Hero):
	print("[Gameplay] hero_clicked hero=", hero.hero_slug, " slot=", hero.slot_index, " enemy=", hero.is_enemy, " dead=", hero.is_dead())
	if hero == null or hero.is_enemy or hero.is_dead():
		_clear_selected_hero()
		return
	_set_selected_hero(hero)

func _set_selected_hero(hero: Hero):
	if _selected_hero and is_instance_valid(_selected_hero) and _selected_hero != hero:
		print("[Gameplay] deselect previous hero=", _selected_hero.hero_slug, " slot=", _selected_hero.slot_index)
		_selected_hero.set_selected(false)
	_selected_hero = hero
	if _selected_hero and is_instance_valid(_selected_hero):
		print("[Gameplay] select hero=", _selected_hero.hero_slug, " slot=", _selected_hero.slot_index)
		_selected_hero.set_selected(true)

func _clear_selected_hero():
	if _selected_hero and is_instance_valid(_selected_hero):
		print("[Gameplay] clear selected hero=", _selected_hero.hero_slug, " slot=", _selected_hero.slot_index)
		_selected_hero.set_selected(false)
	else:
		print("[Gameplay] clear selected hero=noop")
	_selected_hero = null

func _get_my_hero_at_point(point: Vector2) -> Hero:
	for hero in my_heroes.values():
		if hero.get_global_rect().has_point(point):
			print("[Gameplay] point over hero=", hero.hero_slug, " slot=", hero.slot_index)
			return hero
	return null

func _layout_hand_cards(animated: bool):
	var vp_size = get_viewport().get_visible_rect().size
	for i in range(hand_cards.size()):
		var key = "action%d" % (i + 1)
		if not _layout_boxes.has(key):
			continue
		var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
		var card = hand_cards[i]
		card.size = Vector2(r["width"], r["height"])
		_move_hand_card(card, Vector2(r["x"], r["y"]), animated)

func _move_hand_card(card: Control, target_pos: Vector2, animated: bool):
	var tween: Tween = card.get_meta("hand_reflow_tween") if card.has_meta("hand_reflow_tween") else null
	if tween and tween.is_valid():
		tween.kill()

	if not animated:
		card.position = target_pos
		card.remove_meta("hand_reflow_tween")
		return

	if card.position.is_equal_approx(target_pos):
		card.remove_meta("hand_reflow_tween")
		return

	tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_CUBIC)
	tween.tween_property(card, "position", target_pos, HAND_REFLOW_DURATION)
	card.set_meta("hand_reflow_tween", tween)
	tween.finished.connect(func():
		if is_instance_valid(card):
			card.remove_meta("hand_reflow_tween")
	)

func _get_hand_card_key(slot_index: int, action_slug: String) -> String:
	return "%s::%s" % [slot_index, action_slug]

func _on_reroll_pressed():
	_used_hand_keys.clear()
	_prev_server_keys.clear()
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
	if energy_bar == null or reroll_button == null or back_button == null:
		return
	var vp_size = get_viewport().get_visible_rect().size
	if _layout_boxes.has("energy"):
		var r = GameState.resolve_box(_layout_boxes["energy"], vp_size, _layout_aspect_key)
		energy_bar.position = Vector2(r["x"], r["y"])
		# Size uses intrinsic texture dimensions, not layout JSON width/height
	if _layout_boxes.has("reroll"):
		var r = GameState.resolve_box(_layout_boxes["reroll"], vp_size, _layout_aspect_key)
		reroll_button.position = Vector2(r["x"], r["y"])
		# Size uses intrinsic texture dimensions, not layout JSON width/height
	if _layout_boxes.has("settings"):
		var r = GameState.resolve_box(_layout_boxes["settings"], vp_size, _layout_aspect_key)
		back_button.position = Vector2(r["x"], r["y"])
		back_button.size = Vector2(r["width"], r["height"])
	# Hide UI elements for entrance animation
	if _is_first_state_update:
		energy_bar.modulate.a = 0.0
		reroll_button.modulate.a = 0.0
		back_button.modulate.a = 0.0

	_apply_background()

func _get_available_aspect_keys() -> Array[String]:
	return GameState.get_available_gameplay_aspects()

func _refresh_layout_data():
	_layout_aspect_key = _get_matched_aspect_key()
	_layout_boxes = GameState.get_scene_boxes("gameplay")

func _apply_layout(animated_hand: bool):
	if _available_layout_aspects.is_empty():
		_available_layout_aspects = GameState.get_available_gameplay_aspects()
	if _available_layout_aspects.is_empty():
		return
	_refresh_layout_data()
	_set_initial_positions()
	_layout_existing_heroes()
	_layout_hand_cards(animated_hand)
	if _dev_visible:
		_update_dev_panel()

func _layout_existing_heroes():
	var vp_size = get_viewport().get_visible_rect().size
	for slot in enemy_heroes.keys():
		var key = "enemy%d" % int(slot)
		if _layout_boxes.has(key):
			var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
			var hero = enemy_heroes[slot]
			hero.position = Vector2(r["x"], r["y"])
			hero.size = Vector2(r["width"], r["height"])
			hero.apply_layout_size(Vector2(r["width"], r["height"]))
	for slot in my_heroes.keys():
		var key = "hero%d" % int(slot)
		if _layout_boxes.has(key):
			var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
			var hero = my_heroes[slot]
			hero.position = Vector2(r["x"], r["y"])
			hero.size = Vector2(r["width"], r["height"])
			hero.apply_layout_size(Vector2(r["width"], r["height"]))

func _apply_background():
	var bg_slug = GameState.get_scene_background("gameplay")
	if bg_slug.is_empty():
		$Background.texture = null
		return
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

# --- Entrance Animation ---

func _play_entrance_animation():
	# Fade out the black overlay
	var fade_tween = create_tween()
	fade_tween.tween_property(fade_rect, "color:a", 0.0, 0.5)

	# Animate heroes with stagger
	var hero_delay = 0.3
	var all_heroes = []
	all_heroes.append_array(enemy_heroes.values())
	all_heroes.append_array(my_heroes.values())
	for hero in all_heroes:
		var tween = create_tween().set_parallel(true)
		tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
		tween.tween_property(hero, "modulate:a", 1.0, 0.4).set_delay(hero_delay)
		tween.tween_property(hero, "scale", Vector2(1.0, 1.0), 0.4).set_delay(hero_delay)
		hero_delay += 0.1

	# Animate cards sliding up with stagger
	var card_delay = 0.6
	for card in hand_cards:
		var final_y = card.position.y - 200
		var tween = create_tween().set_parallel(true)
		tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
		tween.tween_property(card, "modulate:a", 1.0, 0.35).set_delay(card_delay)
		tween.tween_property(card, "position:y", final_y, 0.45).set_delay(card_delay)
		card_delay += 0.08

	# Animate UI elements
	_animate_ui_element(energy_bar, 0.7, Vector2(0, 30))
	_animate_ui_element(reroll_button, 0.8, Vector2(0, 30))
	_animate_ui_element(back_button, 0.75, Vector2(0, -20))

func _animate_ui_element(element: Control, delay: float, offset: Vector2):
	var final_pos = element.position
	element.position += offset
	var tween = create_tween().set_parallel(true)
	tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tween.tween_property(element, "modulate:a", 1.0, 0.35).set_delay(delay)
	tween.tween_property(element, "position", final_pos, 0.4).set_delay(delay)

# --- Dev Panel (desktop only, toggle with F3) ---

func _get_matched_aspect_key() -> String:
	return GameState.forced_gameplay_aspect_key if not GameState.forced_gameplay_aspect_key.is_empty() else "9-16"

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
	lines.append("Forced: %s" % (GameState.forced_gameplay_aspect_key if not GameState.forced_gameplay_aspect_key.is_empty() else "[color=gray]auto[/color]"))
	lines.append("[color=gray]F4 next  Shift+F4 previous  F5 auto[/color]")
	lines.append("")

	lines.append("[b]Available aspects:[/b]")
	for key in GameState.get_available_gameplay_aspects():
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
