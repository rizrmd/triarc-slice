extends Control
## Gameplay - Main battle scene with heroes, hand, and energy

signal back_requested

@onready var heroes_container: Control = $HeroesContainer
@onready var hand_container: Control = $HandContainer
@onready var hero_detail_placeholder: ColorRect = $UIOverlay/HeroDetailPlaceholder
@onready var energy_bar: TextureRect = $UIOverlay/EnergyBar
@onready var reroll_button: TextureButton = $UIOverlay/RerollButton
@onready var back_button: Button = $UIOverlay/BackButton
@onready var action_dropdown: Button = $UIOverlay/ActionDropdown
@onready var enemy_dropdown: Button = $UIOverlay/EnemyDropdown
@onready var apply_enemies_btn: Button = $UIOverlay/ApplyEnemies
var _action_popup: PopupMenu
var _enemy_popup: PopupMenu
var _original_enemy_heroes: Array[String] = []
@onready var fade_rect: ColorRect = $UIOverlay/FadeRect
@onready var info_animap: AnimapPlayer = $InfoAnimap
@onready var time_animap: AnimapPlayer = $TimeAnimap

# Target warning label
var _target_warning_label: Label = null
var _target_warning_hero_slot: int = -1  # Track which hero slot the warning is for

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
var _hero_targets: Dictionary = {}  # hero slot index -> enemy slot index (only set when player explicitly selects)

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

# Debug action dropdown - pool of actions to override cards with (empty = all)
var _debug_override_action: String = ""
var _debug_action_pool: Array[String] = []
var _debug_enemy_heroes: Array[String] = []

# HP change filtering to prevent random/small damage ticks
var _last_known_hp: Dictionary = {}  # hero_instance_id -> hp
const MIN_DAMAGE_THRESHOLD := 10  # Ignore damage < 10 (likely DoT ticks or sync noise)

# Track local cast to prevent server updates from overwriting pie chart
var _local_cast_cast_id: String = ""
var _local_cast_hero_id: String = ""
var _local_cast_skip_until_ms: int = 0  # Skip server casts for this hero until this timestamp

# Track actions being cast - key is hero_instance_id, value is {action_slug, until_ms}
var _casting_by_hero: Dictionary = {}

# Track which action slugs are currently casting (to block same action)
var _casting_action_slugs: Array = []  # List of action slugs being cast

# Queue for casts that need to wait for same action to finish
var _queued_casts: Array = []  # Array of {hero, action_slug} to cast later

# Track heroes that are currently casting (hero_instance_id -> action_slug)
var _casting_heroes: Dictionary = {}  # hero_instance_id -> action_slug

# Cooldown per hero after casting - block server casts for a short time
var _hero_cooldown_until: Dictionary = {}  # hero_instance_id -> timestamp_ms when cooldown ends

