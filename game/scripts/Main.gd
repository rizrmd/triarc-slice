extends Control

var card_scene = preload("res://scenes/Card.tscn")
var current_cards: Array = []
var _extra_box_nodes := {}
var available_heroes: Array[String] = []
var _client := GameServerClient.new()
var _refresh_in_flight := false
var _busy := false
var _current_match_id: String = ""
var _current_team: int = 0
var _displayed_hero_slugs: Array[String] = []
var _selected_caster_slot: int = 0
var _pending_hand_slot: int = 0
var _pending_action_target_rule: String = ""
var _action_defs := {}
var _last_state: Dictionary = {}

@onready var bg_texture = $Background
@onready var server_url_edit: LineEdit = $UI/LobbyPanel/MarginContainer/LobbyVBox/ServerUrlEdit
@onready var display_name_edit: LineEdit = $UI/LobbyPanel/MarginContainer/LobbyVBox/DisplayNameEdit
@onready var hero_1_select: OptionButton = $UI/LobbyPanel/MarginContainer/LobbyVBox/Hero1Select
@onready var hero_2_select: OptionButton = $UI/LobbyPanel/MarginContainer/LobbyVBox/Hero2Select
@onready var hero_3_select: OptionButton = $UI/LobbyPanel/MarginContainer/LobbyVBox/Hero3Select
@onready var connect_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/ConnectButton
@onready var register_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/RegisterButton
@onready var queue_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/QueueButtons/QueueButton
@onready var leave_queue_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/QueueButtons/LeaveQueueButton
@onready var status_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/StatusLabel
@onready var player_id_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/PlayerIdLabel
@onready var match_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/MatchLabel
@onready var energy_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/EnergyLabel
@onready var caster_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/CasterLabel
@onready var hand_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/HandLabel
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
	_load_initial_cards()
	call_deferred("update_layout")
	get_tree().root.size_changed.connect(update_layout)

	# Load saved session
	_client.load_session()
	server_url_edit.text = _client.server_url

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
	_client.configure(server_url_edit.text)
	_client.connect_to_server()

func _on_connected(player_id: String) -> void:
	_set_status("Connected! Player ID: %s" % _short_id(player_id))
	player_id_label.text = "Player: %s" % _short_id(player_id)
	connect_button.text = "Disconnect"
	_update_ui_for_connection(true)

func _on_disconnected() -> void:
	_set_status("Disconnected from server")
	player_id_label.text = "Player: -"
	connect_button.text = "Connect"
	_update_ui_for_connection(false)
	_reset_match_state()

func _update_ui_for_connection(connected: bool) -> void:
	register_button.disabled = not connected
	queue_button.disabled = not connected
	leave_queue_button.disabled = not connected

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
	_set_status("Selecting caster %s..." % slot_index)
	_client.select_caster(slot_index)

func _on_action_button_pressed(hand_slot_index: int) -> void:
	if not _client.connected or _current_match_id.is_empty():
		return
	
	var button := action_buttons[hand_slot_index - 1]
	var target_rule = str(button.get_meta("target_rule", ""))
	if target_rule.is_empty():
		_set_status("No action in that slot")
		return
	
	_pending_hand_slot = hand_slot_index
	_pending_action_target_rule = target_rule
	_update_target_buttons()
	target_label.text = "Target: select a target"

func _on_target_button_pressed(target_side: String, slot_index: int) -> void:
	if not _client.connected or _current_match_id.is_empty() or _pending_hand_slot == 0:
		return
	if not _is_target_side_valid(target_side):
		_set_status("Invalid target for selected action")
		return
	
	_set_status("Casting action...")
	_client.cast_action(_pending_hand_slot, slot_index)
	_pending_hand_slot = 0
	_pending_action_target_rule = ""
	_update_target_buttons()

func _on_reroll_pressed() -> void:
	if not _client.connected or _current_match_id.is_empty():
		return
	_set_status("Rerolling hand...")
	_client.reroll_hand()

