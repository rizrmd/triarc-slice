extends Control

const GAME_POST_SCENE := "res://scenes/GamePost.tscn"

var card_scene = preload("res://scenes/Card.tscn")
var current_cards: Array = []
var available_heroes: Array[String] = []
var _client := GameServerClient.new()
var _current_match_id: String = ""
var _current_team: int = 0
var _displayed_hero_slugs: Array[String] = []
var _selected_caster_slot: int = 0
var _pending_hand_slot: int = 0
var _pending_action_targeting: Dictionary = {}
var _last_state: Dictionary = {}
var _action_config_cache: Dictionary = {}

@onready var bg_texture = $Background
@onready var display_name_edit: LineEdit = $UI/LobbyPanel/MarginContainer/LobbyVBox/DisplayNameEdit
@onready var hero_1_select: OptionButton = $UI/LobbyPanel/MarginContainer/LobbyVBox/Hero1Select
@onready var hero_2_select: OptionButton = $UI/LobbyPanel/MarginContainer/LobbyVBox/Hero2Select
@onready var hero_3_select: OptionButton = $UI/LobbyPanel/MarginContainer/LobbyVBox/Hero3Select
@onready var connect_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/ConnectButton
@onready var register_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/RegisterButton
@onready var queue_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/QueueButtons/QueueButton
@onready var leave_queue_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/QueueButtons/LeaveQueueButton
@onready var status_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/StatusLabel
@onready var connection_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/ConnectionLabel
@onready var match_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/MatchLabel
@onready var energy_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/EnergyLabel
@onready var caster_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/CasterLabel
@onready var hand_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/HandLabel
@onready var action_detail_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/ActionDetailLabel
@onready var target_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/TargetLabel
@onready var queue_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/QueueLabel
@onready var caster_buttons: Array[Button] = [
	$UI/LobbyPanel/MarginContainer/LobbyVBox/CasterButtons/Caster1Button,
	$UI/LobbyPanel/MarginContainer/LobbyVBox/CasterButtons/Caster2Button,
	$UI/LobbyPanel/MarginContainer/LobbyVBox/CasterButtons/Caster3Button,
]
@onready var action_buttons: Array[Button] = [
	$UI/LobbyPanel/MarginContainer/LobbyVBox/ActionButtons/Action1Button,
	$UI/LobbyPanel/MarginContainer/LobbyVBox/ActionButtons/Action2Button,
	$UI/LobbyPanel/MarginContainer/LobbyVBox/ActionButtons/Action3Button,
	$UI/LobbyPanel/MarginContainer/LobbyVBox/ActionButtons/Action4Button,
	$UI/LobbyPanel/MarginContainer/LobbyVBox/ActionButtons/Action5Button,
]
@onready var reroll_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/RerollButton
@onready var ally_target_buttons: Array[Button] = [
	$UI/LobbyPanel/MarginContainer/LobbyVBox/TargetButtons/Ally1Button,
	$UI/LobbyPanel/MarginContainer/LobbyVBox/TargetButtons/Ally2Button,
	$UI/LobbyPanel/MarginContainer/LobbyVBox/TargetButtons/Ally3Button,
]
@onready var enemy_target_buttons: Array[Button] = [
	$UI/LobbyPanel/MarginContainer/LobbyVBox/TargetButtons/Enemy1Button,
	$UI/LobbyPanel/MarginContainer/LobbyVBox/TargetButtons/Enemy2Button,
	$UI/LobbyPanel/MarginContainer/LobbyVBox/TargetButtons/Enemy3Button,
]

