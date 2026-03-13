extends Control

const HOME_SCENE := "res://scenes/Home.tscn"
const FIND_MATCH_SCENE := "res://scenes/FindMatch.tscn"

@onready var result_label: Label = $SafeArea/Panel/Margin/Content/ResultLabel
@onready var detail_label: Label = $SafeArea/Panel/Margin/Content/DetailLabel

func _ready() -> void:
	var result := FlowState.last_match_result.strip_edges()
	if result.is_empty():
		result_label.text = "No completed match yet."
	else:
		result_label.text = result
	if FlowState.last_match_id.is_empty():
		detail_label.text = "Play a match to see the post-game summary here."
	else:
		detail_label.text = "Last match: %s" % FlowState.last_match_id

func _on_home_pressed() -> void:
	get_tree().change_scene_to_file(HOME_SCENE)

func _on_play_again_pressed() -> void:
	get_tree().change_scene_to_file(FIND_MATCH_SCENE)