# ============================================================================
# Client Event Handlers
# ============================================================================

func _on_match_state_updated(state: Dictionary) -> void:
	_last_state = state
	_update_match_ui(state)

func _on_match_found(match_id: String, team: int) -> void:
	_current_match_id = match_id
	_current_team = team
	match_label.text = "Match: %s (Team %s)" % [match_id, team]
	_set_status("Match found!")

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
				_set_status("Victory!")
			else:
				_set_status("Defeat!")
		_:
			pass

func _on_error_received(code: String, message: String) -> void:
	_set_status("Error: %s - %s" % [code, message])

# ============================================================================
# UI Updates
# ============================================================================

func _update_match_ui(state: Dictionary) -> void:
	var match_data = state.get("match", {})
	var team_state = state.get("team_state", {})
	var hand = state.get("hand", [])
	var my_heroes = state.get("my_heroes", [])
	var enemy_heroes = state.get("enemy_heroes", [])
	
	# Update energy
	var energy = int(team_state.get("energy", 0))
	var energy_max = int(team_state.get("energy_max", 10))
	_selected_caster_slot = int(team_state.get("selected_caster_slot", 0))
	energy_label.text = "Energy: %s / %s" % [energy, energy_max]
	caster_label.text = "Caster: %s" % (_selected_caster_slot if _selected_caster_slot > 0 else "none")
	
	# Update hand
	_update_hand_buttons(hand)
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
				var action_name = str(card.get("display_name", "Unknown"))
				var energy_cost = int(card.get("energy_cost", 0))
				var target_rule = str(card.get("target_rule", ""))
				button.text = "%s. %s (%sE)" % [slot, action_name, energy_cost]
				button.set_meta("target_rule", target_rule)
				button.set_meta("action_name", action_name)
				button.disabled = false
				found = true
				break
		
		if not found:
			button.text = "Action %s" % slot
			button.set_meta("target_rule", "")
			button.disabled = true

func _update_caster_buttons() -> void:
	for index in range(caster_buttons.size()):
		var slot = index + 1
		caster_buttons[index].disabled = _current_match_id.is_empty()
		caster_buttons[index].text = "Hero %s%s" % [slot, " *" if slot == _selected_caster_slot else ""]

func _update_target_buttons() -> void:
	var allow_ally = _pending_hand_slot != 0 and (_pending_action_target_rule == "ally_single" or _pending_action_target_rule == "self")
	var allow_enemy = _pending_hand_slot != 0 and _pending_action_target_rule == "enemy_single"
	
	for index in range(ally_target_buttons.size()):
		var slot = index + 1
		var self_only = _pending_action_target_rule == "self" and slot != _selected_caster_slot
		ally_target_buttons[index].disabled = (not allow_ally) or self_only or _current_match_id.is_empty()
	
	for index in range(enemy_target_buttons.size()):
		enemy_target_buttons[index].disabled = not allow_enemy or _current_match_id.is_empty()
	
	if _pending_hand_slot == 0:
		target_label.text = "Target: select a card first"

func _is_target_side_valid(target_side: String) -> bool:
	match _pending_action_target_rule:
		"enemy_single":
			return target_side == "enemy"
		"ally_single", "self":
			return target_side == "ally"
		_:
			return false

func _reset_match_state() -> void:
	_current_match_id = ""
	_current_team = 0
	_selected_caster_slot = 0
	_pending_hand_slot = 0
	_pending_action_target_rule = ""
	match_label.text = "Match: none"
	energy_label.text = "Energy: -"
	caster_label.text = "Caster: none"
	_update_caster_buttons()
	_update_target_buttons()

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

func _short_id(full_id: String) -> String:
	if full_id.length() <= 12:
		return full_id
	return "%s...%s" % [full_id.substr(0, 6), full_id.substr(full_id.length() - 4, 4)]
