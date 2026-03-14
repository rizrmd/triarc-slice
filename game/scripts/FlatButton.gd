extends Control
class_name FlatButton

signal pressed

@export var text: String = "":
	set(value):
		text = value
		if is_node_ready():
			_label.text = value
			queue_redraw()

@export var fill_color: Color = Color(0.08, 0.1, 0.14, 0.86)
@export var border_color: Color = Color(0.92, 0.77, 0.38, 0.95)
@export var text_color: Color = Color(0.98, 0.96, 0.92, 1.0)

@onready var _label: Label = $Label

var _enabled := true

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(220, 72)
	_label.text = text
	_label.add_theme_color_override("font_color", text_color)
	queue_redraw()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and _enabled:
		pressed.emit()
		accept_event()

func set_enabled_state(enabled: bool) -> void:
	_enabled = enabled
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if enabled else Control.CURSOR_ARROW
	modulate = Color(1, 1, 1, 1) if enabled else Color(0.7, 0.7, 0.7, 0.9)
	queue_redraw()

func _draw() -> void:
	var rect = Rect2(Vector2.ZERO, size)
	var bg = fill_color if _enabled else Color(fill_color.r, fill_color.g, fill_color.b, fill_color.a * 0.6)
	var border = border_color if _enabled else Color(border_color.r, border_color.g, border_color.b, border_color.a * 0.45)
	draw_rect(rect, bg, true)
	draw_rect(rect, border, false, 3.0)