func _ready():
	add_to_group("gameplay")

	reroll_button.pressed.connect(_on_reroll_pressed)
	reroll_button.button_down.connect(func(): reroll_button.modulate = Color(0.8, 0.8, 0.8, 1.0))
	reroll_button.button_up.connect(func(): reroll_button.modulate = Color(1.0, 1.0, 1.0, 1.0))
	back_button.pressed.connect(_on_back_pressed)
	if action_dropdown != null:
		action_dropdown.pressed.connect(_toggle_action_popup)
	if enemy_dropdown != null:
		enemy_dropdown.pressed.connect(_toggle_enemy_popup)
	if apply_enemies_btn != null:
		apply_enemies_btn.pressed.connect(_restart_training_with_enemies)
	GameState.gameplay_aspect_changed.connect(_on_gameplay_aspect_changed)

	# Connect to GameState WebSocket messages
	GameState.ws_message_received.connect(_on_ws_message)

	_available_layout_aspects = _get_available_aspect_keys()
	_refresh_layout_data()
	_layout_ready = true
	_apply_layout(false)
	_create_ping_label()
	_create_dev_panel()
	_create_target_warning_label()
	_setup_info_animap()
	_setup_time_animap()
	_update_hero_detail_placeholder()
	_populate_action_dropdown()
	_populate_enemy_dropdown()

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
			# Click-outside dismisses the hero detail pane. Runs in _input so
			# clicks absorbed by UI controls (hand cards, buttons) still dismiss.
			if _selected_hero != null and is_instance_valid(_selected_hero):
				var world_pos := get_global_mouse_position()
				var on_detail := hero_detail_placeholder != null \
					and hero_detail_placeholder.visible \
					and hero_detail_placeholder.get_global_rect().has_point(event.position)
				var on_any_hero := _get_my_hero_at_point(world_pos) != null \
					or _get_enemy_hero_at_point(world_pos) != null
				if not on_detail and not on_any_hero:
					_clear_selected_hero()
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
			pass
		"error":
			pass  # Silently ignore server errors for now

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
	
	# Update team energy + hero targets (server is source of truth)
	for team_state in team_states:
		if team_state.get("team") == GameState.current_team:
			_tween_energy(team_state.get("energy", 0))
			max_energy = team_state.get("energy_max", 10)
			_hydrate_hero_targets_from_server(team_state.get("hero_targets", {}))
	
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
	
	# Update target warning visibility
	_update_target_warning()
	
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
		var existing = dict[slot]
		# If hero slug changed (e.g. enemy swap), recreate
		var new_slug = hero_data.get("hero_slug", "")
		if not new_slug.is_empty() and existing.hero_slug != new_slug:
			existing.queue_free()
			dict.erase(slot)
		else:
			return existing

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
	
	# Skip update if a card is being dragged (guard against freed cards)
	for card in hand_cards:
		if is_instance_valid(card) and card.is_dragging:
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
	# Only filter when we have previous keys to compare against (skip on first update)
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
		if is_instance_valid(card) and not card.is_queued_for_deletion():
			existing_by_key[_get_hand_card_key(card.slot_index, card.action_slug)] = card

	var next_hand_cards: Array = []

	# Reuse existing cards when possible so hand reflow can animate.
	# When debug override is active, we still reuse but re-apply setup
	var existing_by_slot: Dictionary = {}
	var reused_cards: Array = []  # Track cards that were reused to avoid cleanup
	for card in hand_cards:
		if is_instance_valid(card) and not card.is_queued_for_deletion():
			existing_by_slot[card.slot_index] = card
	
	for card_data in filtered_hand:
		var slot_index: int = int(card_data.get("slot_index", 0))
		# Use slot_index to determine layout position (slot 1 -> action1, etc.)
		var key = "action%d" % slot_index
		if not _layout_boxes.has(key):
			continue

		var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
		
		var card: Control = existing_by_slot.get(slot_index, null)

		var target_pos = Vector2(r["x"], r["y"])
		var target_size = Vector2(r["width"], r["height"])

		if card == null:
			# Apply debug override only when creating new cards
			if not _debug_action_pool.is_empty():
				var pool_action = _get_random_pool_action()
				card_data["action_slug"] = pool_action
				card_data["action_name"] = pool_action.replace("-", " ").capitalize()
			elif not _debug_override_action.is_empty():
				card_data["action_slug"] = _debug_override_action
				card_data["action_name"] = _debug_override_action.replace("-", " ").capitalize()

			card = ACTION_CARD_SCENE.instantiate()
			hand_container.add_child(card)

			# Set size from layout before building visuals
			card.size = target_size
			card.position = target_pos
			card.setup(card_data)

			if _is_first_state_update:
				card.modulate.a = 0.0
				card.position.y += 200
			elif _reroll_entrance_pending:
				card.modulate.a = 0.0
				card.position.x += 300
		else:
			existing_by_slot.erase(slot_index)
			reused_cards.append(card)  # Mark as reused
			card.size = target_size
			# Always animate card to new position for proper reflow
			card.position = card.position  # Reset to trigger position change
			_move_hand_card(card, target_pos, true)

		# Connect signals for ALL cards (both new and reused) - only if not already connected
		if not card.card_drag_started.is_connected(_on_card_drag_started):
			card.card_drag_started.connect(_on_card_drag_started)
			card.card_drag_ended.connect(_on_card_drag_ended)
			card.card_drop_invalid.connect(_on_card_drop_invalid)

		card.set_enabled(card.can_afford(current_energy))
		if is_instance_valid(card) and not card.is_queued_for_deletion():
			next_hand_cards.append(card)

	# When override is active, skip stale card cleanup because existing_by_key
	# has wrong keys (doesn't account for override). We use slot-based matching
	# via existing_by_slot which handles stale cards properly.
	if _debug_override_action.is_empty() and _debug_action_pool.is_empty():
		# Only queue_free cards that were NOT reused
		var stale_count = 0
		for stale_card in existing_by_key.values():
			if is_instance_valid(stale_card) and not stale_card.is_queued_for_deletion():
				if not stale_card in reused_cards:
					stale_count += 1
					stale_card.queue_free()

	hand_cards = next_hand_cards
	
	# Cleanup orphan cards - cards in container but not in hand_cards array
	var valid_cards_set = []
	for c in hand_cards:
		valid_cards_set.append(c.get_instance_id())
	for child in hand_container.get_children():
		if child.get_instance_id() not in valid_cards_set:
			hand_container.remove_child(child)
			child.queue_free()

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
	var current_time_ms = Time.get_ticks_msec()

	for cast in casts:
		if cast.get("resolved", false):
			continue

		var cast_id = cast.get("cast_id", "")
		var caster_id = cast.get("caster_hero_instance_id", "")
		
		# Cleanup expired casts first
		_cleanup_expired_casts()
		
		# Skip if this hero is currently casting a local action
		if _casting_by_hero.has(caster_id):
			var cast_info = _casting_by_hero[caster_id]
			var until_ms = cast_info.get("until_ms", 0)
			if current_time_ms < until_ms:
				continue  # Skip server cast, local animation is in progress
		
		# Skip if hero is in cooldown period after local cast
		if _hero_cooldown_until.has(caster_id):
			var cooldown_end = _hero_cooldown_until[caster_id]
			if current_time_ms < cooldown_end:
				continue  # Skip server cast, hero is in cooldown

		var started_at = int(cast.get("started_at", 0))
		var resolves_at = int(cast.get("resolves_at", 0))

		if resolves_at <= now_ms:
			continue

		var total_ms = resolves_at - started_at
		var action_slug = cast.get("action_slug", "")
		var caster_hero = _find_hero_by_instance_id(caster_id)
		
		# Find target hero from cast data
		var target_hero: Hero = null
		var target_id = cast.get("target_hero_instance_id", "")
		if not target_id.is_empty():
			target_hero = _find_hero_by_instance_id(target_id)
		
		if caster_hero:
			caster_hero._show_casting(cast_id, total_ms, action_slug, target_hero)

