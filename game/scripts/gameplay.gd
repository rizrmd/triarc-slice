extends Control
## Gameplay - Main battle scene with heroes, hand, and energy

signal back_requested

@onready var heroes_container: Control = $HeroesContainer
@onready var hand_container: Control = $HandContainer
@onready var hero_detail_placeholder: ColorRect = $UIOverlay/HeroDetailPlaceholder
@onready var energy_bar: TextureRect = $UIOverlay/EnergyBar
@onready var reroll_button: TextureButton = $UIOverlay/RerollButton
@onready var back_button: Button = $UIOverlay/BackButton
@onready var fade_rect: ColorRect = $UIOverlay/FadeRect
@onready var info_animap: AnimapPlayer = $InfoAnimap
@onready var time_animap: AnimapPlayer = $TimeAnimap

const HERO_SCENE = preload("res://scenes/hero.tscn")
const ACTION_CARD_SCENE = preload("res://scenes/action_card.tscn")
const HAND_REFLOW_DURATION := 0.22
const PING_REQUEST_INTERVAL_MS := 3000
const PING_TIMEOUT_MS := 10000
const PING_SAMPLE_WINDOW := 4

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
var _rerolling: bool = false
var _reroll_animating: bool = false
var _reroll_entrance_pending: bool = false

# Drag state
var _dragging_card = null
var _hovered_hero: Node = null
var _hover_tween: Tween = null
var _selected_hero: Hero = null
var _dragging_info: bool = false
var _info_drag_started: bool = false
var _info_drag_offset: Vector2 = Vector2.ZERO
var _info_press_position: Vector2 = Vector2.ZERO
var _info_drag_start_pos: Vector2 = Vector2.ZERO
var _info_hover_target: Control = null
var _info_drag_virtual_pos: Vector2 = Vector2.ZERO

const INFO_DRAG_THRESHOLD := 8.0

# Pre-targeting system - hero slot -> enemy slot mapping
var _hero_targets: Dictionary = {}  # hero slot index -> enemy slot index
var _default_targets: Dictionary = {0: 0, 1: 1, 2: 2}  # default: hero slot N targets enemy slot N

# Time elapsed
var _time_elapsed_sec: float = 0.0
var _time_text_layer_id: String = ""
var _server_match_started_at_ms: int = 0
var _time_minutes_label: Label = null
var _time_colon_label: Label = null
var _time_seconds_label: Label = null

# Dev panel
var _dev_panel: PanelContainer = null
var _dev_label: RichTextLabel = null
var _dev_visible: bool = false
var _ping_label: Label = null
var _pending_ping_sent_at_ms: int = -1
var _next_ping_probe_at_ms: int = 0
var _ping_samples: Array[int] = []
var _display_ping_ms: int = -1

# HP change filtering to prevent random/small damage ticks
var _last_known_hp: Dictionary = {}  # hero_instance_id -> hp
const MIN_DAMAGE_THRESHOLD := 10  # Ignore damage < 10 (likely DoT ticks or sync noise)
func _ready():
	add_to_group("gameplay")

	reroll_button.pressed.connect(_on_reroll_pressed)
	reroll_button.button_down.connect(func(): reroll_button.modulate = Color(0.8, 0.8, 0.8, 1.0))
	reroll_button.button_up.connect(func(): reroll_button.modulate = Color(1.0, 1.0, 1.0, 1.0))
	back_button.pressed.connect(_on_back_pressed)
	GameState.gameplay_aspect_changed.connect(_on_gameplay_aspect_changed)

	# Connect to GameState WebSocket messages
	GameState.ws_message_received.connect(_on_ws_message)

	_available_layout_aspects = _get_available_aspect_keys()
	_refresh_layout_data()
	_layout_ready = true
	_apply_layout(false)
	_create_ping_label()
	_create_dev_panel()
	_setup_info_animap()
	_setup_time_animap()
	_update_hero_detail_placeholder()

	# Request initial match state (normal online mode)
	if not GameState.current_match_id.is_empty():
		_pending_ping_sent_at_ms = _now_ms()
		_next_ping_probe_at_ms = _pending_ping_sent_at_ms + PING_REQUEST_INTERVAL_MS
		GameState.send_json({
			"type": "get_match_state",
			"match_id": GameState.current_match_id
		})

