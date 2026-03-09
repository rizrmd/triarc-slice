extends Control

var card_scene = preload("res://scenes/Card.tscn")
var current_cards: Array = []
var _extra_box_nodes := {}
var available_heroes: Array[String] = []
var _client := SpacetimeClient.new()
var _refresh_in_flight := false
var _busy := false
var _current_match_id: int = -1
var _current_team: int = 0
var _displayed_hero_slugs: Array[String] = []
var _selected_caster_slot: int = 0
var _pending_hand_slot: int = 0
var _pending_action_target_rule: String = ""
var _action_defs := {}

@onready var bg_texture = $Background
@onready var server_url_edit: LineEdit = $UI/LobbyPanel/MarginContainer/LobbyVBox/ServerUrlEdit
@onready var database_edit: LineEdit = $UI/LobbyPanel/MarginContainer/LobbyVBox/DatabaseEdit
@onready var display_name_edit: LineEdit = $UI/LobbyPanel/MarginContainer/LobbyVBox/DisplayNameEdit
@onready var hero_1_select: OptionButton = $UI/LobbyPanel/MarginContainer/LobbyVBox/Hero1Select
@onready var hero_2_select: OptionButton = $UI/LobbyPanel/MarginContainer/LobbyVBox/Hero2Select
@onready var hero_3_select: OptionButton = $UI/LobbyPanel/MarginContainer/LobbyVBox/Hero3Select
@onready var register_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/RegisterButton
@onready var queue_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/QueueButtons/QueueButton
@onready var leave_queue_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/QueueButtons/LeaveQueueButton
@onready var refresh_button: Button = $UI/LobbyPanel/MarginContainer/LobbyVBox/RefreshButton
@onready var identity_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/IdentityLabel
@onready var profile_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/ProfileLabel
@onready var queue_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/QueueLabel
@onready var match_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/MatchLabel
@onready var energy_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/EnergyLabel
@onready var caster_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/CasterLabel
@onready var hand_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/HandLabel
@onready var target_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/TargetLabel
@onready var status_label: Label = $UI/LobbyPanel/MarginContainer/LobbyVBox/StatusLabel
@onready var poll_timer: Timer = $UI/PollTimer
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

	_client.load_session()
	server_url_edit.text = _client.base_url
	database_edit.text = _client.database_name

	register_button.pressed.connect(_on_register_pressed)
	queue_button.pressed.connect(_on_queue_pressed)
	leave_queue_button.pressed.connect(_on_leave_queue_pressed)
	refresh_button.pressed.connect(_on_refresh_pressed)
	poll_timer.timeout.connect(_on_poll_timer_timeout)
	reroll_button.pressed.connect(_on_reroll_pressed)
	for index in range(caster_buttons.size()):
		caster_buttons[index].pressed.connect(_on_caster_button_pressed.bind(index + 1))
	for index in range(action_buttons.size()):
		action_buttons[index].pressed.connect(_on_action_button_pressed.bind(index + 1))
	for index in range(ally_target_buttons.size()):
		ally_target_buttons[index].pressed.connect(_on_target_button_pressed.bind("ally", index + 1))
	for index in range(enemy_target_buttons.size()):
		enemy_target_buttons[index].pressed.connect(_on_target_button_pressed.bind("enemy", index + 1))

	await _bootstrap_connection()

func _bootstrap_connection() -> void:
	_apply_connection_settings()
	_set_status("Connecting to SpaceTimeDB...")
	var result := await _client.ensure_identity(self)
	if not result.ok:
		_set_status(result.error)
		return

	identity_label.text = "Identity: %s" % _short_identity(_client.identity)
	poll_timer.start()
	await _refresh_server_state()

func _apply_connection_settings() -> void:
	_client.configure(server_url_edit.text, database_edit.text)
	_client.save_session()

func _setup_hero_selectors() -> void:
	for selector in [hero_1_select, hero_2_select, hero_3_select]:
		selector.clear()
		for hero_slug in available_heroes:
			selector.add_item(hero_slug)

	if available_heroes.size() >= 3:
		hero_1_select.select(0)
		hero_2_select.select(1)
		hero_3_select.select(2)

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
		available_heroes = ["arcane-paladin", "earth-warden", "dawn-priest"]