## Cleanup expired casts from tracking
func _cleanup_expired_casts():
	var current_time_ms = Time.get_ticks_msec()
	var expired_heroes = []
	for hero_id in _casting_by_hero.keys():
		var cast_info = _casting_by_hero[hero_id]
		if cast_info.get("until_ms", 0) < current_time_ms:
			expired_heroes.append(hero_id)
	for hero_id in expired_heroes:
		var action_slug = _casting_by_hero[hero_id].get("action_slug", "")
		_casting_action_slugs.erase(action_slug)
		_casting_by_hero.erase(hero_id)
		_casting_heroes.erase(hero_id)
		# Clear _current_cast_id on the hero node to prevent desync with is_casting()
		var hero_node = _find_hero_by_instance_id(hero_id)
		if hero_node:
			hero_node._current_cast_id = ""
			hero_node._cast_indicator.visible = false
		# Add cooldown to block server casts for 2 seconds (same as local cast skip)
		_hero_cooldown_until[hero_id] = current_time_ms + 2000
	
	# Process queued casts - only start if hero is no longer casting
	if not _queued_casts.is_empty():
		_process_queued_casts()

## Process queued casts that were waiting for hero to be free
func _process_queued_casts():
	var current_time_ms = Time.get_ticks_msec()
	var remaining_queue = []
	
	for queued in _queued_casts:
		var action_slug = queued.get("action_slug", "")
		var hero: Hero = queued.get("hero")
		var target_hero: Hero = queued.get("target_hero")

		# Check if this hero is still casting (check BOTH tracking dict AND _current_cast_id for desync safety)
		if _casting_heroes.has(hero.hero_instance_id) or hero._current_cast_id != "":
			remaining_queue.append(queued)  # Hero still busy
			continue
		
		# Hero is free, start casting
		if is_instance_valid(hero):
			var cast_duration_ms = 1500
			var cast_id = "cast_%s_%d" % [action_slug, current_time_ms]
			_local_cast_cast_id = cast_id
			_local_cast_hero_id = hero.hero_instance_id
			_local_cast_skip_until_ms = current_time_ms + 2000
			_casting_by_hero[hero.hero_instance_id] = {"action_slug": action_slug, "until_ms": current_time_ms + cast_duration_ms}
			_casting_heroes[hero.hero_instance_id] = action_slug
			if not action_slug in _casting_action_slugs:
				_casting_action_slugs.append(action_slug)
			hero._show_casting(cast_id, cast_duration_ms, action_slug, target_hero)

	_queued_casts = remaining_queue