func _ready():
	randomize()
	_scan_heroes()
	_setup_hero_selectors()
	_apply_flow_selected_heroes()
	_load_initial_cards()
	call_deferred("update_layout")
	get_tree().root.size_changed.connect(update_layout)

	# Setup client
	_client.load_session()
	FlowState.display_name = _client.display_name
	display_name_edit.text = _client.display_name

	# Connect buttons
	connect_button.pressed.connect(_on_connect_pressed)
	register_button.pressed.connect(_on_register_pressed)
	queue_button.pressed.connect(_on_queue_pressed)
	leave_queue_button.pressed.connect(_on_leave_queue_pressed)
	reroll_button.pressed.connect(_on_reroll_pressed)
	
	for index in range(caster_buttons.size()):
		caster_buttons[index].pressed.connect(_on_caster_button_pressed.bind(index + 1))
	for index in range(action_buttons.size()):
		action_buttons[index].pressed.connect(_on_action_button_pressed.bind(index + 1))
	for index in range(ally_target_buttons.size()):
		ally_target_buttons[index].pressed.connect(_on_target_button_pressed.bind("ally", index + 1))
	for index in range(enemy_target_buttons.size()):
		enemy_target_buttons[index].pressed.connect(_on_target_button_pressed.bind("enemy", index + 1))

	# Connect client signals
	_client.connected_to_server.connect(_on_connected)
	_client.disconnected_from_server.connect(_on_disconnected)
	_client.match_state_updated.connect(_on_match_state_updated)
	_client.match_found.connect(_on_match_found)
	_client.event_received.connect(_on_event_received)
	_client.error_received.connect(_on_error_received)
	_client.profile_updated.connect(_on_profile_updated)
	_client.matchmaking_queued.connect(_on_matchmaking_queued)
	_client.matchmaking_left.connect(_on_matchmaking_left)

	_update_ui_for_connection(false)
	if _has_saved_profile():
		_set_status("Restoring saved profile...")
	else:
		_set_status("Connecting to server...")
	call_deferred("_auto_connect")

func _process(_delta):
	_client.process()

# ============================================================================
# Connection
# ============================================================================

func _on_connect_pressed() -> void:
	if _client.connected:
		_client.disconnect_from_server()
		return
	
	_set_status("Connecting to server...")
	_client.connect_to_server()

func _auto_connect() -> void:
	if _client.connected:
		return
	_client.connect_to_server()

func _on_connected(player_id: String) -> void:
	_set_status("Connected!")
	connection_label.text = "Status: Online"
	connect_button.text = "Disconnect"
	queue_label.text = "Queue: Not in Queue"
	_update_ui_for_connection(true)
	if _has_saved_profile():
		_set_status("Connected. Restoring profile...")
		_client.register_profile(_client.display_name)

func _on_disconnected() -> void:
	_set_status("Disconnected from server. Reconnecting...")
	connection_label.text = "Status: Offline"
	connect_button.text = "Connect"
	_update_ui_for_connection(false)
	_reset_match_state()
	call_deferred("_auto_connect")

func _update_ui_for_connection(connected: bool) -> void:
	register_button.disabled = not connected
	queue_button.disabled = not connected or not _current_match_id.is_empty()
	leave_queue_button.disabled = true  # Only enabled when actually in queue
	reroll_button.disabled = not connected or _current_match_id.is_empty()
	
	for button in caster_buttons:
		button.disabled = not connected or _current_match_id.is_empty()
	
	_update_caster_buttons()
	_update_target_buttons()

# ============================================================================
# Registration & Matchmaking
# ============================================================================

func _on_register_pressed() -> void:
	if not _client.connected:
		_set_status("Not connected to server")
		return
	
	var display_name := display_name_edit.text.strip_edges()
	if display_name.is_empty():
		_set_status("Enter a display name")
		return
	
	_set_status("Registering profile...")
	_client.register_profile(display_name)

func _on_queue_pressed() -> void:
	if not _client.connected:
		_set_status("Not connected to server")
		return
	
	var heroes = _selected_heroes_payload()
	if heroes.size() != 3:
		_set_status("Select 3 heroes")
		return
	
	_set_status("Queueing for matchmaking...")
	_client.queue_for_matchmaking(heroes[0], heroes[1], heroes[2])

func _on_leave_queue_pressed() -> void:
	if not _client.connected:
		return
	_set_status("Leaving queue...")
	_client.leave_matchmaking()