func _load_initial_cards() -> void:
	current_cards.clear()
	var initial_heroes := [
		_get_selected_hero_slug(hero_1_select),
		_get_selected_hero_slug(hero_2_select),
		_get_selected_hero_slug(hero_3_select),
	]
	_set_current_heroes(initial_heroes)

func _set_current_heroes(hero_slugs: Array) -> void:
	var normalized: Array[String] = []
	for hero_slug in hero_slugs:
		if hero_slug == null:
			continue
		var slug := str(hero_slug)
		if slug.is_empty():
			continue
		normalized.append(slug)

	if normalized == _displayed_hero_slugs:
		return

	_displayed_hero_slugs = normalized
	for card in current_cards:
		card.queue_free()
	current_cards.clear()

	for hero_slug in normalized:
		var card = create_card(hero_slug)
		current_cards.append(card)

	update_layout()

func create_card(hero_slug: String):
	var card = card_scene.instantiate()
	add_child(card)
	card.load_hero(hero_slug)
	card.double_clicked.connect(_on_card_double_clicked)
	return card

func update_layout():
	var viewport_size = get_viewport_rect().size
	LayoutManager.apply_layout("cave", bg_texture, current_cards, viewport_size)
	_render_extra_layout_boxes(viewport_size)

func _on_register_pressed() -> void:
	if _busy:
		return
	_busy = true
	_apply_connection_settings()
	_set_status("Registering profile...")
	var display_name := display_name_edit.text.strip_edges()
	var result := await _client.call_reducer(self, "upsert_profile", [display_name])
	_busy = false
	if not result.ok:
		_set_status(result.error)
		return

	await _refresh_server_state()
	_set_status("Profile saved.")

func _on_queue_pressed() -> void:
	if _busy:
		return
	_busy = true
	_apply_connection_settings()
	_set_status("Queueing for matchmaking...")
	var result := await _client.call_reducer(self, "queue_for_matchmaking", _selected_heroes_payload())
	_busy = false
	if not result.ok:
		_set_status(result.error)
		return

	await _refresh_server_state()
	_set_status("Matchmaking request sent.")

func _on_leave_queue_pressed() -> void:
	if _busy:
		return
	_busy = true
	_apply_connection_settings()
	_set_status("Leaving matchmaking queue...")
	var result := await _client.call_reducer(self, "leave_matchmaking", [])
	_busy = false
	if not result.ok:
		_set_status(result.error)
		return

	await _refresh_server_state()
	_set_status("Left matchmaking queue.")

func _on_refresh_pressed() -> void:
	await _refresh_server_state()

func _on_reroll_pressed() -> void:
	if _busy or _current_match_id < 0:
		return
	_busy = true
	_set_status("Rerolling hand...")
	var result := await _client.call_reducer(self, "reroll_hand", [_current_match_id])
	_busy = false
	if not result.ok:
		_set_status(result.error)
		return
	_pending_hand_slot = 0
	_pending_action_target_rule = ""
	await _refresh_server_state()
	_set_status("Hand rerolled.")

func _on_caster_button_pressed(slot_index: int) -> void:
	if _busy or _current_match_id < 0:
		return
	_busy = true
	_set_status("Selecting caster %s..." % slot_index)
	var result := await _client.call_reducer(self, "select_caster", [_current_match_id, slot_index])
	_busy = false
	if not result.ok:
		_set_status(result.error)
		return
	await _refresh_server_state()
	_set_status("Caster selected.")

func _on_action_button_pressed(hand_slot_index: int) -> void:
	if _current_match_id < 0:
		return
	var button := action_buttons[hand_slot_index - 1]
	var target_rule := str(button.get_meta("target_rule", ""))
	if target_rule.is_empty():
		_set_status("No action in that slot.")
		return
	_pending_hand_slot = hand_slot_index
	_pending_action_target_rule = target_rule
	var action_name := str(button.get_meta("action_name", button.text))
	target_label.text = "Target: %s selected, choose a valid target" % action_name
	_update_target_buttons()