func _process(delta):
	_update_time_elapsed(delta)
	if _dragging_info:
		_update_info_drag()
	if _dragging_card:
		_update_drag_hover()

	# Normal online mode - Poll WebSocket messages
	if GameState.ws:
		GameState.ws.poll()
		var state = GameState.ws.get_ready_state()
		if state == WebSocketPeer.STATE_OPEN:
			_update_ping_probe()
			while GameState.ws.get_available_packet_count() > 0:
				var msg = GameState.ws.get_packet().get_string_from_utf8()
				_on_ws_message(msg)
		elif state == WebSocketPeer.STATE_CLOSED:
			print("[Gameplay] WebSocket disconnected")
			GameState.ws = null
			_on_disconnected()

func _input(event: InputEvent):
	# Normal input handling
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			if _is_point_over_info_animap(event.position):
				_dragging_info = true
				_info_drag_started = false
				_info_press_position = event.position
				_info_drag_offset = event.position - info_animap.global_position
				_info_drag_start_pos = info_animap.global_position
				if info_animap.has_state("dragging"):
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

func _unhandled_input(event: InputEvent):
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F3:
			_toggle_dev_panel()
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var mouse_pos = get_global_mouse_position()
		# Normal gameplay - click on ally hero (enemy clicks handled via hero_clicked signal)
		var clicked_hero = _get_my_hero_at_point(mouse_pos)
		if clicked_hero:
			_set_selected_hero(clicked_hero)
		else:
			_clear_selected_hero()

func _notification(what: int):
	if what == NOTIFICATION_RESIZED and _layout_ready:
		_apply_layout(false)

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
	_resolve_ping_probe()
	var match_data = data.get("match", {})
	var heroes_data = data.get("heroes", [])
	var team_states = data.get("team_states", [])
	var hand_data = data.get("hand", [])
	var casts = data.get("casts", [])
	var statuses = data.get("statuses", [])

	var match_started_at = int(match_data.get("started_at", 0))
	if match_started_at > 0:
		_server_match_started_at_ms = match_started_at
		_update_time_elapsed(0.0)
	
	# Update team energy
	for team_state in team_states:
		if team_state.get("team") == GameState.current_team:
			_tween_energy(team_state.get("energy", 0))
			max_energy = team_state.get("energy_max", 10)
	
	# Update heroes - with HP filtering to prevent random small damage
	for hero_data in heroes_data:
		var slot = hero_data.get("slot_index", 0)
		var team = hero_data.get("team", 0)
		var is_enemy = (team != GameState.current_team)
		var hero_id = hero_data.get("hero_instance_id", "")
		
		# Filter: Skip small HP changes that are likely DoT ticks or sync noise
		if _last_known_hp.has(hero_id):
			var old_hp = _last_known_hp[hero_id]
			var new_hp = hero_data.get("hp_current", old_hp)
			var delta = old_hp - new_hp
			
			# Ignore small damage (< 10) - likely DoT or server sync noise
			if delta > 0 and delta < MIN_DAMAGE_THRESHOLD:
				hero_data["hp_current"] = old_hp  # Keep old HP
		
		_last_known_hp[hero_id] = hero_data.get("hp_current", 0)
		
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

	# Position and scale based on layout from data/scene/gameplay/layout.json
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
	# Skip updates during reroll exit/entrance animation
	if _rerolling or _reroll_animating:
		return

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
			elif _reroll_entrance_pending:
				card.modulate.a = 0.0
				card.position.x += 300
		else:
			existing_by_key.erase(card_key)
			card.size = target_size
			_move_hand_card(card, target_pos, true)

		card.set_enabled(card.can_afford(current_energy))
		next_hand_cards.append(card)

	for stale_card in existing_by_key.values():
		stale_card.queue_free()

	hand_cards = next_hand_cards

	if _reroll_entrance_pending:
		_reroll_entrance_pending = false
		_play_reroll_entrance()

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