# ============================================================================
# Match Gameplay
# ============================================================================

func _on_caster_button_pressed(slot_index: int) -> void:
	if not _client.connected or _current_match_id.is_empty():
		return
	_selected_caster_slot = slot_index
	_set_status("Caster %s selected" % slot_index)
	_update_caster_buttons()

func _on_action_button_pressed(hand_slot_index: int) -> void:
	if not _client.connected or _current_match_id.is_empty():
		return
	
	var button := action_buttons[hand_slot_index - 1]
	var target_rule = str(button.get_meta("target_rule", ""))
	if target_rule.is_empty():
		_set_status("No action in that slot")
		return

	var action_slug = str(button.get_meta("action_slug", ""))
	var targeting = _get_effective_targeting(action_slug, button.get_meta("targeting", {}))
	_show_action_details(
		action_slug,
		str(button.get_meta("action_name", action_slug.capitalize())),
		button.get_meta("action_description", ""),
		button.get_meta("action_elements", []),
		targeting
	)
	_pending_hand_slot = hand_slot_index
	_pending_action_targeting = targeting
	if _is_targeting_immediate(targeting):
		_cast_pending_action(0, "", _targeting_to_rule(targeting))
		return
	_update_target_buttons()
	target_label.text = "Target: select a target"

func _on_target_button_pressed(target_side: String, slot_index: int) -> void:
	if not _client.connected or _current_match_id.is_empty() or _pending_hand_slot == 0:
		return
	if not _is_target_side_valid(target_side, slot_index):
		_set_status("Invalid target for selected action")
		return

	_cast_pending_action(slot_index, target_side, _targeting_to_rule(_pending_action_targeting))

func _on_reroll_pressed() -> void:
	if not _client.connected or _current_match_id.is_empty():
		return
	_set_status("Rerolling hand...")
	_client.reroll_hand()

# ============================================================================
# Client Event Handlers
# ============================================================================

func _on_profile_updated(profile: Dictionary) -> void:
	var display_name = str(profile.get("display_name", ""))
	FlowState.display_name = display_name
	display_name_edit.text = display_name
	_set_status("Welcome, %s!" % display_name)

func _on_matchmaking_queued() -> void:
	_set_status("Queued for matchmaking!")
	queue_label.text = "Queue: In Queue"
	queue_button.disabled = true
	leave_queue_button.disabled = false

func _on_matchmaking_left() -> void:
	_set_status("Left matchmaking queue")
	queue_label.text = "Queue: Not in Queue"
	queue_button.disabled = false
	leave_queue_button.disabled = true

func _on_match_state_updated(match_data: Dictionary, players: Array, team_states: Array, heroes: Array, hand: Array, statuses: Array, casts: Array) -> void:
	# Build state dict for compatibility with existing UI code
	var state = {
		"match": match_data,
		"players": players,
		"team_states": team_states,
		"heroes": heroes,
		"hand": hand,
		"statuses": statuses,
		"casts": casts,
	}
	_last_state = state
	_update_match_ui(state)

func _on_match_found(match_id: String, team: int) -> void:
	_current_match_id = match_id
	_current_team = team
	_client.current_match_id = match_id
	_client.current_team = team
	match_label.text = "Match: %s (Team %s)" % [match_id, team]
	queue_label.text = "Queue: Match Found"
	_set_status("Match found!")
	# Update UI to reflect we're now in a match
	_update_ui_for_connection(_client.connected)

func _on_event_received(event_type: String, data: Dictionary) -> void:
	match event_type:
		"cast_started":
			_set_status("Cast started: %s" % data.get("action_slug", ""))
		"cast_resolved":
			_set_status("Cast resolved: %s" % data.get("action_slug", ""))
		"damage_dealt":
			_set_status("Damage: %s" % data.get("amount", 0))
		"heal_applied":
			_set_status("Heal: %s" % data.get("amount", 0))
		"match_won":
			var winner = int(data.get("winner_team", 0))
			if winner == _current_team:
				FlowState.last_match_result = "Victory"
				_set_status("Victory!")
			else:
				FlowState.last_match_result = "Defeat!"
				_set_status("Defeat!")
			FlowState.last_match_id = _current_match_id
			get_tree().change_scene_to_file(GAME_POST_SCENE)
		_:
			pass