func _on_target_button_pressed(target_side: String, slot_index: int) -> void:
	if _busy or _current_match_id < 0 or _pending_hand_slot == 0:
		return
	if not _is_target_side_valid(target_side):
		_set_status("Invalid target for selected action.")
		return

	_busy = true
	_set_status("Casting action...")
	var result := await _client.call_reducer(self, "cast_action", [_current_match_id, _pending_hand_slot, slot_index])
	_busy = false
	if not result.ok:
		_set_status(result.error)
		return

	_pending_hand_slot = 0
	_pending_action_target_rule = ""
	await _refresh_server_state()
	_set_status("Action sent.")

func _on_poll_timer_timeout() -> void:
	await _refresh_server_state()

func _refresh_server_state() -> void:
	if _refresh_in_flight:
		return
	_refresh_in_flight = true

	var identity_result := await _client.ensure_identity(self)
	if not identity_result.ok:
		_set_status(identity_result.error)
		_refresh_in_flight = false
		return

	identity_label.text = "Identity: %s" % _short_identity(_client.identity)

	var profile_result := await _client.sql(self, "select * from player_profile")
	var queue_result := await _client.sql(self, "select * from matchmaking_queue")
	var player_result := await _client.sql(self, "select * from match_player")
	var match_result := await _client.sql(self, "select * from game_match")
	var hero_result := await _client.sql(self, "select * from match_hero")
	var team_state_result := await _client.sql(self, "select * from match_team_state")
	var hand_result := await _client.sql(self, "select * from match_hand_slot")
	var action_def_result := await _client.sql(self, "select * from action_def")

	if not profile_result.ok:
		_set_status(profile_result.error)
		_refresh_in_flight = false
		return
	if not queue_result.ok:
		_set_status(queue_result.error)
		_refresh_in_flight = false
		return
	if not player_result.ok:
		_set_status(player_result.error)
		_refresh_in_flight = false
		return
	if not match_result.ok:
		_set_status(match_result.error)
		_refresh_in_flight = false
		return
	if not hero_result.ok:
		_set_status(hero_result.error)
		_refresh_in_flight = false
		return
	if not team_state_result.ok:
		_set_status(team_state_result.error)
		_refresh_in_flight = false
		return
	if not hand_result.ok:
		_set_status(hand_result.error)
		_refresh_in_flight = false
		return
	if not action_def_result.ok:
		_set_status(action_def_result.error)
		_refresh_in_flight = false
		return

	_update_profile_ui(profile_result.rows)
	_update_queue_ui(queue_result.rows)
	_update_match_ui(player_result.rows, match_result.rows, hero_result.rows)
	_update_action_defs(action_def_result.rows)
	_update_team_state_ui(team_state_result.rows)
	_update_hand_ui(hand_result.rows)
	_refresh_in_flight = false

func _update_profile_ui(rows: Array) -> void:
	var my_profile := {}
	for row in rows:
		if str(row.get("identity", "")) == _client.identity:
			my_profile = row
			break

	if my_profile.is_empty():
		profile_label.text = "Profile: not registered"
		return

	var display_name := str(my_profile.get("display_name", ""))
	if display_name_edit.text.strip_edges().is_empty():
		display_name_edit.text = display_name
	profile_label.text = "Profile: %s" % display_name

func _update_queue_ui(rows: Array) -> void:
	for row in rows:
		if str(row.get("identity", "")) == _client.identity:
			queue_label.text = "Queue: waiting since %s" % _format_timestamp(row.get("queued_at", 0))
			return
	queue_label.text = "Queue: idle"

