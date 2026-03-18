extends Button
## ActionCard - Draggable card for casting actions

signal card_drag_started(card: Button)
signal card_drag_ended(card: Button, dropped_on_target: bool)

@onready var icon_rect: TextureRect = $IconRect
@onready var name_label: Label = $NameLabel
@onready var cost_label: Label = $CostLabel
@onready var element_rect: ColorRect = $ElementRect

var action_slug: String = ""
var action_name: String = ""
var energy_cost: int = 0
var target_rule: String = "enemy"  # enemy, ally, self, any
var slot_index: int = 0
var is_dragging: bool = false
var drag_start_pos: Vector2 = Vector2.ZERO
var _drag_offset: Vector2 = Vector2.ZERO

func _ready():
	button_down.connect(_on_button_down)
	button_up.connect(_on_button_up)
	
	# Make sure we can receive input while dragging
	z_index = 1

func setup(data: Dictionary):
	action_slug = data.get("action_slug", "")
	slot_index = data.get("slot_index", 0)
	
	var action_def = GameState.get_action_def(action_slug)
	if not action_def.is_empty():
		action_name = action_def.get("name", action_slug)
		energy_cost = action_def.get("cost", 0)
		target_rule = action_def.get("target", "enemy")
	else:
		action_name = action_slug.replace("-", " ").capitalize()
	
	name_label.text = action_name
	cost_label.text = str(energy_cost)
	element_rect.color = _get_element_color(action_def.get("element", "earth"))
	
	# Try to load action card image
	var img_path = "res://data/action/%s/img/char-bg.webp" % action_slug.replace("-", "_")
	if ResourceLoader.exists(img_path):
		icon_rect.texture = load(img_path)

func _get_element_color(element: String) -> Color:
	match element:
		"fire": return Color("#ff4500")
		"ice": return Color("#b0e0e6")
		"earth": return Color("#8b7355")
		"wind": return Color("#98fb98")
		"light": return Color("#ffd700")
		"shadow": return Color("#5d3a8a")
		_: return Color.GRAY

func _on_button_down():
	is_dragging = true
	drag_start_pos = global_position
	_drag_offset = get_global_mouse_position() - global_position
	card_drag_started.emit(self)
	
	# Visual feedback
	scale = Vector2(1.1, 1.1)
	z_index = 100

func _on_button_up():
	if not is_dragging:
		return
	
	is_dragging = false
	scale = Vector2(1.0, 1.0)
	z_index = 1
	
	# Check if dropped on valid target
	var dropped_on = _get_drop_target()
	var valid_drop = _is_valid_target(dropped_on)
	
	if valid_drop:
		_cast_action(dropped_on)
		card_drag_ended.emit(self, true)
	else:
		# Snap back to original position
		_snap_back()
		card_drag_ended.emit(self, false)

func _input(event):
	if is_dragging and event is InputEventMouseMotion:
		global_position = get_global_mouse_position() - _drag_offset

func _get_drop_target() -> Control:
	# Find what we're hovering over
	var mouse_pos = get_global_mouse_position()
	
	# Check all hero nodes in the scene
	var gameplay = get_tree().get_first_node_in_group("gameplay")
	if gameplay:
		for hero in gameplay.get_heroes():
			if hero.get_global_rect().has_point(mouse_pos):
				return hero
	
	return null

func _is_valid_target(target: Control) -> bool:
	if target == null:
		return false
	
	# Check target type based on action's target_rule
	var target_hero = target as Hero
	if not target_hero:
		return false
	
	match target_rule:
		"enemy":
			return target_hero.is_enemy and not target_hero.is_dead()
		"ally":
			return not target_hero.is_enemy and not target_hero.is_dead()
		"self":
			# Self-targeting - could be any of your heroes
			return not target_hero.is_enemy and not target_hero.is_dead()
		"any":
			return not target_hero.is_dead()
		_:
			return false

func _cast_action(target: Hero):
	# Send cast_action message to server
	var caster_slot = _get_caster_slot()
	
	GameState.send_json({
		"type": "cast_action",
		"match_id": GameState.current_match_id,
		"caster_slot": caster_slot,
		"hand_slot_index": slot_index
	})

func _get_caster_slot() -> int:
	# For simplicity, use the first alive hero on your team
	# In a more complex system, you might select a specific caster
	var gameplay = get_tree().get_first_node_in_group("gameplay")
	if gameplay:
		return gameplay.get_first_alive_hero_slot()
	return 1

func _snap_back():
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_BACK)
	tween.tween_property(self, "global_position", drag_start_pos, 0.3)

func can_afford(current_energy: int) -> bool:
	return current_energy >= energy_cost

func set_enabled(enabled: bool):
	modulate = Color.WHITE if enabled else Color(0.5, 0.5, 0.5, 0.5)
	disabled = not enabled

class Hero:
	# Type hint for the hero control
	pass