func _on_error_received(code: String, message: String) -> void:
	_set_status("Error: %s - %s" % [code, message])

# ============================================================================
# UI Updates
# ============================================================================

func _update_match_ui(state: Dictionary) -> void:
	var match_data = state.get("match", {})
	var team_states = state.get("team_states", [])
	var hand = state.get("hand", [])
	var heroes = state.get("heroes", [])
	
	# Find my team state from team_states array
	var my_team_state = {}
	for ts in team_states:
		if int(ts.get("team", 0)) == _current_team:
			my_team_state = ts
			break
	
	# Filter heroes by team
	var my_heroes: Array = []
	var enemy_heroes: Array = []
	for hero in heroes:
		var hero_team = int(hero.get("team", 0))
		if hero_team == _current_team:
			my_heroes.append(hero)
		else:
			enemy_heroes.append(hero)
	
	# Update energy
	var energy = int(my_team_state.get("energy", 0))
	var energy_max = int(my_team_state.get("energy_max", 10))
	_selected_caster_slot = int(my_team_state.get("selected_caster_slot", 0))
	energy_label.text = "Energy: %s / %s" % [energy, energy_max]
	caster_label.text = "Caster: %s" % (_selected_caster_slot if _selected_caster_slot > 0 else "none")
	
	# Update hand - filter by my team
	var my_hand: Array = []
	for slot in hand:
		if int(slot.get("team", 0)) == _current_team:
			my_hand.append(slot)
	_update_hand_buttons(my_hand)
	hand_label.text = "Hand: %s cards" % my_hand.size()
	_update_target_buttons()
	
	# Update heroes if changed
	var hero_slugs: Array = []
	for hero in my_heroes:
		hero_slugs.append(str(hero.get("hero_slug", "")))
	if hero_slugs.size() > 0:
		_set_current_heroes(hero_slugs)

func _update_hand_buttons(hand: Array) -> void:
	for index in range(action_buttons.size()):
		var slot = index + 1
		var button := action_buttons[index]
		var found = false
		
		for card in hand:
			if int(card.get("slot_index", 0)) == slot:
				var action_slug = str(card.get("action_slug", ""))
				var action_config = _load_action_config(action_slug)
				var action_name = str(card.get("action_name", action_config.get("full_name", action_slug.capitalize() if action_slug else "Unknown")))
				var action_description = str(action_config.get("description", ""))
				var action_elements = action_config.get("element", [])
				var target_rule = str(card.get("target_rule", action_config.get("target_rule", "enemy_single")))
				var targeting = card.get("targeting", action_config.get("targeting", _target_rule_to_targeting(target_rule)))
				button.text = _format_action_button_text(slot, action_name, action_elements)
				button.tooltip_text = _build_action_tooltip(action_name, action_description, action_elements, targeting)
				button.set_meta("target_rule", target_rule)
				button.set_meta("targeting", targeting)
				button.set_meta("action_name", action_name)
				button.set_meta("action_slug", action_slug)
				button.set_meta("action_description", action_description)
				button.set_meta("action_elements", action_elements)
				button.disabled = false
				found = true
				break
		
		if not found:
			button.text = "Action %s" % slot
			button.tooltip_text = ""
			button.set_meta("target_rule", "")
			button.set_meta("targeting", {})
			button.set_meta("action_slug", "")
			button.set_meta("action_name", "")
			button.set_meta("action_description", "")
			button.set_meta("action_elements", [])
			button.disabled = true

	if _pending_hand_slot > 0 and _pending_hand_slot <= action_buttons.size():
		var active_button := action_buttons[_pending_hand_slot - 1]
		var active_slug = str(active_button.get_meta("action_slug", ""))
		if not active_slug.is_empty():
			_show_action_details(
				active_slug,
				str(active_button.get_meta("action_name", active_slug.capitalize())),
				active_button.get_meta("action_description", ""),
				active_button.get_meta("action_elements", []),
				active_button.get_meta("targeting", {})
			)
			return
	_update_action_detail_placeholder()

