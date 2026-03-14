extends Control

const GAME_PLAY_SCENE := "res://scenes/GamePlay.tscn"
const HOME_SCENE := "res://scenes/Home.tscn"
const REGISTER_SCENE := "res://scenes/Register.tscn"

@onready var hero_1_select: OptionButton = $SafeArea/Panel/Margin/Content/Hero1Select
@onready var hero_2_select: OptionButton = $SafeArea/Panel/Margin/Content/Hero2Select
@onready var hero_3_select: OptionButton = $SafeArea/Panel/Margin/Content/Hero3Select
@onready var summary_label: Label = $SafeArea/Panel/Margin/Content/SummaryLabel
@onready var status_label: Label = $SafeArea/Panel/Margin/Content/StatusLabel
@onready var back_button: Button = $SafeArea/Panel/Margin/Content/ButtonRow/BackButton
@onready var queue_button: Button = $SafeArea/Panel/Margin/Content/ButtonRow/EnterArenaButton

var available_heroes: Array[String] = []
var _client: GameServerClient
var _queue_requested: bool = false
var _leaving_queue: bool = false

func _ready() -> void:
	if FlowState.display_name.strip_edges().is_empty():
		get_tree().change_scene_to_file(REGISTER_SCENE)
		return
	_client = FlowState.client
	_client.connected_to_server.connect(_on_connected)
	_client.match_found.connect(_on_match_found)
	_client.error_received.connect(_on_error_received)
	_client.disconnected_from_server.connect(_on_disconnected)
	_client.matchmaking_queued.connect(_on_matchmaking_queued)
	_client.matchmaking_left.connect(_on_matchmaking_left)
	if not FlowState.current_match_id.is_empty():
		get_tree().change_scene_to_file(GAME_PLAY_SCENE)
		return
	_scan_heroes()
	_populate_selectors()
	_restore_selected_heroes()
	_update_summary()
	_update_queue_ui(false)
	if _client.connected:
		status_label.text = "Choose your trio, then queue for matchmaking."
	else:
		status_label.text = "Connecting to server..."
		_client.connect_to_server()

func _on_back_pressed() -> void:
	if _queue_requested:
		return
	get_tree().change_scene_to_file(HOME_SCENE)

func _on_enter_arena_pressed() -> void:
	if _queue_requested:
		_cancel_matchmaking()
		return
	var heroes := _selected_heroes_payload()
	FlowState.set_selected_heroes(heroes)
	if not _client.connected:
		_queue_requested = true
		status_label.text = "Connecting to server..."
		_update_queue_ui(true)
		_client.connect_to_server()
		return
	_queue_for_matchmaking(heroes)

func _on_selection_changed(_index: int) -> void:
	_update_summary()

func _scan_heroes() -> void:
	var dir := DirAccess.open("res://data/hero/")
	if dir == null:
		available_heroes = ["iron-knight", "dawn-priest", "arc-strider"]
		return
	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		if dir.current_is_dir() and not file_name.begins_with("."):
			available_heroes.append(file_name)
		file_name = dir.get_next()
	available_heroes.sort()

func _populate_selectors() -> void:
	for selector in [hero_1_select, hero_2_select, hero_3_select]:
		selector.clear()
		selector.item_selected.connect(_on_selection_changed)
		for hero_slug in available_heroes:
			selector.add_item(hero_slug)
	if available_heroes.size() >= 3:
		hero_1_select.select(0)
		hero_2_select.select(1)
		hero_3_select.select(2)

func _restore_selected_heroes() -> void:
	if FlowState.selected_heroes.size() != 3:
		return
	var selectors = [hero_1_select, hero_2_select, hero_3_select]
	for index in range(3):
		var hero_slug = FlowState.selected_heroes[index]
		var selector: OptionButton = selectors[index]
		for item_index in range(selector.item_count):
			if selector.get_item_text(item_index) == hero_slug:
				selector.select(item_index)
				break

func _selected_heroes_payload() -> Array[String]:
	var heroes: Array[String] = []
	heroes.append(hero_1_select.get_item_text(hero_1_select.selected))
	heroes.append(hero_2_select.get_item_text(hero_2_select.selected))
	heroes.append(hero_3_select.get_item_text(hero_3_select.selected))
	return heroes

func _update_summary() -> void:
	var heroes = _selected_heroes_payload()
	summary_label.text = "Queued trio: %s, %s, %s" % heroes

func _on_connected(_player_id: String) -> void:
	if _queue_requested:
		_queue_for_matchmaking(FlowState.selected_heroes)
		return
	status_label.text = "Choose your trio, then queue for matchmaking."
	_update_queue_ui(false)

func _on_matchmaking_queued() -> void:
	status_label.text = "Searching for an opponent..."
	_update_queue_ui(true)

func _on_matchmaking_left() -> void:
	_queue_requested = false
	_leaving_queue = false
	status_label.text = "Matchmaking stopped."
	_update_queue_ui(false)

func _on_match_found(match_id: String, team: int) -> void:
	FlowState.set_current_match(match_id, team)
	status_label.text = "Match found. Entering arena..."
	get_tree().change_scene_to_file(GAME_PLAY_SCENE)

func _on_error_received(_code: String, message: String) -> void:
	_queue_requested = false
	_leaving_queue = false
	status_label.text = message if not message.is_empty() else "Matchmaking failed."
	_update_queue_ui(false)

func _on_disconnected() -> void:
	if _leaving_queue:
		return
	status_label.text = "Connection lost. Reconnecting..."
	_update_queue_ui(true)
	_client.connect_to_server()

func _queue_for_matchmaking(heroes: Array[String]) -> void:
	if heroes.size() != 3:
		status_label.text = "Select 3 heroes."
		_queue_requested = false
		_update_queue_ui(false)
		return
	_queue_requested = true
	status_label.text = "Queueing for matchmaking..."
	_update_queue_ui(true)
	_client.queue_for_matchmaking(heroes[0], heroes[1], heroes[2])

func _cancel_matchmaking() -> void:
	_queue_requested = false
	_leaving_queue = true
	status_label.text = "Stopping matchmaking..."
	_update_queue_ui(true)
	_client.leave_matchmaking()

func _update_queue_ui(waiting: bool) -> void:
	back_button.disabled = waiting
	queue_button.disabled = false
	hero_1_select.disabled = waiting
	hero_2_select.disabled = waiting
	hero_3_select.disabled = waiting
	if waiting:
		queue_button.text = "Stop Queueing"
	else:
		queue_button.text = "Queue Matchmaking"