## Show casting indicator on hero (wrapper for hero._show_casting)
func _show_casting_indicator(hero: Hero, action_slug: String):
	var cast_duration_ms = 1500  # 1.5 detik cast time
	hero._show_casting("cast_%s_%d" % [action_slug, Time.get_ticks_msec()], cast_duration_ms, action_slug)

func _on_card_drag_started(_card):
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
		# Cast action using pre-targeting system (preset target from hero selection)
		_cast_action_with_preset_target(dropped_on_target, card)

func _highlight_valid_targets(_target_rule: String):
	for hero in my_heroes.values():
		hero.set_char_brightness(0.4)

## Cast action using pre-targeting system (preset target from hero selection)
func _cast_action_with_preset_target(caster_hero: Hero, card: Control):
	var target_slot = _get_hero_target(caster_hero.slot_index)
	
	# Show casting indicator on the caster hero
	_show_casting_indicator(caster_hero, card.action_slug)
	
	# Track the used card so state_update won't recreate it
	_used_hand_keys.append("%s:%d" % [card.action_slug, card.slot_index])
	
	# Remove card from hand
	hand_cards.erase(card)
	_layout_hand_cards(true)
	
	# Send cast action with preset target
	GameState.send_json({
		"type": "cast_action",
		"match_id": GameState.current_match_id,
		"caster_slot": caster_hero.slot_index,
		"hand_slot_index": card.slot_index,
		"target_slot": target_slot
	})
	
	card.queue_free()
	
	# Auto-reroll when all cards are used (server grants free reroll)
	if hand_cards.is_empty():
		_reroll_entrance_pending = true
		_used_hand_keys.clear()
		_prev_server_keys.clear()
		GameState.send_json({
			"type": "reroll_hand",
			"match_id": GameState.current_match_id
		})

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

func _update_info_drag(mouse_position: Vector2 = get_global_mouse_position()):
	if not info_animap:
		return
	if not _info_drag_started and mouse_position.distance_to(_info_press_position) >= INFO_DRAG_THRESHOLD:
		_info_drag_started = true
		_info_drag_virtual_pos = _info_drag_start_pos
		info_animap.z_index = 100
		if info_animap.has_state("dragging"):
			info_animap.set_state("dragging")
		_set_info_drag_targets_dimmed()
	if not _info_drag_started:
		return
	_info_drag_virtual_pos = mouse_position - _info_drag_offset
	info_animap.global_position = _info_drag_virtual_pos
	_update_info_drag_hover()

func _finish_info_drag():
	if not _dragging_info:
		return
	var valid_drop := _info_drag_started and _info_hover_target != null
	_dragging_info = false
	_info_drag_started = false
	info_animap.z_index = 0
	if info_animap and info_animap.get_state() == "dragging":
		info_animap.set_state(AnimapLoader.DEFAULT_STATE_ID)
	_clear_info_drag_visuals()
	if info_animap:
		info_animap.visible = true
		if valid_drop:
			info_animap.global_position = _info_drag_start_pos
			_animate_info_reappear()
		else:
			_snap_info_back()
	return

func _snap_info_back():
	if not info_animap:
		return
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_BACK)
	tween.tween_property(info_animap, "global_position", _info_drag_start_pos, 0.25)

func _animate_info_reappear():
	if not info_animap:
		return
	info_animap.pivot_offset = info_animap.size / 2.0
	info_animap.scale = Vector2(0.82, 0.82)
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_BACK)
	tween.tween_property(info_animap, "scale", Vector2(1.0, 1.0), 0.22)

func _is_point_over_info_animap(point: Vector2) -> bool:
	return info_animap != null and info_animap.visible and info_animap.get_global_rect().has_point(point)

func _get_info_drag_targets() -> Array[Control]:
	var targets: Array[Control] = []
	for hero in my_heroes.values():
		targets.append(hero)
	for hero in enemy_heroes.values():
		targets.append(hero)
	for card in hand_cards:
		targets.append(card)
	return targets

