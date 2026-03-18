extends Control
## Gameplay - Main battle scene with heroes, hand, and energy

@onready var heroes_container: Control = $HeroesContainer
@onready var hand_container: Control = $HandContainer
@onready var energy_bar: ProgressBar = $UIOverlay/EnergyBar
@onready var reroll_button: Button = $UIOverlay/RerollButton
@onready var back_button: Button = $UIOverlay/BackButton
@onready var match_info_label: Label = $UIOverlay/MatchInfoLabel

const HERO_SCENE = preload("res://scenes/hero.tscn")
const ACTION_CARD_SCENE = preload("res://scenes/action_card.tscn")

# Heroes
var my_heroes: Dictionary = {}  # slot_index -> Hero node
var enemy_heroes: Dictionary = {}  # slot_index -> Hero node
var hand_cards: Array = []

# State
var current_energy: int = 10
var max_energy: int = 10
var _last_state: Dictionary = {}

func _ready():
	add_to_group("gameplay")
	
	reroll_button.pressed.connect(_on_reroll_pressed)
	back_button.pressed.connect(_on_back_pressed)
	
	# Start polling for state updates
	_set_initial_positions()

func _process(_delta):
	# Process WebSocket messages
	if GameState.ws:
		while GameState.ws.get_available_packet_count() > 0:
			var msg = GameState.ws.get_packet().get_string_from_utf8()
			_on_ws_message(msg)

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
	
	# Update match info
	match_info_label.text = "Match: %s" % match_data.get("match_id", "")
	
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
		
		var hero_node = _get_or_create_hero(slot, is_enemy)
		hero_node.update_state(hero_data)
	
	# Update hand
	_update_hand(hand_data)
	
	# Update casting indicators
	_update_casting_indicators(casts)
	
	# Check match end
	var winner = match_data.get("winner", 0)
	if winner != 0:
		_on_match_end(winner)

func _get_or_create_hero(slot: int, is_enemy: bool) -> Node:
	var dict = enemy_heroes if is_enemy else my_heroes
	
	if dict.has(slot):
		return dict[slot]
	
	# Create new hero
	var hero = HERO_SCENE.instantiate()
	heroes_container.add_child(hero)
	
	# Position based on layout from game-layout.json
	var pos = _get_hero_position(slot, is_enemy)
	hero.position = pos
	
	dict[slot] = hero
	return hero

func _get_hero_position(slot: int, is_enemy: bool) -> Vector2:
	# Use positions from game-layout.json (9-16 portrait)
	# Hero positions (bottom for player, top for enemy)
	
	var viewport_size = get_viewport().get_visible_rect().size
	
	if is_enemy:
		# Enemy positions (top)
		match slot:
			1: return Vector2(viewport_size.x * 0.294, viewport_size.y * 0.356)
			2: return Vector2(viewport_size.x * 0.492, viewport_size.y * 0.382)
			3: return Vector2(viewport_size.x * 0.683, viewport_size.y * 0.407)
	else:
		# Player positions (bottom)
		match slot:
			1: return Vector2(viewport_size.x * 0.181, viewport_size.y * 0.895)
			2: return Vector2(viewport_size.x * 0.483, viewport_size.y * 0.885)
			3: return Vector2(viewport_size.x * 0.782, viewport_size.y * 0.892)
	
	return Vector2.ZERO

func _update_hand(hand_data: Array):
	# Clear existing hand cards
	for card in hand_cards:
		card.queue_free()
	hand_cards.clear()
	
	# Create new cards
	for i in range(hand_data.size()):
		var card_data = hand_data[i]
		var card = ACTION_CARD_SCENE.instantiate()
		hand_container.add_child(card)
		
		card.setup(card_data)
		card.card_drag_started.connect(_on_card_drag_started)
		card.card_drag_ended.connect(_on_card_drag_ended)
		
		# Position based on game-layout.json
		card.position = _get_card_position(i + 1)
		
		hand_cards.append(card)

