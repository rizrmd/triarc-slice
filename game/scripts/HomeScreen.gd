extends Control

const FIND_MATCH_SCENE := "res://scenes/FindMatch.tscn"
const GAME_PLAY_SCENE := "res://scenes/GamePlay.tscn"
const GAME_POST_SCENE := "res://scenes/GamePost.tscn"

@onready var welcome_label: Label = $SafeArea/Content/WelcomeLabel
@onready var profile_label: Label = $SafeArea/Content/ProfileLabel

func _ready() -> void:
	var saved_name := FlowState.display_name.strip_edges()
	if saved_name.is_empty():
		welcome_label.text = "Assemble a trio and enter the arena."
		profile_label.text = "No saved pilot profile yet."
	else:
		welcome_label.text = "Welcome back, %s." % saved_name
		profile_label.text = "Saved pilot profile restored."

func _on_find_match_pressed() -> void:
	get_tree().change_scene_to_file(FIND_MATCH_SCENE)

func _on_open_gameplay_pressed() -> void:
	get_tree().change_scene_to_file(GAME_PLAY_SCENE)

func _on_results_pressed() -> void:
	get_tree().change_scene_to_file(GAME_POST_SCENE)