func _set_info_drag_targets_dimmed():
	for target in _get_info_drag_targets():
		_set_info_target_highlight(target, false)

func _update_info_drag_hover():
	var info_rect := Rect2(_info_drag_virtual_pos, info_animap.size)
	var info_center := info_rect.get_center()
	var best_dist := INF
	var best_target: Control = null
	for target in _get_info_drag_targets():
		if info_rect.intersects(target.get_global_rect()):
			var dist = info_center.distance_to(target.get_global_rect().get_center())
			if dist < best_dist:
				best_dist = dist
				best_target = target
	if best_target == _info_hover_target:
		return
	if _info_hover_target:
		_set_info_target_highlight(_info_hover_target, false)
	_info_hover_target = best_target
	if _info_hover_target:
		_set_info_target_highlight(_info_hover_target, true)

func _clear_info_drag_visuals():
	if _info_hover_target:
		_info_hover_target = null
	for target in _get_info_drag_targets():
		_set_info_target_highlight(target, true)

func _set_info_target_highlight(target: Control, highlighted: bool):
	if target is Hero:
		(target as Hero).set_drag_dimmed(not highlighted)
	else:
		target.modulate = Color(1.0, 1.0, 1.0, 1.0) if highlighted else Color(0.4, 0.4, 0.4, 1.0)

func _clear_highlights():
	for hero in my_heroes.values():
		hero.set_char_brightness(1.0)

## Get current target for a hero slot
func _get_hero_target(hero_slot: int) -> int:
	return _hero_targets.get(hero_slot, _default_targets.get(hero_slot, hero_slot))

## Set target for a hero slot
func _set_hero_target(hero_slot: int, enemy_slot: int):
	_hero_targets[hero_slot] = enemy_slot
	_update_target_indicators()

## Update target indicators on all enemy heroes - show ALL set targets, persist even when deselected
func _update_target_indicators():
	# First, hide all target indicators on all enemies (both regular and pooled markers)
	for hero in enemy_heroes.values():
		hero.show_target_marker(false)
		hero.show_target_info(false)
		hero.hide_all_pooled_markers()
	
	# Only show markers if there is a selected ally hero
	if _selected_hero == null or not is_instance_valid(_selected_hero):
		return
	
	var selected_slot = _selected_hero.slot_index
	
	# Show target ONLY for the selected ally hero
	if not _hero_targets.has(selected_slot):
		return
	
	var target_slot = _hero_targets[selected_slot]
	
	if not enemy_heroes.has(target_slot):
		return
	
	var target_enemy = enemy_heroes[target_slot]
	# Show marker for the selected ally (offset_index = 0 since only one marker for selected hero)
	target_enemy.show_target_marker_with_offset(true, selected_slot, 0, _selected_hero.hero_name)

func _on_hero_clicked(hero: Hero):
	
	if hero.is_enemy:
		# Enemy clicked - set as target for selected ally hero
		if _selected_hero and not _selected_hero.is_dead():
			_set_hero_target(_selected_hero.slot_index, hero.slot_index)
		return
	
	if hero == null or hero.is_dead():
		_clear_selected_hero()
		return
	_set_selected_hero(hero)

func _set_selected_hero(hero: Hero):
	if _selected_hero and is_instance_valid(_selected_hero) and _selected_hero == hero:
		_clear_selected_hero()
		return
	if _selected_hero and is_instance_valid(_selected_hero) and _selected_hero != hero:
		_selected_hero.set_selected(false)
		# Hide target info on previous hero (marker persists)
		_selected_hero.show_target_info(false)
	_selected_hero = hero
	if _selected_hero and is_instance_valid(_selected_hero):
		_selected_hero.set_selected(true)
		# DO NOT auto-set target - player must manually select target by clicking enemy
		# Update target indicators to show current target (if any)
		_update_target_indicators()
	_update_hero_detail_placeholder()