func _update_match_ui(player_rows: Array, match_rows: Array, hero_rows: Array) -> void:
	var my_match_player := {}
	for row in player_rows:
		if str(row.get("identity", "")) == _client.identity:
			my_match_player = row
			break

	if my_match_player.is_empty():
		_current_match_id = -1
		_current_team = 0
		_selected_caster_slot = 0
		_pending_hand_slot = 0
		_pending_action_target_rule = ""
		match_label.text = "Match: none"
		energy_label.text = "Energy: -"
		caster_label.text = "Caster: none"
		hand_label.text = "Hand: none"
		target_label.text = "Target: select a card first"
		_update_caster_buttons()
		_update_hand_buttons({})
		_update_target_buttons()
		_set_current_heroes(_selected_hero_strings())
		return

	_current_match_id = int(my_match_player.get("match_id", -1))
	_current_team = int(my_match_player.get("team", 0))

	var current_match := {}
	for row in match_rows:
		if int(row.get("match_id", -1)) == _current_match_id:
			current_match = row
			break

	var phase_label := "unknown"
	match int(current_match.get("phase", 0)):
		1:
			phase_label = "waiting"
		2:
			phase_label = "active"
		3:
			phase_label = "finished"

	match_label.text = "Match: #%s team %s (%s)" % [_current_match_id, _current_team, phase_label]

	var my_heroes: Array = []
	for row in hero_rows:
		if int(row.get("match_id", -1)) != _current_match_id:
			continue
		if int(row.get("team", 0)) != _current_team:
			continue
		my_heroes.append(row)

	my_heroes.sort_custom(func(a, b): return int(a.get("slot_index", 0)) < int(b.get("slot_index", 0)))

	var hero_slugs: Array = []
	for row in my_heroes:
		hero_slugs.append(str(row.get("hero_slug", "")))

	if hero_slugs.size() > 0:
		_set_current_heroes(hero_slugs)

func _update_action_defs(rows: Array) -> void:
	_action_defs.clear()
	for row in rows:
		_action_defs[str(row.get("slug", ""))] = row

func _update_team_state_ui(rows: Array) -> void:
	if _current_match_id < 0 or _current_team == 0:
		energy_label.text = "Energy: -"
		caster_label.text = "Caster: none"
		_selected_caster_slot = 0
		_update_caster_buttons()
		return

	for row in rows:
		if int(row.get("match_id", -1)) != _current_match_id:
			continue
		if int(row.get("team", 0)) != _current_team:
			continue

		var energy := int(row.get("energy", 0))
		var energy_max := int(row.get("energy_max", 0))
		_selected_caster_slot = int(row.get("selected_caster_slot", 0))
		energy_label.text = "Energy: %s / %s" % [energy, energy_max]
		caster_label.text = "Caster: %s" % (_selected_caster_slot if _selected_caster_slot > 0 else "none")
		_update_caster_buttons()
		return

	energy_label.text = "Energy: -"
	caster_label.text = "Caster: none"
	_selected_caster_slot = 0
	_update_caster_buttons()

func _update_hand_ui(rows: Array) -> void:
	if _current_match_id < 0 or _current_team == 0:
		hand_label.text = "Hand: none"
		_update_hand_buttons({})
		_update_target_buttons()
		return

	var hand_by_slot := {}
	for row in rows:
		if int(row.get("match_id", -1)) != _current_match_id:
			continue
		if int(row.get("team", 0)) != _current_team:
			continue
		hand_by_slot[int(row.get("slot_index", 0))] = row

	var populated := 0
	for key in hand_by_slot.keys():
		if int(key) > 0:
			populated += 1
	hand_label.text = "Hand: %s / 5 cards" % populated
	_update_hand_buttons(hand_by_slot)
	_update_target_buttons()

func _update_caster_buttons() -> void:
	for index in range(caster_buttons.size()):
		var slot := index + 1
		caster_buttons[index].disabled = _current_match_id < 0
		caster_buttons[index].text = "Hero %s%s" % [slot, " *" if slot == _selected_caster_slot else ""]

func _update_hand_buttons(hand_by_slot: Dictionary) -> void:
	for index in range(action_buttons.size()):
		var slot := index + 1
		var button := action_buttons[index]
		if not hand_by_slot.has(slot):
			button.disabled = true
			button.text = "Action %s" % slot
			button.set_meta("target_rule", "")
			button.set_meta("action_name", "")
			continue

		var hand_row: Dictionary = hand_by_slot[slot]
		var action_slug := str(hand_row.get("action_slug", ""))
		var action_def: Dictionary = _action_defs.get(action_slug, {})
		var action_name := str(action_def.get("display_name", action_slug))
		var energy_cost := int(action_def.get("energy_cost", 0))
		var cast_time := int(action_def.get("casting_time_ms", 0))
		var target_rule := str(action_def.get("target_rule", ""))
		button.disabled = _current_match_id < 0
		button.text = "%s. %s (%sE, %sms)" % [slot, action_name, energy_cost, cast_time]
		button.set_meta("target_rule", target_rule)
		button.set_meta("action_name", action_name)

