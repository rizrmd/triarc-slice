extends Control

const HOME_SCENE := "res://scenes/Home.tscn"
const GameData = preload("res://scripts/GameData.gd")

var card_scene = preload("res://scenes/Card.tscn")
var _current_cards: Array = []
var _available_heroes: Array[String] = []
var _available_actions: Array[String] = []
var _displayed_hero_slugs: Array[String] = []
var _selected_caster_slot: int = 1

@onready var bg_texture: TextureRect = $Background
@onready var status_label: Label = $UI/Hud/StatusLabel
@onready var caster_label: Label = $UI/Hud/CasterLabel
@onready var action_detail_label: Label = $UI/Hud/ActionDetailLabel
@onready var hero_selectors: Array[OptionButton] = [
	$UI/Hud/DevPanel/Margin/Content/Hero1Select,
	$UI/Hud/DevPanel/Margin/Content/Hero2Select,
	$UI/Hud/DevPanel/Margin/Content/Hero3Select,
]
@onready var action_selectors: Array[OptionButton] = [
	$UI/Hud/DevPanel/Margin/Content/Action1Select,
	$UI/Hud/DevPanel/Margin/Content/Action2Select,
	$UI/Hud/DevPanel/Margin/Content/Action3Select,
	$UI/Hud/DevPanel/Margin/Content/Action4Select,
	$UI/Hud/DevPanel/Margin/Content/Action5Select,
]
@onready var action_cards: Array[ActionCard] = [
	$UI/Hud/Action1Card,
	$UI/Hud/Action2Card,
	$UI/Hud/Action3Card,
	$UI/Hud/Action4Card,
	$UI/Hud/Action5Card,
]

func _ready() -> void:
	_available_heroes = GameData.list_hero_slugs()
	_available_actions = GameData.list_action_slugs()

	_populate_hero_selectors()
	_populate_action_selectors()
	_connect_inputs()
	_build_hero_cards()
	_refresh_action_cards()
	_update_caster_label()
	_update_action_detail_placeholder()
	status_label.text = "Sandbox mode. Double-click a hero, then tap an action card."

	call_deferred("update_layout")
	get_tree().root.size_changed.connect(update_layout)

func _connect_inputs() -> void:
	for selector in hero_selectors:
		selector.item_selected.connect(_on_hero_selection_changed)
	for selector in action_selectors:
		selector.item_selected.connect(_on_action_selection_changed)
	for index in range(action_cards.size()):
		action_cards[index].pressed.connect(_on_action_card_pressed.bind(index + 1))

func _populate_hero_selectors() -> void:
	for selector in hero_selectors:
		selector.clear()
		for hero_slug in _available_heroes:
			selector.add_item(hero_slug)
	if _available_heroes.size() >= 3:
		for index in range(3):
			var saved_slug := ""
			if FlowState.selected_heroes.size() == 3:
				saved_slug = FlowState.selected_heroes[index]
			var selected_index := _available_heroes.find(saved_slug)
			hero_selectors[index].select(selected_index if selected_index >= 0 else index)

func _populate_action_selectors() -> void:
	for selector in action_selectors:
		selector.clear()
		for action_slug in _available_actions:
			selector.add_item(action_slug)
	for index in range(action_selectors.size()):
		if index < _available_actions.size():
			action_selectors[index].select(index)

func _on_hero_selection_changed(_index: int) -> void:
	_build_hero_cards()
	_update_caster_label()
	status_label.text = "Sandbox heroes updated."

func _on_action_selection_changed(_index: int) -> void:
	_refresh_action_cards()
	status_label.text = "Sandbox hand updated."

func _build_hero_cards() -> void:
	_displayed_hero_slugs = []
	for selector in hero_selectors:
		if selector.selected >= 0:
			_displayed_hero_slugs.append(selector.get_item_text(selector.selected))

	FlowState.set_selected_heroes(_displayed_hero_slugs)
	for card in _current_cards:
		card.queue_free()
	_current_cards.clear()

	for hero_slug in _displayed_hero_slugs:
		var card = card_scene.instantiate()
		add_child(card)
		card.load_hero(hero_slug)
		card.double_clicked.connect(_on_hero_card_double_clicked)
		_current_cards.append(card)

	if _selected_caster_slot > _displayed_hero_slugs.size():
		_selected_caster_slot = 1
	update_layout()

func _refresh_action_cards() -> void:
	for index in range(action_cards.size()):
		var selector := action_selectors[index]
		if selector.selected < 0:
			action_cards[index].configure_empty(index + 1)
			continue
		var action_slug := selector.get_item_text(selector.selected)
		var config := GameData.load_action_config(action_slug)
		var action_name := str(config.get("full_name", action_slug.capitalize()))
		var action_description := str(config.get("description", ""))
		var action_elements = config.get("element", [])
		var target_rule := str(config.get("target_rule", "enemy_auto"))
		var targeting = config.get("targeting", _target_rule_to_targeting(target_rule))
		action_cards[index].configure_action(index + 1, action_slug, action_name, action_description, action_elements, targeting)
		action_cards[index].set_enabled_state(true)
		action_cards[index].set_selected(false)

