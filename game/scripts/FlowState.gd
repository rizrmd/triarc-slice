extends Node

const SESSION_PATH := "user://game_session.cfg"

var selected_heroes: Array[String] = []
var display_name: String = ""
var last_match_result: String = ""
var last_match_id: String = ""

func _ready() -> void:
	var config := ConfigFile.new()
	if config.load(SESSION_PATH) != OK:
		return
	display_name = str(config.get_value("session", "display_name", ""))

func set_selected_heroes(hero_slugs: Array) -> void:
	selected_heroes.clear()
	for hero_slug in hero_slugs:
		selected_heroes.append(str(hero_slug))

func clear_post_match() -> void:
	last_match_result = ""
	last_match_id = ""