func _clear_selected_hero():
	if _selected_hero and is_instance_valid(_selected_hero):
		_selected_hero.set_selected(false)
	else:
	_selected_hero = null
	_update_target_indicators()
	_update_hero_detail_placeholder()

func _update_hero_detail_placeholder():
	if hero_detail_placeholder == null:
		return
	if _selected_hero == null or not is_instance_valid(_selected_hero):
		hero_detail_placeholder.visible = false
		return
	var placeholder_rect := _get_hand_placeholder_rect()
	hero_detail_placeholder.position = placeholder_rect.position
	hero_detail_placeholder.size = placeholder_rect.size
	var label: Label = hero_detail_placeholder.get_node("PlaceholderLabel") as Label
	if label:
		label.text = "%s\n\nDetails coming soon" % _selected_hero.hero_slug.replace("-", " ").capitalize()
	hero_detail_placeholder.visible = true

func _get_hand_placeholder_rect() -> Rect2:
	var vp_size := get_viewport().get_visible_rect().size
	var first_key := "action1"
	var last_key := ""
	for i in range(5, 0, -1):
		var candidate_key := "action%d" % i
		if _layout_boxes.has(candidate_key):
			last_key = candidate_key
			break
	if not _layout_boxes.has(first_key) or last_key.is_empty():
		return Rect2(Vector2(270, 1220), Vector2(540, 540))
	var first_box: Dictionary = GameState.resolve_box(_layout_boxes[first_key], vp_size, _layout_aspect_key)
	var last_box: Dictionary = GameState.resolve_box(_layout_boxes[last_key], vp_size, _layout_aspect_key)
	var top_left: Vector2 = Vector2(float(first_box.get("x", 0.0)), float(first_box.get("y", 0.0)))
	var bottom_right: Vector2 = Vector2(
		float(last_box.get("x", 0.0)) + float(last_box.get("width", 0.0)),
		float(last_box.get("y", 0.0)) + float(last_box.get("height", 0.0))
	)
	if _layout_boxes.has("energy"):
		var energy_box: Dictionary = GameState.resolve_box(_layout_boxes["energy"], vp_size, _layout_aspect_key)
		top_left.x = min(top_left.x, float(energy_box.get("x", 0.0)))
		bottom_right.y = max(
			bottom_right.y,
			float(energy_box.get("y", 0.0)) + float(energy_box.get("height", 0.0))
		)
	if _layout_boxes.has("reroll"):
		var reroll_box: Dictionary = GameState.resolve_box(_layout_boxes["reroll"], vp_size, _layout_aspect_key)
		bottom_right.y = max(
			bottom_right.y,
			float(reroll_box.get("y", 0.0)) + float(reroll_box.get("height", 0.0))
		)
	top_left.x = max(top_left.x, 12.0)
	bottom_right.y += 50.0
	return Rect2(top_left, bottom_right - top_left)

func _get_my_hero_at_point(point: Vector2) -> Hero:
	for hero in my_heroes.values():
		if hero.get_global_rect().has_point(point):
			return hero
	return null

func _get_enemy_hero_at_point(point: Vector2) -> Hero:
	for hero in enemy_heroes.values():
		if hero.get_global_rect().has_point(point):
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
	tween.finished.connect(_on_hand_reflow_finished.bind(card.get_instance_id()))

func _on_hand_reflow_finished(card_instance_id: int):
	var card := instance_from_id(card_instance_id) as Control
	if card:
		card.remove_meta("hand_reflow_tween")

func _get_hand_card_key(slot_index: int, action_slug: String) -> String:
	return "%s::%s" % [slot_index, action_slug]

func _on_reroll_pressed():
	if _rerolling or _reroll_animating:
		return
	_rerolling = true
	reroll_button.modulate = Color(0.4, 0.4, 0.4, 1.0)
	_used_hand_keys.clear()
	_prev_server_keys.clear()
	_play_reroll_exit()
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

	GameState.return_to_hero_select_after_gameplay = (GameState.match_mode == "training")
	GameState.current_match_id = ""
	# Emit signal instead of changing scene - parent will handle removal
	back_requested.emit()

