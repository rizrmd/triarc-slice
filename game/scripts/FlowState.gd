extends Node

var client := GameServerClient.new()
var selected_heroes: Array[String] = []
var display_name: String = ""
var last_match_result: String = ""
var last_match_id: String = ""
var current_match_id: String = ""
var current_team: int = 0
var session_slot: int = 1

func _ready() -> void:
	session_slot = _resolve_session_slot()
	client.configure_session_slot(session_slot)
	client.load_session()
	display_name = client.display_name

func _process(_delta: float) -> void:
	client.process()

func set_selected_heroes(hero_slugs: Array) -> void:
	selected_heroes.clear()
	for hero_slug in hero_slugs:
		selected_heroes.append(str(hero_slug))

func set_current_match(match_id: String, team: int) -> void:
	current_match_id = match_id
	current_team = team

func clear_current_match() -> void:
	current_match_id = ""
	current_team = 0

func clear_post_match() -> void:
	last_match_result = ""
	last_match_id = ""

func _resolve_session_slot() -> int:
	for arg in OS.get_cmdline_user_args():
		if not arg.begins_with("--session-slot="):
			continue
		var value := arg.trim_prefix("--session-slot=")
		if value.is_valid_int():
			return max(value.to_int(), 1)
	return 1