func _get_card_position(slot: int) -> Vector2:
	var viewport_size = get_viewport().get_visible_rect().size
	
	# Card positions from game-layout.json (action1-action5)
	match slot:
		1: return Vector2(viewport_size.x * 0.546, viewport_size.y * 0.792)
		2: return Vector2(viewport_size.x * 0.345, viewport_size.y * 0.797)
		3: return Vector2(viewport_size.x * 0.148, viewport_size.y * 0.823)
		4: return Vector2(viewport_size.x * 0.916, viewport_size.y * 0.799)
		5: return Vector2(viewport_size.x * 0.781, viewport_size.y * 0.813)
	
	return Vector2.ZERO

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
	# Show casting progress on heroes
	var now = Time.get_ticks_msec()
	
	for cast in casts:
		if cast.get("resolved", false):
			continue
		
		var caster_id = cast.get("caster_hero_instance_id", "")
		var started_at = cast.get("started_at", 0)
		var resolves_at = cast.get("resolves_at", 0)
		
		if resolves_at <= now:
			continue
		
		var total_time = resolves_at - started_at
		var elapsed = now - started_at
		var progress = float(elapsed) / total_time
		
		# Find the hero and show casting
		var hero = _find_hero_by_instance_id(caster_id)
		if hero:
			hero.show_cast_indicator(progress)

func _find_hero_by_instance_id(instance_id: String) -> Node:
	for hero in my_heroes.values():
		if hero.hero_instance_id == instance_id:
			return hero
	for hero in enemy_heroes.values():
		if hero.hero_instance_id == instance_id:
			return hero
	return null

func _on_card_drag_started(_card):
	# Highlight valid targets
	_highlight_valid_targets(_card.target_rule)

func _on_card_drag_ended(_card, dropped_on_target):
	# Remove highlights
	_clear_highlights()

func _highlight_valid_targets(target_rule: String):
	var all_heroes = []
	all_heroes.append_array(my_heroes.values())
	all_heroes.append_array(enemy_heroes.values())
	
	for hero in all_heroes:
		var is_valid = false
		match target_rule:
			"enemy": is_valid = hero.is_enemy and not hero.is_dead()
			"ally": is_valid = not hero.is_enemy and not hero.is_dead()
			"self": is_valid = not hero.is_enemy and not hero.is_dead()
			"any": is_valid = not hero.is_dead()
		
		if is_valid:
			hero.modulate = Color(1.2, 1.2, 1.2, 1.0)  # Highlight
		else:
			hero.modulate = Color(0.5, 0.5, 0.5, 0.5)  # Dim

func _clear_highlights():
	var all_heroes = []
	all_heroes.append_array(my_heroes.values())
	all_heroes.append_array(enemy_heroes.values())
	
	for hero in all_heroes:
		hero.modulate = Color.WHITE

func _on_reroll_pressed():
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

func _on_match_end(winner: int):
	var won = (winner == GameState.current_team)
	var result_text = "Victory!" if won else "Defeat"
	match_info_label.text = result_text
	
	# Disable interactions
	reroll_button.disabled = true
	for card in hand_cards:
		card.disabled = true
	
	# Show result and return to main after delay
	await get_tree().create_timer(3.0).timeout
	get_tree().change_scene_to_file("res://scenes/main.tscn")

func _set_initial_positions():
	# Energy bar position from game-layout.json
	var viewport_size = get_viewport().get_visible_rect().size
	energy_bar.position = Vector2(viewport_size.x * 0.511, viewport_size.y * 0.957)
	energy_bar.size = Vector2(295, 100)

# Public API for action cards
func get_heroes() -> Array:
	var all = []
	all.append_array(my_heroes.values())
	all.append_array(enemy_heroes.values())
	return all

func get_first_alive_hero_slot() -> int:
	for slot in my_heroes:
		if not my_heroes[slot].is_dead():
			return slot
	return 1