func _on_disconnected():
	_pending_ping_sent_at_ms = -1
	_ping_samples.clear()
	_display_ping_ms = -1
	_refresh_ping_label()
	GameState.return_to_hero_select_after_gameplay = (GameState.match_mode == "training")
	GameState.current_match_id = ""
	get_tree().change_scene_to_file("res://scenes/main.tscn")

func _on_match_end(winner: int):
	# Disable interactions
	reroll_button.disabled = true
	for card in hand_cards:
		card.disabled = true

	# Show result and return to main after delay
	await get_tree().create_timer(3.0).timeout
	GameState.return_to_hero_select_after_gameplay = (GameState.match_mode == "training")
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
		reroll_button.scale = Vector2(1.15, 1.15)
		reroll_button.pivot_offset = reroll_button.size / 2.0
	if _layout_boxes.has("settings"):
		var r = GameState.resolve_box(_layout_boxes["settings"], vp_size, _layout_aspect_key)
		back_button.position = Vector2(r["x"], r["y"])
		back_button.size = Vector2(r["width"], r["height"])
	if _layout_boxes.has("info") and info_animap:
		var r = GameState.resolve_box(_layout_boxes["info"], vp_size, _layout_aspect_key)
		info_animap.position = Vector2(r["x"], r["y"])
		info_animap.size = Vector2(r["width"], r["height"])
	if _layout_boxes.has("time_elapsed") and time_animap:
		var r = GameState.resolve_box(_layout_boxes["time_elapsed"], vp_size, _layout_aspect_key)
		time_animap.position = Vector2(r["x"], r["y"])
		time_animap.size = Vector2(r["width"], r["height"])
	# Hide UI elements for entrance animation
	if _is_first_state_update:
		energy_bar.modulate.a = 0.0
		reroll_button.modulate.a = 0.0
		back_button.modulate.a = 0.0
		if info_animap:
			info_animap.modulate.a = 0.0
		if time_animap:
			time_animap.modulate.a = 0.0

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
	_update_hero_detail_placeholder()
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

# --- Reroll Animation ---

func _play_reroll_exit():
	_reroll_animating = true
	if hand_cards.is_empty():
		_rerolling = false
		_reroll_animating = false
		_reroll_entrance_pending = true
		return
	# Kill any existing tweens and capture targets upfront
	var exit_targets: Array = []
	for card in hand_cards:
		var old_tween = card.get_meta("hand_reflow_tween") if card.has_meta("hand_reflow_tween") else null
		if old_tween and old_tween.is_valid():
			old_tween.kill()
			card.remove_meta("hand_reflow_tween")
		exit_targets.append(card.position.x - card.global_position.x - card.size.x)
	# Start all exit tweens immediately with stagger via delay
	var last_delay := 0.0
	for i in range(hand_cards.size()):
		var card = hand_cards[i]
		var delay = i * 0.08
		var t = create_tween().set_parallel(true)
		t.tween_property(card, "modulate:a", 0.0, 0.3) \
			.set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_SINE).set_delay(delay)
		t.tween_property(card, "position:x", exit_targets[i], 0.4) \
			.set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUINT).set_delay(delay)
		last_delay = delay
	# Wait for all animations to finish, then swap
	var total_time = last_delay + 0.4
	var wait_tween = create_tween()
	wait_tween.tween_interval(total_time)
	wait_tween.finished.connect(func():
		# Remove old cards
		for card in hand_cards:
			hand_container.remove_child(card)
			card.queue_free()
		hand_cards.clear()
		# Unblock _update_hand — next server state will build new cards with entrance
		_rerolling = false
		_reroll_animating = false
		_reroll_entrance_pending = true
	)