func _update_caster_buttons() -> void:
	for index in range(caster_buttons.size()):
		var slot = index + 1
		caster_buttons[index].disabled = _current_match_id.is_empty()
		caster_buttons[index].text = "Hero %s%s" % [slot, " *" if slot == _selected_caster_slot else ""]

func _update_target_buttons() -> void:
	var side = str(_pending_action_targeting.get("side", ""))
	var scope = str(_pending_action_targeting.get("scope", ""))
	var selection = str(_pending_action_targeting.get("selection", ""))
	var allow_self = bool(_pending_action_targeting.get("allow_self", false))
	var allow_ally = _pending_hand_slot != 0 and scope == "single" and selection == "manual" and (side == "ally" or side == "any")
	var allow_enemy = _pending_hand_slot != 0 and scope == "single" and selection == "manual" and (side == "enemy" or side == "any")
	
	for index in range(ally_target_buttons.size()):
		var slot = index + 1
		var self_only = side == "ally" and not allow_self and slot == _selected_caster_slot
		ally_target_buttons[index].disabled = (not allow_ally) or self_only or _current_match_id.is_empty()
	
	for index in range(enemy_target_buttons.size()):
		enemy_target_buttons[index].disabled = not allow_enemy or _current_match_id.is_empty()
	
	if _pending_hand_slot == 0:
		target_label.text = "Target: select a card first"

func _is_target_side_valid(target_side: String, slot_index: int) -> bool:
	if target_side == "ally" and slot_index == _selected_caster_slot and not bool(_pending_action_targeting.get("allow_self", false)):
		return false
	match str(_pending_action_targeting.get("side", "")):
		"enemy":
			return target_side == "enemy"
		"ally":
			return target_side == "ally"
		"any":
			return true
		_:
			return false

func _reset_match_state() -> void:
	_current_match_id = ""
	_current_team = 0
	_client.current_match_id = ""
	_client.current_team = 0
	_selected_caster_slot = 0
	_pending_hand_slot = 0
	_pending_action_targeting = {}
	match_label.text = "Match: none"
	energy_label.text = "Energy: -"
	caster_label.text = "Caster: none"
	hand_label.text = "Hand: -"
	action_detail_label.text = "Action details appear here."
	queue_label.text = "Queue: Not in Queue"
	_update_caster_buttons()
	_update_target_buttons()
	_update_ui_for_connection(_client.connected)

func _cast_pending_action(target_slot: int, target_side: String, target_override_rule: String) -> void:
	_set_status("Casting action...")
	_client.cast_action(_selected_caster_slot, _pending_hand_slot, target_slot, target_side, target_override_rule)
	_pending_hand_slot = 0
	_pending_action_targeting = {}
	_update_target_buttons()

func _is_targeting_immediate(targeting: Dictionary) -> bool:
	return str(targeting.get("scope", "single")) == "none" or str(targeting.get("selection", "manual")) == "auto"

func _target_rule_to_targeting(target_rule: String) -> Dictionary:
	match target_rule:
		"ally_single":
			return {"side": "ally", "scope": "single", "selection": "manual", "allow_self": true, "allow_dead": false}
		"self":
			return {"side": "ally", "scope": "single", "selection": "manual", "allow_self": true, "allow_dead": false}
		"any_single":
			return {"side": "any", "scope": "single", "selection": "manual", "allow_self": true, "allow_dead": false}
		"ally_auto":
			return {"side": "ally", "scope": "single", "selection": "auto", "allow_self": true, "allow_dead": false}
		"enemy_auto":
			return {"side": "enemy", "scope": "single", "selection": "auto", "allow_self": false, "allow_dead": false}
		"any_auto":
			return {"side": "any", "scope": "single", "selection": "auto", "allow_self": true, "allow_dead": false}
		"no_target":
			return {"side": "ally", "scope": "none", "selection": "auto", "allow_self": true, "allow_dead": false}
		_:
			return {"side": "enemy", "scope": "single", "selection": "manual", "allow_self": false, "allow_dead": false}