func _update_target_buttons() -> void:
	var allow_ally := _pending_hand_slot != 0 and (_pending_action_target_rule == "ally_single" or _pending_action_target_rule == "self")
	var allow_enemy := _pending_hand_slot != 0 and _pending_action_target_rule == "enemy_single"

	for index in range(ally_target_buttons.size()):
		var slot := index + 1
		var self_only_block := _pending_action_target_rule == "self" and slot != _selected_caster_slot
		ally_target_buttons[index].disabled = (not allow_ally) or self_only_block
	for index in range(enemy_target_buttons.size()):
		enemy_target_buttons[index].disabled = not allow_enemy

	if _pending_hand_slot == 0:
		target_label.text = "Target: select a card first"

func _is_target_side_valid(target_side: String) -> bool:
	if _pending_action_target_rule == "enemy_single":
		return target_side == "enemy"
	if _pending_action_target_rule == "ally_single" or _pending_action_target_rule == "self":
		return target_side == "ally"
	return false

func _selected_heroes_payload() -> Array:
	return [
		_get_selected_hero_slug(hero_1_select),
		_get_selected_hero_slug(hero_2_select),
		_get_selected_hero_slug(hero_3_select),
	]

func _selected_hero_strings() -> Array:
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

func _short_identity(full_identity: String) -> String:
	if full_identity.length() <= 18:
		return full_identity
	return "%s...%s" % [full_identity.substr(0, 8), full_identity.substr(full_identity.length() - 6, 6)]

func _format_timestamp(value) -> String:
	var micros := int(value)
	if micros <= 0:
		return "unknown"
	var unix_time := float(micros) / 1000000.0
	return Time.get_datetime_string_from_unix_time(unix_time, true)

func _set_status(message: String) -> void:
	status_label.text = "Status: %s" % message

func _get_hero_pose_texture(slug: String) -> Texture2D:
	var res_path = ProjectSettings.globalize_path("res://")
	var ext_path = res_path.path_join("../data/hero/" + slug + "/img/pose-char-fg.webp")

	if FileAccess.file_exists(ext_path):
		var image = Image.load_from_file(ext_path)
		if image:
			return ImageTexture.create_from_image(image)

	var int_path = "res://data/hero/" + slug + "/img/pose-char-fg.webp"
	if ResourceLoader.exists(int_path):
		return load(int_path)

	return null

func _load_hero_config(slug: String) -> Dictionary:
	var res_path = ProjectSettings.globalize_path("res://")
	var ext_path = res_path.path_join("../data/hero/" + slug + "/hero.json")

	if FileAccess.file_exists(ext_path):
		var file = FileAccess.open(ext_path, FileAccess.READ)
		if file:
			var content = file.get_as_text()
			var json = JSON.new()
			if json.parse(content) == OK:
				return json.data

	var int_path = "res://data/hero/" + slug + "/hero.json"
	if FileAccess.file_exists(int_path):
		var file = FileAccess.open(int_path, FileAccess.READ)
		if file:
			var content = file.get_as_text()
			var json = JSON.new()
			if json.parse(content) == OK:
				return json.data

	return {}

func _parse_vector(data) -> Vector2:
	if data is Dictionary:
		return Vector2(data.get("x", 0), data.get("y", 0))
	return Vector2.ZERO

func _get_hero_pose_shadow_texture(slug: String) -> Texture2D:
	var res_path = ProjectSettings.globalize_path("res://")
	var ext_path = res_path.path_join("../data/hero/" + slug + "/img/pose-shadow.webp")

	if FileAccess.file_exists(ext_path):
		var image = Image.load_from_file(ext_path)
		if image:
			return ImageTexture.create_from_image(image)

	var int_path = "res://data/hero/" + slug + "/img/pose-shadow.webp"
	if ResourceLoader.exists(int_path):
		return load(int_path)

	return null