func _play_reroll_entrance():
	if hand_cards.is_empty():
		return
	_reroll_animating = true
	var targets: Array = []
	for card in hand_cards:
		targets.append(card.position.x - 300)
		card.visible = false
	var last_delay := 0.0
	for i in range(hand_cards.size()):
		var card = hand_cards[i]
		var final_x = targets[i]
		var delay = i * 0.12
		var t = create_tween().set_parallel(true)
		t.tween_callback(card.set.bind("visible", true)).set_delay(delay)
		t.tween_property(card, "modulate:a", 1.0, 0.35) \
			.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_SINE).set_delay(delay)
		t.tween_property(card, "position:x", final_x, 0.55) \
			.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUINT).set_delay(delay)
		last_delay = delay
	var wait_tween = create_tween()
	wait_tween.tween_interval(last_delay + 0.55)
	wait_tween.finished.connect(func():
		_reroll_animating = false
		reroll_button.modulate = Color(1.0, 1.0, 1.0, 1.0)
	)

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
	if info_animap:
		_animate_ui_element(info_animap, 0.68, Vector2(0, -20))
	if time_animap:
		_animate_ui_element(time_animap, 0.65, Vector2(0, -20))
	if _ping_label:
		_animate_ui_element(_ping_label, 0.72, Vector2(0, -20))

func _animate_ui_element(element: Control, delay: float, offset: Vector2):
	var final_pos = element.position
	element.position += offset
	var tween = create_tween().set_parallel(true)
	tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tween.tween_property(element, "modulate:a", 1.0, 0.35).set_delay(delay)
	tween.tween_property(element, "position", final_pos, 0.4).set_delay(delay)

func _setup_info_animap():
	if not info_animap:
		return
	info_animap.fit_mode = "contain"
	var info_box: Dictionary = _layout_boxes.get("info", {})
	var animap_slug := String(info_box.get("animapSlug", "info"))
	info_animap.load_animap(animap_slug)

# --- Time Elapsed ---

func _setup_time_animap():
	if not time_animap:
		return
	time_animap.fit_mode = "contain"
	time_animap.load_animap("time")
	# Find the text layer and build split labels so the colon never moves
	for layer in time_animap.animap_data.get("layers", []):
		if layer.get("type", "") == "text":
			_time_text_layer_id = layer.get("id", "")
			break
	if _time_text_layer_id.is_empty():
		return
	# Hide the original text layer
	var orig: Control = time_animap._layer_nodes.get(_time_text_layer_id)
	if orig:
		orig.visible = false
	# Read font properties from the animap layer data
	var text_layer: Dictionary = {}
	for layer in time_animap.animap_data.get("layers", []):
		if layer.get("id", "") == _time_text_layer_id:
			text_layer = layer
			break
	var font: Font = AnimapPlayer.VOLKHOV_FONT
	var font_size := int(text_layer.get("font_size", 96))
	var color := Color.from_string(String(text_layer.get("color", "#ffffff")), Color.WHITE)
	var lx := float(text_layer.get("x", 0))
	var ly := float(text_layer.get("y", 0))
	var lw := float(text_layer.get("width", 480))
	var lh := float(text_layer.get("height", 160))
	var lscale := float(text_layer.get("scale", 1.0))
	# Measure colon width to split the area
	var colon_w := font.get_string_size(":", HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	var center_x := lw / 2.0
	var half_colon := colon_w / 2.0
	# Create colon label (fixed center)
	_time_colon_label = _make_time_label(font, font_size, color, HORIZONTAL_ALIGNMENT_CENTER)
	_time_colon_label.text = ":"
	_time_colon_label.position = Vector2(lx + center_x - half_colon - lw * 0.05, ly - lh * 0.06)
	_time_colon_label.size = Vector2(colon_w, lh)
	_time_colon_label.scale = Vector2(lscale, lscale)
	time_animap.layer_root.add_child(_time_colon_label)
	# Minutes label (right-aligned, left of colon)
	_time_minutes_label = _make_time_label(font, font_size, color, HORIZONTAL_ALIGNMENT_RIGHT)
	_time_minutes_label.text = "00"
	_time_minutes_label.position = Vector2(lx - lw * 0.02, ly)
	_time_minutes_label.size = Vector2(center_x - half_colon, lh)
	_time_minutes_label.scale = Vector2(lscale, lscale)
	time_animap.layer_root.add_child(_time_minutes_label)
	# Seconds label (left-aligned, right of colon)
	_time_seconds_label = _make_time_label(font, font_size, color, HORIZONTAL_ALIGNMENT_LEFT)
	_time_seconds_label.text = "00"
	_time_seconds_label.position = Vector2(lx + center_x + half_colon - lw * 0.03, ly)
	_time_seconds_label.size = Vector2(center_x - half_colon, lh)
	_time_seconds_label.scale = Vector2(lscale, lscale)
	time_animap.layer_root.add_child(_time_seconds_label)

func _make_time_label(font: Font, font_size: int, color: Color, alignment: HorizontalAlignment) -> Label:
	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.clip_contents = false
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.horizontal_alignment = alignment
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	return label

func _update_time_elapsed(delta: float):
	if _is_first_state_update:
		return

	if _server_match_started_at_ms > 0:
		var now_ms = int(Time.get_unix_time_from_system() * 1000.0)
		_time_elapsed_sec = maxf(0.0, float(now_ms - _server_match_started_at_ms) / 1000.0)
	else:
		_time_elapsed_sec += delta

	_update_time_text()

func _update_time_text():
	if not _time_minutes_label or not _time_seconds_label:
		return
	var total_sec := int(_time_elapsed_sec)
	var minutes := total_sec / 60
	var seconds := total_sec % 60
	_time_minutes_label.text = "%02d" % minutes
	_time_seconds_label.text = "%02d" % seconds

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

func _create_ping_label():
	if _ping_label:
		return

	_ping_label = Label.new()
	_ping_label.name = "PingLabel"
	_ping_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_ping_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_ping_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ping_label.add_theme_font_size_override("font_size", 22)
	_ping_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.75))
	_ping_label.add_theme_constant_override("outline_size", 3)
	_ping_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_ping_label.offset_left = -220
	_ping_label.offset_top = 18
	_ping_label.offset_right = -24
	_ping_label.offset_bottom = 52
	if _is_first_state_update:
		_ping_label.modulate.a = 0.0
	$UIOverlay.add_child(_ping_label)
	_refresh_ping_label()