func _find_hero_by_instance_id(instance_id: String) -> Node:
	for hero in my_heroes.values():
		if hero.hero_instance_id == instance_id:
			return hero
	for hero in enemy_heroes.values():
		if hero.hero_instance_id == instance_id:
			return hero
	return null

## Show casting indicator on hero (wrapper for hero._show_casting)
func _show_casting_indicator(caster_hero: Hero, action_slug: String, target_hero: Hero = null):
	# Check if this hero is already casting (check BOTH tracking dict AND _current_cast_id for desync safety)
	# This prevents starting a new cast when server busy state is active but _casting_heroes wasn't updated
	if _casting_heroes.has(caster_hero.hero_instance_id) or caster_hero._current_cast_id != "":
		_queued_casts.append({"hero": caster_hero, "action_slug": action_slug, "target_hero": target_hero, "timestamp": Time.get_ticks_msec()})
		return
	
	# Clear cooldown when starting new cast
	_hero_cooldown_until.erase(caster_hero.hero_instance_id)
	
	var cast_duration_ms = 1500  # 1.5 detik cast time
	var cast_id = "cast_%s_%d" % [action_slug, Time.get_ticks_msec()]
	# Track local cast to prevent server updates from overwriting
	_local_cast_cast_id = cast_id
	_local_cast_hero_id = caster_hero.hero_instance_id
	_local_cast_skip_until_ms = Time.get_ticks_msec() + 2000  # Skip server casts for 2 seconds
	# Track by hero to support multiple simultaneous casts
	_casting_by_hero[caster_hero.hero_instance_id] = {"action_slug": action_slug, "until_ms": Time.get_ticks_msec() + cast_duration_ms}
	_casting_heroes[caster_hero.hero_instance_id] = action_slug
	# Track action slug to block same action being cast twice
	if not action_slug in _casting_action_slugs:
		_casting_action_slugs.append(action_slug)
	caster_hero._show_casting(cast_id, cast_duration_ms, action_slug, target_hero)

func _on_card_drag_started(_card):
	# Cleanup expired casts first
	_cleanup_expired_casts()
	
	# Allow drag even if same action is being cast - will be queued
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
		# Check if player has explicitly set a target for this hero
		var hero_slot = dropped_on_target.slot_index
		var has_explicit_target = _hero_targets.has(hero_slot)
		
		if not has_explicit_target:
			# Hero doesn't have explicitly set target - snap card back and show warning
			_show_single_target_warning(dropped_on_target)
			_snap_card_back(card)
			return
		
		# Hide card before casting (card will disappear)
		card.visible = false
		
		# Cast action using pre-targeting system (preset target from hero selection)
		_cast_action_with_preset_target(dropped_on_target, card)

func _highlight_valid_targets(_target_rule: String):
	for hero in my_heroes.values():
		hero.set_char_brightness(0.4)

