extends Control

const GAME_PLAY_SCENE := "res://scenes/GamePlay.tscn"
const HOME_SCENE := "res://scenes/Home.tscn"

@onready var hero_1_select: OptionButton = $SafeArea/Panel/Margin/Content/Hero1Select
@onready var hero_2_select: OptionButton = $SafeArea/Panel/Margin/Content/Hero2Select
@onready var hero_3_select: OptionButton = $SafeArea/Panel/Margin/Content/Hero3Select
@onready var summary_label: Label = $SafeArea/Panel/Margin/Content/SummaryLabel

var available_heroes: Array[String] = []

func _ready() -> void:
	_scan_heroes()
	_populate_selectors()
	_restore_selected_heroes()
	_update_summary()

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(HOME_SCENE)

func _on_enter_arena_pressed() -> void:
	FlowState.set_selected_heroes(_selected_heroes_payload())
	get_tree().change_scene_to_file(GAME_PLAY_SCENE)

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

func _selected_heroes_payload() -> Array:
	return [
		hero_1_select.get_item_text(hero_1_select.selected),
		hero_2_select.get_item_text(hero_2_select.selected),
		hero_3_select.get_item_text(hero_3_select.selected),
	]

func _update_summary() -> void:
	var heroes = _selected_heroes_payload()
	summary_label.text = "Queued trio: %s, %s, %s" % heroes