func _update_ping_probe():
	if GameState.current_match_id.is_empty():
		return

	var now_ms = _now_ms()
	if _pending_ping_sent_at_ms >= 0:
		if now_ms - _pending_ping_sent_at_ms > PING_TIMEOUT_MS:
			_pending_ping_sent_at_ms = -1
		return

	if now_ms < _next_ping_probe_at_ms:
		return

	_pending_ping_sent_at_ms = now_ms
	_next_ping_probe_at_ms = now_ms + PING_REQUEST_INTERVAL_MS
	GameState.send_json({
		"type": "get_match_state",
		"match_id": GameState.current_match_id
	})

func _resolve_ping_probe():
	if _pending_ping_sent_at_ms < 0:
		return

	var rtt_ms = max(0, _now_ms() - _pending_ping_sent_at_ms)
	_pending_ping_sent_at_ms = -1
	_ping_samples.append(rtt_ms)
	if _ping_samples.size() > PING_SAMPLE_WINDOW:
		_ping_samples.pop_front()

	var total := 0
	for sample in _ping_samples:
		total += sample
	_display_ping_ms = int(round(float(total) / float(_ping_samples.size())))
	_refresh_ping_label()

func _refresh_ping_label():
	if not _ping_label:
		return

	if _display_ping_ms < 0:
		_ping_label.text = "-- ms"
		_ping_label.add_theme_color_override("font_color", Color(0.85, 0.85, 0.85))
		return

	_ping_label.text = "%d ms" % _display_ping_ms
	var ping_color := Color(0.55, 0.96, 0.64)
	if _display_ping_ms >= 160:
		ping_color = Color(1.0, 0.82, 0.38)
	if _display_ping_ms >= 280:
		ping_color = Color(1.0, 0.48, 0.48)
	_ping_label.add_theme_color_override("font_color", ping_color)

func _now_ms() -> int:
	return Time.get_ticks_msec()

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