func _on_card_drop_invalid(card: Control, attempted_hero: Control):
	# Check if the hero has explicitly set target - if not, show warning
	if not _hero_targets.has(attempted_hero.slot_index):
		_show_single_target_warning(attempted_hero)
		_snap_card_back(card)

## Cast action using pre-targeting system (preset target from hero selection)
func _cast_action_with_preset_target(caster_hero: Hero, card: Control):
	var target_slot = _get_hero_target(caster_hero.slot_index)
	
	# Find the target hero node
	var target_hero: Hero = null
	if target_slot >= 0 and enemy_heroes.has(target_slot):
		target_hero = enemy_heroes[target_slot]
	
	# Get the actual action to send - use card's action_slug (already overridden if pool/override active)
	var action_to_send = card.action_slug
	
	# Show casting indicator on the caster hero with target reference for VFX
	_show_casting_indicator(caster_hero, action_to_send, target_hero)
	
	# Track the used card so state_update won't recreate it
	_used_hand_keys.append("%s:%d" % [action_to_send, card.slot_index])
	
	# Send cast action with preset target
	var cast_data = {
		"type": "cast_action",
		"match_id": GameState.current_match_id,
		"caster_slot": caster_hero.slot_index,
		"hand_slot_index": card.slot_index,
		"target_slot": target_slot
	}
	GameState.send_json(cast_data)
	
	# Remove card from tracking BEFORE queue_free (queue_free is async)
	hand_cards.erase(card)
	card.queue_free()
	_layout_hand_cards(true)
	
	# Auto-reroll when all cards are used (server grants free reroll)
	# Check for valid cards only
	var has_valid_cards = false
	for c in hand_cards:
		if is_instance_valid(c):
			has_valid_cards = true
			break
	if not has_valid_cards:
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

## Get current target for a hero slot (-1 if not set)
func _get_hero_target(hero_slot: int) -> int:
	return _hero_targets.get(hero_slot, -1)  # -1 means no target set

## Replace local target cache with server-authoritative state.
## Server sends keys as JSON strings ("1"/"2"/"3"); convert back to ints.
func _hydrate_hero_targets_from_server(server_targets) -> void:
	if server_targets == null:
		return
	var new_targets: Dictionary = {}
	for key in server_targets.keys():
		var caster_slot := int(key)
		var enemy_slot := int(server_targets[key])
		new_targets[caster_slot] = enemy_slot
	if new_targets == _hero_targets:
		return
	_hero_targets = new_targets
	_update_target_indicators()
	_update_target_warning()



## Set target for a hero slot
func _set_hero_target(hero_slot: int, enemy_slot: int):
	_hero_targets[hero_slot] = enemy_slot
	_update_target_indicators()
	# Hide warning if this hero was the one showing the warning
	if _target_warning_hero_slot == hero_slot:
		_fade_out_target_warning()
	_update_target_warning()  # Hide warning if all targets are now set
	# Persist target server-side so it survives client restart / reconnect
	if not GameState.current_match_id.is_empty():
		GameState.send_json({
			"type": "set_hero_target",
			"match_id": GameState.current_match_id,
			"caster_slot": hero_slot,
			"target_slot": enemy_slot,
		})

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
	_update_target_warning()
	_update_hero_detail_placeholder()

func _clear_selected_hero():
	if _selected_hero and is_instance_valid(_selected_hero):
		_selected_hero.set_selected(false)
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
	for card in hand_cards:
		if not is_instance_valid(card):
			continue
		# Use card's slot_index to determine layout position
		var key = "action%d" % card.slot_index
		if not _layout_boxes.has(key):
			continue
		var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
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
	# Keep _debug_override_action active after reroll so new cards use it
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

	GameState.return_to_hero_select_after_gameplay = false
	GameState.current_match_id = ""
	GameState.return_to_main()

func _on_disconnected():
	_pending_ping_sent_at_ms = -1
	_ping_samples.clear()
	_display_ping_ms = -1
	_refresh_ping_label()
	GameState.return_to_hero_select_after_gameplay = false
	GameState.current_match_id = ""
	GameState.return_to_main()