func _on_hero_card_double_clicked(card: Control) -> void:
	var slot_index = _current_cards.find(card) + 1
	if slot_index <= 0:
		return
	_selected_caster_slot = slot_index
	_update_caster_label()
	status_label.text = "Active hero set to %s." % _hero_name_for_slot(slot_index)

func _on_action_card_pressed(hand_slot_index: int) -> void:
	if _selected_caster_slot <= 0:
		status_label.text = "Select an active hero first."
		return
	var action_card := action_cards[hand_slot_index - 1]
	var action_slug := action_card.get_action_slug()
	if action_slug.is_empty():
		status_label.text = "No action in that slot."
		return
	for card in action_cards:
		card.set_selected(false)
	action_card.set_selected(true)
	_show_action_details(
		action_slug,
		action_card.get_action_name(),
		action_card.get_action_description(),
		action_card.get_action_elements(),
		_get_effective_targeting(action_slug, action_card.get_targeting())
	)
	status_label.text = "Previewing %s through %s." % [action_card.get_action_name(), _hero_name_for_slot(_selected_caster_slot)]

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(HOME_SCENE)

func _on_randomize_pressed() -> void:
	if _available_heroes.is_empty() or _available_actions.is_empty():
		return
	for selector in hero_selectors:
		selector.select(randi_range(0, _available_heroes.size() - 1))
	for selector in action_selectors:
		selector.select(randi_range(0, _available_actions.size() - 1))
	_build_hero_cards()
	_refresh_action_cards()
	_update_action_detail_placeholder()
	status_label.text = "Sandbox loadout randomized."

func update_layout() -> void:
	var viewport_size = get_viewport_rect().size
	LayoutManager.apply_layout("cave", bg_texture, _current_cards, viewport_size)
	for index in range(action_cards.size()):
		LayoutManager.apply_box_layout(action_cards[index], "action%s" % str(index + 1), viewport_size)

func _update_caster_label() -> void:
	if _selected_caster_slot <= 0 or _selected_caster_slot > _displayed_hero_slugs.size():
		caster_label.text = "Active Hero: -"
		return
	caster_label.text = "Active Hero: %s" % _hero_name_for_slot(_selected_caster_slot)

func _hero_name_for_slot(slot_index: int) -> String:
	if slot_index <= 0 or slot_index > _displayed_hero_slugs.size():
		return "Hero %s" % slot_index
	var hero_slug := _displayed_hero_slugs[slot_index - 1]
	var hero_config := GameData.load_hero_config(hero_slug)
	return str(hero_config.get("full_name", hero_slug.replace("-", " ").capitalize()))

func _get_effective_targeting(action_slug: String, base_targeting: Variant) -> Dictionary:
	var resolved: Dictionary = {}
	if base_targeting is Dictionary:
		resolved = base_targeting.duplicate(true)
	else:
		resolved = _target_rule_to_targeting(str(base_targeting))

	if _selected_caster_slot <= 0 or _selected_caster_slot > _displayed_hero_slugs.size():
		return resolved
	var hero_config := GameData.load_hero_config(_displayed_hero_slugs[_selected_caster_slot - 1])
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
	var override_rule := str(action_override.get("target_rule", ""))
	if not override_rule.is_empty():
		resolved = _target_rule_to_targeting(override_rule)
	return resolved

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

func _show_action_details(action_slug: String, action_name: String, action_description: String, action_elements: Variant, targeting: Dictionary) -> void:
	if action_slug.is_empty():
		_update_action_detail_placeholder()
		return
	var header := action_name
	var element_text := _format_element_list(action_elements)
	if not element_text.is_empty():
		header += " [%s]" % element_text
	var description := action_description if not action_description.is_empty() else "No description available."
	action_detail_label.text = "%s\n%s\n%s" % [header, _describe_targeting(targeting), description]

func _update_action_detail_placeholder() -> void:
	action_detail_label.text = "Sandbox preview only.\nDouble-click a hero, then tap an action card."

func _format_element_list(elements: Variant) -> String:
	if not (elements is Array):
		return ""
	var names: Array[String] = []
	for element_name in elements:
		var text := str(element_name).strip_edges()
		if not text.is_empty():
			names.append(text.capitalize())
	return "/".join(names)

func _describe_targeting(targeting: Dictionary) -> String:
	var scope := str(targeting.get("scope", "single"))
	var side := str(targeting.get("side", "enemy"))
	var selection := str(targeting.get("selection", "auto"))
	if scope == "none":
		return "Target: none"
	var side_text := "Any" if side == "any" else side.capitalize()
	return "Target: %s %s (%s)" % [side_text, scope, selection]
