extends Control

const FIND_MATCH_SCENE := "res://scenes/FindMatch.tscn"
const GAME_POST_SCENE := "res://scenes/GamePost.tscn"
const REGISTER_SCENE := "res://scenes/Register.tscn"
const GameData = preload("res://scripts/GameData.gd")

var card_scene = preload("res://scenes/Card.tscn")
var current_cards: Array = []
var _client: GameServerClient
var _current_match_id: String = ""
var _current_team: int = 0
var _displayed_hero_slugs: Array[String] = []
var _selected_caster_slot: int = 0
var _last_state: Dictionary = {}
var _action_config_cache: Dictionary = {}

@onready var bg_texture: TextureRect = $Background
@onready var status_label: Label = $UI/Hud/StatusLabel
@onready var connection_label: Label = $UI/Hud/ConnectionLabel
@onready var match_label: Label = $UI/Hud/MatchLabel
@onready var mana_badge = $UI/Hud/ManaBadge
@onready var caster_label: Label = $UI/Hud/CasterLabel
@onready var action_detail_label: Label = $UI/Hud/ActionDetailLabel
@onready var action_cards: Array[Node] = [
	$UI/Hud/Action1Card,
	$UI/Hud/Action2Card,
	$UI/Hud/Action3Card,
	$UI/Hud/Action4Card,
	$UI/Hud/Action5Card,
]
@onready var reroll_button = $UI/Hud/RerollButton

func _ready() -> void:
	_client = FlowState.client
	if FlowState.display_name.strip_edges().is_empty():
		call_deferred("_redirect_to_register")
		return

	_current_match_id = FlowState.current_match_id
	_current_team = FlowState.current_team
	if _current_match_id.is_empty():
		call_deferred("_redirect_to_find_match")
		return

	_client.load_session()
	_client.current_match_id = _current_match_id
	_client.current_team = _current_team

	reroll_button.pressed.connect(_on_reroll_pressed)
	for index in range(action_cards.size()):
		var action_card = action_cards[index]
		action_card.pressed.connect(_on_action_button_pressed.bind(index + 1))
		action_card.configure_empty(index + 1)

	_client.connected_to_server.connect(_on_connected)
	_client.disconnected_from_server.connect(_on_disconnected)
	_client.match_state_updated.connect(_on_match_state_updated)
	_client.match_found.connect(_on_match_found)
	_client.event_received.connect(_on_event_received)
	_client.error_received.connect(_on_error_received)

	call_deferred("update_layout")
	get_tree().root.size_changed.connect(update_layout)

	_load_initial_cards()
	_update_ui_for_connection(_client.connected)
	_set_status("Entering arena...")
	if _client.connected:
		_on_connected(_client.player_id)
	else:
		_client.connect_to_server()

func _on_connected(_player_id: String) -> void:
	connection_label.text = "Status: Online"
	_client.current_match_id = _current_match_id
	_client.current_team = _current_team
	if not _client.display_name.strip_edges().is_empty():
		_client.register_profile(_client.display_name)
	_set_status("Arena synced. Double-click a hero to set the active caster.")
	_update_ui_for_connection(true)

func _on_disconnected() -> void:
	connection_label.text = "Status: Reconnecting..."
	_set_status("Connection lost. Rejoining match...")
	_update_ui_for_connection(false)
	call_deferred("_auto_connect")

func _auto_connect() -> void:
	if _client.connected:
		return
	_client.connect_to_server()

func _on_match_state_updated(match_data: Dictionary, players: Array, team_states: Array, heroes: Array, hand: Array, statuses: Array, casts: Array) -> void:
	_last_state = {
		"match": match_data,
		"players": players,
		"team_states": team_states,
		"heroes": heroes,
		"hand": hand,
		"statuses": statuses,
		"casts": casts,
	}
	_update_match_ui(_last_state)