func _on_match_end(winner: int):
	# Disable interactions
	reroll_button.disabled = true
	for card in hand_cards:
		card.disabled = true

	# Show result and return to main after delay
	await get_tree().create_timer(3.0).timeout
	GameState.return_to_hero_select_after_gameplay = false
	GameState.return_to_main()

func _set_initial_positions():
	if energy_bar == null or reroll_button == null or back_button == null:
		return
	var vp_size = get_viewport().get_visible_rect().size
	if _layout_boxes.has("energy"):
		var r = GameState.resolve_box(_layout_boxes["energy"], vp_size, _layout_aspect_key)
		energy_bar.position = Vector2(r["x"], r["y"])
		energy_bar.size = Vector2(r["width"], r["height"])
	if _layout_boxes.has("reroll"):
		var r = GameState.resolve_box(_layout_boxes["reroll"], vp_size, _layout_aspect_key)
		reroll_button.position = Vector2(r["x"], r["y"])
		reroll_button.size = Vector2(r["width"], r["height"])
		reroll_button.scale = Vector2(1.0, 1.0)
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
		# Keep _debug_override_action active so new cards use it
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

func _create_target_warning_label():
	if _target_warning_label:
		return
	_target_warning_label = Label.new()
	_target_warning_label.name = "TargetWarningLabel"
	_target_warning_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_target_warning_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_target_warning_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_target_warning_label.add_theme_font_size_override("font_size", 26)
	_target_warning_label.add_theme_color_override("font_color", Color(1.0, 0.6, 0.2, 1.0))  # Orange warning
	_target_warning_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	_target_warning_label.add_theme_constant_override("outline_size", 4)
	_target_warning_label.text = "Pilih target enemy untuk hero ally sebelum menggunakan card!"
	_target_warning_label.visible = false
	_target_warning_label.z_index = 100
	_target_warning_label.set_anchors_preset(Control.PRESET_CENTER)
	_target_warning_label.offset_top = -200
	_target_warning_label.offset_bottom = -150
	_target_warning_label.offset_left = -350
	_target_warning_label.offset_right = 350
	$UIOverlay.add_child(_target_warning_label)

func _update_target_warning():
	if not _target_warning_label:
		return
	# Only hide warning if it's showing for a specific hero that now has target
	# Do NOT show warning automatically - warning is only shown when card is dropped without target
	if _target_warning_hero_slot >= 0:
		if _hero_targets.has(_target_warning_hero_slot):
			# Hero now has explicit target, hide warning
			_target_warning_hero_slot = -1
			_target_warning_label.visible = false

func _all_allies_have_targets() -> bool:
	# Check if all ally heroes have explicitly set targets
	for hero in my_heroes.values():
		if hero.is_dead():
			continue  # Skip dead heroes
		# Check if player has explicitly set a target for this hero
		if not _hero_targets.has(hero.slot_index):
			return false
	return true

func _show_target_warning_animation():
	if not _target_warning_label:
		return
	_target_warning_label.visible = true
	_target_warning_label.modulate.a = 1.0
	_target_warning_label.scale = Vector2(0.8, 0.8)
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_BACK)
	tween.tween_property(_target_warning_label, "scale", Vector2(1.1, 1.1), 0.15)
	tween.tween_property(_target_warning_label, "scale", Vector2(1.0, 1.0), 0.1)
	# Auto-hide after 2 seconds
	await get_tree().create_timer(2.0).timeout
	_fade_out_target_warning()

func _fade_out_target_warning():
	if not _target_warning_label:
		return
	_target_warning_hero_slot = -1  # Clear hero tracking
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_SINE)
	tween.tween_property(_target_warning_label, "modulate:a", 0.0, 0.3)
	tween.tween_callback(func():
		if _target_warning_label:
			_target_warning_label.visible = false
	)