func _get_hero_pose_mask_texture(slug: String) -> Texture2D:
	var res_path = ProjectSettings.globalize_path("res://")
	var ext_path = res_path.path_join("../data/hero/" + slug + "/img/pose-mask-fg.webp")

	if FileAccess.file_exists(ext_path):
		var image = Image.load_from_file(ext_path)
		if image:
			return ImageTexture.create_from_image(image)

	var int_path = "res://data/hero/" + slug + "/img/pose-mask-fg.webp"
	if ResourceLoader.exists(int_path):
		return load(int_path)

	return null

func _render_extra_layout_boxes(viewport_size):
	var all_ids = LayoutManager.get_all_box_ids()
	for id in all_ids:
		if id.begins_with("hero"):
			continue

		if not _extra_box_nodes.has(id):
			var data = LayoutManager.get_box(id)
			var w = data.get("width", 100)
			var h = data.get("height", 100)
			var pose_slug = data.get("poseSlug", "")
			var tex = null
			var shadow_tex = null
			if pose_slug != "":
				tex = _get_hero_pose_texture(pose_slug)
				shadow_tex = _get_hero_pose_shadow_texture(pose_slug)

			var node
			if tex:
				var container = Control.new()
				container.mouse_filter = Control.MOUSE_FILTER_IGNORE
				container.custom_minimum_size = Vector2(w, h)
				container.size = Vector2(w, h)

				var hero_config = _load_hero_config(pose_slug)
				var pose_config = hero_config.get("pose", {})
				var char_fg_scale = pose_config.get("char_fg_scale", 100.0) / 100.0
				var char_fg_pos = _parse_vector(pose_config.get("char_fg_pos", {"x": 0, "y": 0}))
				var shadow_scale = pose_config.get("shadow_scale", 100.0) / 100.0
				var shadow_pos = _parse_vector(pose_config.get("shadow_pos", {"x": 0, "y": 0}))

				if shadow_tex:
					var shadow = Sprite2D.new()
					shadow.texture = shadow_tex
					shadow.centered = true
					var shadow_target_w = w * shadow_scale
					var shadow_tex_w = shadow_tex.get_width()
					var s_scale = shadow_target_w / shadow_tex_w if shadow_tex_w > 0 else 1.0
					shadow.scale = Vector2(s_scale, s_scale)
					shadow.position = Vector2(w / 2.0 + shadow_pos.x, h / 2.0 + shadow_pos.y)
					container.add_child(shadow)

				var sprite = Sprite2D.new()
				sprite.texture = tex
				sprite.centered = true
				var fg_target_w = w * char_fg_scale
				var tex_w = tex.get_width()
				var fg_scale = fg_target_w / tex_w if tex_w > 0 else 1.0
				sprite.scale = Vector2(fg_scale, fg_scale)
				sprite.position = Vector2(w / 2.0 + char_fg_pos.x, h / 2.0 + char_fg_pos.y)

				var mask_tex = _get_hero_pose_mask_texture(pose_slug)
				if mask_tex:
					var shader = load("res://shaders/mask.gdshader")
					if shader:
						var mat = ShaderMaterial.new()
						mat.shader = shader
						mat.set_shader_parameter("mask_texture", mask_tex)
						sprite.material = mat

				container.add_child(sprite)
				node = container
			else:
				var box = ColorRect.new()
				box.color = Color(1, 0, 0, 0.2)
				box.mouse_filter = Control.MOUSE_FILTER_IGNORE
				box.custom_minimum_size = Vector2(w, h)
				box.size = Vector2(w, h)
				var lbl = Label.new()
				lbl.text = data.get("label", id)
				lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
				lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
				lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				lbl.set_anchors_preset(Control.PRESET_FULL_RECT)
				box.add_child(lbl)
				node = box

			add_child(node)
			_extra_box_nodes[id] = node

		var extra_node = _extra_box_nodes[id]
		LayoutManager.apply_box_layout(extra_node, id, viewport_size)

func _on_card_double_clicked(card) -> void:
	if current_cards.has(card):
		current_cards.erase(card)
		card.queue_free()
		update_layout()