func _on_match_found(match_id: String, team: int) -> void:
	_current_match_id = match_id
	_current_team = team
	FlowState.set_current_match(match_id, team)
	_client.current_match_id = match_id
	_client.current_team = team
	match_label.text = "Match: %s (Team %s)" % [match_id, team]
	_update_ui_for_connection(_client.connected)

func _on_event_received(event_type: String, data: Dictionary) -> void:
	match event_type:
		"cast_started":
			_set_status("Cast started: %s" % str(data.get("action_slug", "")))
		"cast_resolved":
			_set_status("Cast resolved: %s" % str(data.get("action_slug", "")))
		"damage_dealt":
			_set_status("Damage: %s" % int(data.get("amount", 0)))
		"heal_applied":
			_set_status("Heal: %s" % int(data.get("amount", 0)))
		"match_won":
			var winner = int(data.get("winner_team", 0))
			FlowState.last_match_result = "Victory" if winner == _current_team else "Defeat!"
			FlowState.last_match_id = _current_match_id
			get_tree().change_scene_to_file(GAME_POST_SCENE)
		_:
			pass

func _on_error_received(code: String, message: String) -> void:
	_set_status("Error: %s - %s" % [code, message])

func _on_hero_card_double_clicked(card: Control) -> void:
	var slot_index = current_cards.find(card) + 1
	if slot_index <= 0:
		return
	_selected_caster_slot = slot_index
	_update_caster_label()
	_update_action_button_enabled_state()
	_set_status("Active hero set to %s." % _hero_name_for_slot(slot_index))

func _on_action_button_pressed(hand_slot_index: int) -> void:
	if not _client.connected or _current_match_id.is_empty():
		return
	if _selected_caster_slot <= 0:
		_set_status("Select an active hero first.")
		return

	var card = action_cards[hand_slot_index - 1]
	var action_slug = card.get_action_slug()
	if action_slug.is_empty():
		_set_status("No action in that slot.")
		return

	var targeting = _get_effective_targeting(action_slug, card.get_targeting())
	_show_action_details(
		action_slug,
		card.get_action_name(),
		card.get_action_description(),
		card.get_action_elements(),
		targeting
	)
	_set_status("Casting %s through %s..." % [card.get_action_name(), _hero_name_for_slot(_selected_caster_slot)])
	_client.cast_action(_selected_caster_slot, hand_slot_index)

func _on_reroll_pressed() -> void:
	if not _client.connected or _current_match_id.is_empty():
		return
	_set_status("Rerolling hand...")
	_client.reroll_hand()

func _update_ui_for_connection(connected: bool) -> void:
	connection_label.text = "Status: Online" if connected else "Status: Connecting..."
	match_label.text = "Match: %s (Team %s)" % [_current_match_id, _current_team]
	reroll_button.set_enabled_state(connected and not _current_match_id.is_empty())
	_update_action_button_enabled_state()
	_update_caster_label()

func _update_match_ui(state: Dictionary) -> void:
	var team_states = state.get("team_states", [])
	var hand = state.get("hand", [])
	var heroes = state.get("heroes", [])

	var my_team_state: Dictionary = {}
	for team_state in team_states:
		if int(team_state.get("team", 0)) == _current_team:
			my_team_state = team_state
			break

	var my_heroes = _ordered_team_heroes(heroes, _current_team)
	var my_hand = _ordered_hand_slots(hand, _current_team)

	var energy = int(my_team_state.get("energy", 0))
	var energy_max = int(my_team_state.get("energy_max", 10))
	mana_badge.text = "ENERGY %s / %s" % [energy, energy_max]

	var hero_slugs: Array[String] = []
	for hero in my_heroes:
		hero_slugs.append(str(hero.get("hero_slug", "")))
	if not hero_slugs.is_empty():
		_set_current_heroes(hero_slugs)
		if _selected_caster_slot <= 0 or _selected_caster_slot > hero_slugs.size():
			_selected_caster_slot = 1

	_update_hand_buttons(my_hand)
	_update_caster_label()
	_update_action_button_enabled_state()