func _show_single_target_warning(hero: Hero):
	if not _target_warning_label:
		return
	_target_warning_label.text = "Select enemy target for %s first!" % hero.hero_name
	_target_warning_label.visible = true
	_target_warning_label.modulate.a = 1.0
	_target_warning_label.scale = Vector2(0.8, 0.8)
	_target_warning_hero_slot = hero.slot_index  # Track which hero this warning is for
	
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_BACK)
	tween.tween_property(_target_warning_label, "scale", Vector2(1.1, 1.1), 0.15)
	tween.tween_property(_target_warning_label, "scale", Vector2(1.0, 1.0), 0.1)

func _snap_card_back(card: Control):
	card.scale = Vector2(1.0, 1.0)
	card.modulate.a = 1.0
	card.z_index = 1
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_BACK)
	# Get target position from slot
	var vp_size = get_viewport().get_visible_rect().size
	var key = "action%d" % card.slot_index
	if _layout_boxes.has(key):
		var r = GameState.resolve_box(_layout_boxes[key], vp_size, _layout_aspect_key)
		tween.tween_property(card, "global_position", Vector2(r["x"], r["y"]), 0.3)
	else:
		# Fallback to original position
		tween.tween_property(card, "position", card.position, 0.3)

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

func _populate_action_dropdown():
	if action_dropdown == null:
		return
	_action_popup = PopupMenu.new()
	_action_popup.hide_on_checkable_item_selection = false
	_action_popup.index_pressed.connect(_on_action_popup_index_pressed)
	action_dropdown.add_child(_action_popup)
	var action_slugs = GameState.action_defs.keys()
	action_slugs.sort()
	for i in range(action_slugs.size()):
		var slug = action_slugs[i]
		var def = GameState.action_defs[slug]
		var aname = def.get("name", slug.replace("-", " ").capitalize())
		_action_popup.add_check_item(aname, i)
		_action_popup.set_item_metadata(i, slug)

func _toggle_action_popup():
	if _action_popup == null:
		return
	if _action_popup.visible:
		_action_popup.hide()
	else:
		var btn_rect = action_dropdown.get_global_rect()
		_action_popup.position = Vector2i(int(btn_rect.position.x), int(btn_rect.end.y))
		_action_popup.size = Vector2i(int(btn_rect.size.x), 0)
		_action_popup.popup()

func _on_action_popup_index_pressed(idx: int):
	_action_popup.toggle_item_checked(idx)
	# Rebuild pool from checked items
	_debug_action_pool.clear()
	for i in range(_action_popup.item_count):
		if _action_popup.is_item_checked(i):
			_debug_action_pool.append(_action_popup.get_item_metadata(i))
	# Update button text
	if _debug_action_pool.is_empty():
		_debug_override_action = ""
		action_dropdown.text = "Actions: All"
	else:
		_debug_override_action = _debug_action_pool[0]
		action_dropdown.text = "Actions: %d" % _debug_action_pool.size()
	_force_hand_rebuild()

func _force_hand_rebuild():
	_used_hand_keys.clear()
	_prev_server_keys.clear()
	for card in hand_cards:
		if is_instance_valid(card) and card.get_parent() == hand_container:
			hand_container.remove_child(card)
			card.queue_free()
	hand_cards.clear()

func _get_random_pool_action() -> String:
	if _debug_action_pool.is_empty():
		return ""
	return _debug_action_pool[randi() % _debug_action_pool.size()]

func _get_current_enemy_slugs() -> Array[String]:
	var slugs: Array[String] = []
	for hero in enemy_heroes.values():
		if is_instance_valid(hero):
			slugs.append(hero.hero_slug)
	return slugs

func _populate_enemy_dropdown():
	# Just create the popup — items are populated on first open
	if enemy_dropdown == null:
		return
	_enemy_popup = PopupMenu.new()
	_enemy_popup.hide_on_checkable_item_selection = false
	_enemy_popup.index_pressed.connect(_on_enemy_popup_index_pressed)
	enemy_dropdown.add_child(_enemy_popup)

