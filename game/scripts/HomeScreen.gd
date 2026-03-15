extends Control

const FIND_MATCH_SCENE := "res://scenes/FindMatch.tscn"
const GAME_POST_SCENE := "res://scenes/GamePost.tscn"
const REGISTER_SCENE := "res://scenes/Register.tscn"
const DEV_GAMEPLAY_SCENE := "res://scenes/DevGameplay.tscn"

@onready var welcome_label: Label = $SafeArea/Content/WelcomeLabel
@onready var profile_label: Label = $SafeArea/Content/ProfileLabel

func _ready() -> void:
	var saved_name := FlowState.display_name.strip_edges()
	if saved_name.is_empty():
		welcome_label.text = "Assemble a trio and enter the arena."
		profile_label.text = "Account slot %d. No saved pilot profile yet." % FlowState.session_slot
		call_deferred("_redirect_to_register")
	else:
		welcome_label.text = "Welcome back, %s." % saved_name
		profile_label.text = "Account slot %d. Saved pilot profile restored." % FlowState.session_slot

func _on_find_match_pressed() -> void:
	if FlowState.display_name.strip_edges().is_empty():
		get_tree().change_scene_to_file(REGISTER_SCENE)
		return
	get_tree().change_scene_to_file(FIND_MATCH_SCENE)

func _on_results_pressed() -> void:
	get_tree().change_scene_to_file(GAME_POST_SCENE)

func _on_dev_gameplay_pressed() -> void:
	get_tree().change_scene_to_file(DEV_GAMEPLAY_SCENE)

func _redirect_to_register() -> void:
	if FlowState.display_name.strip_edges().is_empty():
		get_tree().change_scene_to_file(REGISTER_SCENE)