func _ordered_team_heroes(heroes: Array, team: int) -> Array:
	var ordered: Dictionary = {}
	var unordered: Array = []
	for hero in heroes:
		if int(hero.get("team", 0)) != team:
			continue
		var slot = int(hero.get("slot", hero.get("slot_index", 0)))
		if slot > 0:
			ordered[slot] = hero
		else:
			unordered.append(hero)

	var result: Array = []
	for slot in range(1, 4):
		if ordered.has(slot):
			result.append(ordered[slot])
	for hero in unordered:
		result.append(hero)
	return result

func _ordered_hand_slots(hand: Array, team: int) -> Array:
	var ordered: Dictionary = {}
	for slot in hand:
		if int(slot.get("team", 0)) == team:
			ordered[int(slot.get("slot_index", 0))] = slot

	var result: Array = []
	for index in range(1, action_cards.size() + 1):
		if ordered.has(index):
			result.append(ordered[index])
	return result

func _update_hand_buttons(hand: Array) -> void:
	for index in range(action_cards.size()):
		var slot_index = index + 1
		var action_card = action_cards[index]
		var card_data: Dictionary = {}
		for card in hand:
			if int(card.get("slot_index", 0)) == slot_index:
				card_data = card
				break

		if card_data.is_empty():
			action_card.configure_empty(slot_index)
			continue

		var action_slug = str(card_data.get("action_slug", ""))
		var action_config = _load_action_config(action_slug)
		var action_name = str(card_data.get("action_name", action_config.get("full_name", action_slug.capitalize() if not action_slug.is_empty() else "Unknown")))
		var action_description = str(action_config.get("description", ""))
		var action_elements = action_config.get("element", [])
		var target_rule = str(card_data.get("target_rule", action_config.get("target_rule", "enemy_auto")))
		var targeting = _get_effective_targeting(action_slug, card_data.get("targeting", action_config.get("targeting", _target_rule_to_targeting(target_rule))))

		action_card.configure_action(slot_index, action_slug, action_name, action_description, action_elements, targeting)

	_update_action_button_enabled_state()
	_update_action_detail_placeholder()

func _update_action_button_enabled_state() -> void:
	for index in range(action_cards.size()):
		var action_card: ActionCard = action_cards[index]
		var enabled = _client.connected and not _current_match_id.is_empty() and _selected_caster_slot > 0 and not action_card.get_action_slug().is_empty()
		action_card.set_enabled_state(enabled)
		action_card.set_selected(false)

func _update_caster_label() -> void:
	if _selected_caster_slot <= 0:
		caster_label.text = "Active Hero: -"
		return
	caster_label.text = "Active Hero: %s" % _hero_name_for_slot(_selected_caster_slot)

func _hero_name_for_slot(slot_index: int) -> String:
	var hero_slug = _get_selected_caster_hero_slug(slot_index)
	if hero_slug.is_empty():
		return "Hero %s" % slot_index
	var hero_config = _load_hero_config(hero_slug)
	return str(hero_config.get("full_name", hero_slug.replace("-", " ").capitalize()))

func _get_selected_caster_hero_slug(slot_index: int = -1) -> String:
	if slot_index == -1:
		slot_index = _selected_caster_slot
	if slot_index <= 0 or slot_index > _displayed_hero_slugs.size():
		return ""
	return _displayed_hero_slugs[slot_index - 1]