func _targeting_to_rule(targeting: Dictionary) -> String:
	var scope = str(targeting.get("scope", "single"))
	var side = str(targeting.get("side", "enemy"))
	var selection = str(targeting.get("selection", "manual"))
	if scope == "none":
		return "no_target"
	if selection == "auto":
		match side:
			"ally":
				return "ally_auto"
			"any":
				return "any_auto"
			_:
				return "enemy_auto"
	match side:
		"ally":
			return "ally_single"
		"any":
			return "any_single"
		_:
			return "enemy_single"

func _get_effective_targeting(action_slug: String, base_targeting: Variant) -> Dictionary:
	var resolved = {}
	if base_targeting is Dictionary:
		resolved = base_targeting.duplicate(true)
	else:
		resolved = _target_rule_to_targeting(str(base_targeting))
	var hero_slug = _get_selected_caster_hero_slug()
	if hero_slug.is_empty():
		return resolved
	var hero_config = _load_hero_config(hero_slug)
	var overrides = hero_config.get("action_overrides", {})
	if not (overrides is Dictionary):
		return resolved
	var action_override = overrides.get(action_slug, {})
	if not (action_override is Dictionary):
		return resolved
	var override_targeting = action_override.get("targeting", {})
	if override_targeting is Dictionary:
		for key in override_targeting.keys():
			resolved[key] = override_targeting[key]
	var override_rule = str(action_override.get("target_rule", ""))
	if not override_rule.is_empty():
		resolved = _target_rule_to_targeting(override_rule)
	return resolved

func _get_selected_caster_hero_slug() -> String:
	if _selected_caster_slot <= 0 or _selected_caster_slot > _displayed_hero_slugs.size():
		return ""
	return _displayed_hero_slugs[_selected_caster_slot - 1]

func _load_hero_config(hero_slug: String) -> Dictionary:
	var path = "res://data/hero/%s/hero.json" % hero_slug
	if not FileAccess.file_exists(path):
		return {}
	var file = FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	return parsed if parsed is Dictionary else {}

func _load_action_config(action_slug: String) -> Dictionary:
	if action_slug.is_empty():
		return {}
	if _action_config_cache.has(action_slug):
		return _action_config_cache[action_slug]
	var path = "res://data/action/%s/action.json" % action_slug
	if not FileAccess.file_exists(path):
		_action_config_cache[action_slug] = {}
		return {}
	var file = FileAccess.open(path, FileAccess.READ)
	if file == null:
		_action_config_cache[action_slug] = {}
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	var config = parsed if parsed is Dictionary else {}
	_action_config_cache[action_slug] = config
	return config

func _format_action_button_text(slot: int, action_name: String, elements: Variant) -> String:
	var element_text = _format_element_list(elements)
	if element_text.is_empty():
		return "%s. %s" % [slot, action_name]
	return "%s. %s [%s]" % [slot, action_name, element_text]

func _show_action_details(action_slug: String, action_name: String, action_description: Variant, action_elements: Variant, targeting: Dictionary) -> void:
	if action_slug.is_empty():
		_update_action_detail_placeholder()
		return
	var description = str(action_description)
	if description.is_empty():
		description = "No description available."
	var element_text = _format_element_list(action_elements)
	var target_text = _describe_targeting(targeting)
	var header = action_name
	if not element_text.is_empty():
		header += " [%s]" % element_text
	action_detail_label.text = "%s\n%s\n%s" % [header, target_text, description]

func _update_action_detail_placeholder() -> void:
	action_detail_label.text = "Action details appear here."