func _rebuild_enemy_popup():
	_enemy_popup.clear()
	var hero_slugs = GameState.hero_defs.keys()
	hero_slugs.sort()
	var current_enemies = _get_current_enemy_slugs()
	# Init from current enemies if first open
	if _debug_enemy_heroes.is_empty():
		_debug_enemy_heroes = current_enemies.duplicate()
	if _original_enemy_heroes.is_empty():
		_original_enemy_heroes = current_enemies.duplicate()
	for i in range(hero_slugs.size()):
		var slug = hero_slugs[i]
		var def = GameState.hero_defs[slug]
		var hname = def.get("name", slug.replace("-", " ").capitalize())
		_enemy_popup.add_check_item(hname, i)
		_enemy_popup.set_item_metadata(i, slug)
		if slug in _debug_enemy_heroes:
			_enemy_popup.set_item_checked(i, true)
	if _debug_enemy_heroes.size() > 0:
		enemy_dropdown.text = "Enemies: %d/3" % _debug_enemy_heroes.size()
	_update_apply_button()

func _toggle_enemy_popup():
	if _enemy_popup == null:
		return
	if _enemy_popup.visible:
		_enemy_popup.hide()
	else:
		_rebuild_enemy_popup()
		var btn_rect = enemy_dropdown.get_global_rect()
		_enemy_popup.position = Vector2i(int(btn_rect.position.x), int(btn_rect.end.y))
		_enemy_popup.size = Vector2i(int(btn_rect.size.x), 0)
		_enemy_popup.popup()

func _on_enemy_popup_index_pressed(idx: int):
	var slug: String = _enemy_popup.get_item_metadata(idx)
	if _enemy_popup.is_item_checked(idx):
		_enemy_popup.set_item_checked(idx, false)
		_debug_enemy_heroes.erase(slug)
	else:
		if _debug_enemy_heroes.size() >= 3:
			# Replace oldest: uncheck it, remove from list
			var oldest_slug = _debug_enemy_heroes[0]
			for i in range(_enemy_popup.item_count):
				if _enemy_popup.get_item_metadata(i) == oldest_slug:
					_enemy_popup.set_item_checked(i, false)
					break
			_debug_enemy_heroes.remove_at(0)
		_enemy_popup.set_item_checked(idx, true)
		_debug_enemy_heroes.append(slug)
	# Update button text
	if _debug_enemy_heroes.is_empty():
		enemy_dropdown.text = "Enemies"
	else:
		enemy_dropdown.text = "Enemies: %d/3" % _debug_enemy_heroes.size()
	_update_apply_button()

func _update_apply_button():
	if apply_enemies_btn == null:
		return
	# Enable only when exactly 3 selected AND different from current
	var changed = _debug_enemy_heroes.size() == 3
	if changed:
		var sorted_new = _debug_enemy_heroes.duplicate()
		sorted_new.sort()
		var sorted_orig = _original_enemy_heroes.duplicate()
		sorted_orig.sort()
		changed = sorted_new != sorted_orig
	apply_enemies_btn.disabled = not changed

func _restart_training_with_enemies():
	if _debug_enemy_heroes.size() != 3:
		return
	print("[Training] Changing enemies to: ", _debug_enemy_heroes)
	_original_enemy_heroes = _debug_enemy_heroes.duplicate()
	_update_apply_button()
	GameState.send_json({
		"type": "change_training_enemies",
		"enemy_hero_1": _debug_enemy_heroes[0],
		"enemy_hero_2": _debug_enemy_heroes[1],
		"enemy_hero_3": _debug_enemy_heroes[2],
	})

func _clear_all_heroes_and_cards():
	# Clear hand cards
	for card in hand_cards:
		if is_instance_valid(card) and card.get_parent() == hand_container:
			hand_container.remove_child(card)
			card.queue_free()
	hand_cards.clear()
	_used_hand_keys.clear()
	_prev_server_keys.clear()
	# Clear heroes
	for hero in my_heroes.values():
		if is_instance_valid(hero):
			hero.queue_free()
	my_heroes.clear()
	for hero in enemy_heroes.values():
		if is_instance_valid(hero):
			hero.queue_free()
	enemy_heroes.clear()
	_hero_targets.clear()
	_last_known_hp.clear()
	_is_first_state_update = true

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