func _target_rule_to_targeting(target_rule: String) -> Dictionary:
	match target_rule:
		"ally_single":
			return {"side": "ally", "scope": "single", "selection": "manual", "allow_self": true}
		"self":
			return {"side": "ally", "scope": "single", "selection": "auto", "allow_self": true}
		"any_single":
			return {"side": "any", "scope": "single", "selection": "manual", "allow_self": true}
		"ally_auto":
			return {"side": "ally", "scope": "single", "selection": "auto", "allow_self": true}
		"enemy_single":
			return {"side": "enemy", "scope": "single", "selection": "manual", "allow_self": false}
		"enemy_auto":
			return {"side": "enemy", "scope": "single", "selection": "auto", "allow_self": false}
		"any_auto":
			return {"side": "any", "scope": "single", "selection": "auto", "allow_self": true}
		"no_target":
			return {"side": "ally", "scope": "none", "selection": "auto", "allow_self": true}
		_:
			return {"side": "enemy", "scope": "single", "selection": "auto", "allow_self": false}

func _get_effective_targeting(action_slug: String, base_targeting: Variant) -> Dictionary:
	var resolved: Dictionary = {}
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

func _load_hero_config(hero_slug: String) -> Dictionary:
	return GameData.load_hero_config(hero_slug)

func _load_action_config(action_slug: String) -> Dictionary:
	if action_slug.is_empty():
		return {}
	if _action_config_cache.has(action_slug):
		return _action_config_cache[action_slug]
	var config := GameData.load_action_config(action_slug)
	_action_config_cache[action_slug] = config
	return config

func _show_action_details(action_slug: String, action_name: String, action_description: Variant, action_elements: Variant, targeting: Dictionary) -> void:
	if action_slug.is_empty():
		_update_action_detail_placeholder()
		return

	var description = str(action_description)
	if description.is_empty():
		description = "No description available."

	var header = action_name
	var element_text = _format_element_list(action_elements)
	if not element_text.is_empty():
		header += " [%s]" % element_text

	action_detail_label.text = "%s\n%s\n%s" % [header, _describe_targeting(targeting), description]

func _update_action_detail_placeholder() -> void:
	action_detail_label.text = "Double-click a hero to set the caster.\nTap an action card to cast it through that hero."

func _format_element_list(elements: Variant) -> String:
	if not (elements is Array):
		return ""
	var names: Array[String] = []
	for element_name in elements:
		var text = str(element_name).strip_edges()
		if not text.is_empty():
			names.append(text.capitalize())
	return "/".join(names)

func _describe_targeting(targeting: Dictionary) -> String:
	var scope = str(targeting.get("scope", "single"))
	var side = str(targeting.get("side", "enemy"))
	var selection = str(targeting.get("selection", "auto"))
	if scope == "none":
		return "Target: none"
	var side_text = "Any" if side == "any" else side.capitalize()
	return "Target: %s %s (%s)" % [side_text, scope, selection]

func _set_current_heroes(hero_slugs: Array[String]) -> void:
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

func create_card(hero_slug: String) -> Control:
	var card = card_scene.instantiate()
	add_child(card)
	card.load_hero(hero_slug)
	card.double_clicked.connect(_on_hero_card_double_clicked)
	return card

func _load_initial_cards() -> void:
	if FlowState.selected_heroes.size() == 3:
		_set_current_heroes(FlowState.selected_heroes)
		if _selected_caster_slot <= 0:
			_selected_caster_slot = 1
	else:
		_update_action_button_enabled_state()
	_update_caster_label()

func update_layout() -> void:
	var viewport_size = get_viewport_rect().size
	LayoutManager.apply_layout("cave", bg_texture, current_cards, viewport_size)
	for index in range(action_cards.size()):
		LayoutManager.apply_box_layout(action_cards[index], "action%s" % str(index + 1), viewport_size)
	LayoutManager.apply_box_layout(mana_badge, "mana", viewport_size)
	LayoutManager.apply_box_layout(reroll_button, "reroll", viewport_size)

func _set_status(message: String) -> void:
	status_label.text = "Status: %s" % message

func _redirect_to_register() -> void:
	if FlowState.display_name.strip_edges().is_empty():
		get_tree().change_scene_to_file(REGISTER_SCENE)

func _redirect_to_find_match() -> void:
	if _current_match_id.is_empty():
		get_tree().change_scene_to_file(FIND_MATCH_SCENE)