func _build_action_tooltip(action_name: String, action_description: String, action_elements: Variant, targeting: Dictionary) -> String:
	var lines: Array[String] = []
	var element_text = _format_element_list(action_elements)
	if element_text.is_empty():
		lines.append(action_name)
	else:
		lines.append("%s [%s]" % [action_name, element_text])
	lines.append(_describe_targeting(targeting))
	if not action_description.is_empty():
		lines.append(action_description)
	return "\n".join(lines)

func _format_element_list(elements: Variant) -> String:
	if not (elements is Array):
		return ""
	var names: Array[String] = []
	for element_name in elements:
		var text = str(element_name).strip_edges()
		if text.is_empty():
			continue
		names.append(text.capitalize())
	return "/".join(names)

func _describe_targeting(targeting: Dictionary) -> String:
	var scope = str(targeting.get("scope", "single"))
	var side = str(targeting.get("side", "enemy"))
	var selection = str(targeting.get("selection", "manual"))
	if scope == "none":
		return "Target: none"
	var target_side = side.capitalize()
	if side == "any":
		target_side = "Any"
	if selection == "auto":
		return "Target: %s %s (auto)" % [target_side, scope]
	return "Target: %s %s" % [target_side, scope]

# ============================================================================
# Helper Functions
# ============================================================================

func _scan_heroes() -> void:
	var dir := DirAccess.open("res://data/hero/")
	if dir:
		dir.list_dir_begin()
		var file_name := dir.get_next()
		while file_name != "":
			if dir.current_is_dir() and not file_name.begins_with("."):
				available_heroes.append(file_name)
			file_name = dir.get_next()
		available_heroes.sort()
	else:
		push_error("Failed to open data/hero directory")
		available_heroes = ["iron-knight", "dawn-priest", "arc-strider"]

func _setup_hero_selectors() -> void:
	for selector in [hero_1_select, hero_2_select, hero_3_select]:
		selector.clear()
		for hero_slug in available_heroes:
			selector.add_item(hero_slug)
	
	if available_heroes.size() >= 3:
		hero_1_select.select(0)
		hero_2_select.select(1)
		hero_3_select.select(2)

func _apply_flow_selected_heroes() -> void:
	if FlowState.selected_heroes.size() != 3:
		return
	var selectors = [hero_1_select, hero_2_select, hero_3_select]
	for index in range(3):
		var target_slug = FlowState.selected_heroes[index]
		var selector: OptionButton = selectors[index]
		for item_index in range(selector.item_count):
			if selector.get_item_text(item_index) == target_slug:
				selector.select(item_index)
				break

func _selected_heroes_payload() -> Array:
	return [
		_get_selected_hero_slug(hero_1_select),
		_get_selected_hero_slug(hero_2_select),
		_get_selected_hero_slug(hero_3_select),
	]

func _get_selected_hero_slug(selector: OptionButton) -> String:
	var index := selector.selected
	if index < 0:
		return ""
	return selector.get_item_text(index)

func _set_current_heroes(hero_slugs: Array) -> void:
	if hero_slugs == _displayed_hero_slugs:
		return
	
	_displayed_hero_slugs = hero_slugs
	for card in current_cards:
		card.queue_free()
	current_cards.clear()
	
	for hero_slug in hero_slugs:
		var card = create_card(hero_slug)
		current_cards.append(card)
	
	update_layout()

func create_card(hero_slug: String):
	var card = card_scene.instantiate()
	add_child(card)
	card.load_hero(hero_slug)
	return card

func _load_initial_cards() -> void:
	current_cards.clear()
	var initial_heroes := [
		_get_selected_hero_slug(hero_1_select),
		_get_selected_hero_slug(hero_2_select),
		_get_selected_hero_slug(hero_3_select),
	]
	_set_current_heroes(initial_heroes)

func update_layout():
	var viewport_size = get_viewport_rect().size
	LayoutManager.apply_layout("cave", bg_texture, current_cards, viewport_size)

func _set_status(message: String) -> void:
	status_label.text = "Status: %s" % message

func _has_saved_profile() -> bool:
	return not _client.display_name.strip_edges().is_empty()
