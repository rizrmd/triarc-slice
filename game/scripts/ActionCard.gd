extends Control
class_name ActionCard

signal pressed(slot_index: int)

const DEFAULT_FRAME_PATH := "res://assets/ui/action-frame.webp"
const GameData = preload("res://scripts/GameData.gd")

var mask_shader = preload("res://shaders/mask.gdshader")
var multiply_shader = preload("res://shaders/multiply.gdshader")

@onready var char_bg: TextureRect = $CharBG
@onready var frame: TextureRect = $Frame
@onready var frame_tint: TextureRect = $FrameTint
@onready var char_fg: TextureRect = $CharFG
@onready var slot_badge: Label = $SlotBadge
@onready var title_badge: Label = $TitleBadge
@onready var disabled_shroud: ColorRect = $DisabledShroud
@onready var selection_frame: ColorRect = $SelectionFrame

var _slot_index: int = 0
var _action_slug: String = ""
var _action_name: String = ""
var _action_description: String = ""
var _action_elements: Array = []
var _targeting: Dictionary = {}
var _has_action := false
var _enabled := false

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(400, 600)
	size = custom_minimum_size
	_layout_overlay(size)
	_refresh_visual_state()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and _enabled and _has_action:
		pressed.emit(_slot_index)
		accept_event()

func configure_empty(slot_index: int) -> void:
	_slot_index = slot_index
	_action_slug = ""
	_action_name = ""
	_action_description = ""
	_action_elements = []
	_targeting = {}
	_has_action = false
	slot_badge.text = str(slot_index)
	title_badge.text = "EMPTY"
	title_badge.visible = true
	tooltip_text = ""
	frame.texture = _load_texture(DEFAULT_FRAME_PATH)
	frame.size = size
	frame.position = Vector2.ZERO
	frame.visible = true
	frame.modulate = Color(1, 1, 1, 0.18)
	frame_tint.visible = false
	char_bg.visible = false
	char_fg.visible = false
	_layout_overlay(size)
	_refresh_visual_state()

func configure_action(slot_index: int, action_slug: String, action_name: String, action_description: String, action_elements: Variant, targeting: Dictionary) -> void:
	_slot_index = slot_index
	_action_slug = action_slug
	_action_name = action_name
	_action_description = action_description
	_action_elements = action_elements if action_elements is Array else []
	_targeting = targeting.duplicate(true)
	_has_action = not action_slug.is_empty()
	slot_badge.text = str(slot_index)

	if not _has_action:
		configure_empty(slot_index)
		return

	var config: Dictionary = _load_action_config(action_slug)
	var frame_path = str(config.get("frame_image", DEFAULT_FRAME_PATH))
	if frame_path.begins_with("/"):
		frame_path = "res://" + frame_path.trim_prefix("/")
	if frame_path.is_empty():
		frame_path = DEFAULT_FRAME_PATH

	var frame_texture: Texture2D = GameData.load_texture(frame_path)
	if frame_texture == null:
		frame_texture = GameData.load_texture(DEFAULT_FRAME_PATH)
	var bg_texture: Texture2D = GameData.load_action_texture(action_slug, "img/char-bg.webp")
	var fg_texture: Texture2D = GameData.load_action_texture(action_slug, "img/char-fg.webp")
	var size_source: Texture2D = frame_texture if frame_texture != null else bg_texture
	if size_source == null:
		size_source = GameData.load_texture(DEFAULT_FRAME_PATH)

	var base_size: Vector2 = Vector2(400, 600)
	if size_source != null:
		base_size = size_source.get_size()
	custom_minimum_size = base_size
	size = base_size
	_layout_overlay(base_size)

	var visible_layers = config.get("visible_layers", {})
	var tint_color = _parse_color(str(config.get("tint", "#ffffff")), Color.WHITE)

	frame.texture = frame_texture
	frame.position = Vector2.ZERO
	frame.size = base_size
	frame.visible = visible_layers.get("card", true)
	frame.modulate = Color.WHITE

	frame_tint.texture = frame_texture
	frame_tint.position = Vector2.ZERO
	frame_tint.size = base_size
	frame_tint.visible = frame.visible and tint_color.a > 0.0 and tint_color != Color.WHITE
	frame_tint.self_modulate = tint_color
	if frame_tint.visible:
		var tint_material := ShaderMaterial.new()
		tint_material.shader = multiply_shader
		frame_tint.material = tint_material
	else:
		frame_tint.material = null

	_configure_layer(
		char_bg,
		bg_texture,
		GameData.load_action_texture(action_slug, "img/mask-bg.webp"),
		config.get("char_bg_pos", {}),
		float(config.get("char_bg_scale", 100.0)),
		base_size,
		bool(visible_layers.get("char-bg", true))
	)
	_configure_layer(
		char_fg,
		fg_texture,
		GameData.load_action_texture(action_slug, "img/mask-fg.webp"),
		config.get("char_fg_pos", {}),
		float(config.get("char_fg_scale", 100.0)),
		base_size,
		bool(visible_layers.get("char-fg", false))
	)

	title_badge.text = action_name.to_upper()
	title_badge.visible = true
	tooltip_text = action_name
	frame.visible = true
	_refresh_visual_state()

func set_enabled_state(enabled: bool) -> void:
	_enabled = enabled
	_refresh_visual_state()

func set_selected(selected: bool) -> void:
	selection_frame.visible = selected

func get_action_slug() -> String:
	return _action_slug

func get_action_name() -> String:
	return _action_name

func get_action_description() -> String:
	return _action_description

func get_action_elements() -> Array:
	return _action_elements

func get_targeting() -> Dictionary:
	return _targeting

func _refresh_visual_state() -> void:
	var active = _enabled and _has_action
	disabled_shroud.visible = not active
	modulate = Color(1, 1, 1, 1) if active else Color(0.72, 0.72, 0.72, 0.92)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if active else Control.CURSOR_ARROW

func _layout_overlay(card_size: Vector2) -> void:
	selection_frame.position = Vector2(-8, -8)
	selection_frame.size = card_size + Vector2(16, 16)
	disabled_shroud.position = Vector2.ZERO
	disabled_shroud.size = card_size
	slot_badge.position = Vector2(14, 10)
	slot_badge.size = Vector2(44, 36)
	title_badge.position = Vector2(20, max(0.0, card_size.y - 60.0))
	title_badge.size = Vector2(max(0.0, card_size.x - 40.0), 44)

func _configure_layer(layer: TextureRect, texture: Texture2D, mask: Texture2D, config_pos: Variant, scale_percent: float, card_size: Vector2, visible: bool) -> void:
	layer.texture = texture
	layer.visible = visible and texture != null
	if not layer.visible:
		layer.material = null
		return

	var image_size: Vector2 = texture.get_size()
	if image_size.x <= 0 or image_size.y <= 0:
		layer.visible = false
		layer.material = null
		return

	var width = card_size.x * (scale_percent / 100.0)
	var height = width / (image_size.x / image_size.y)
	var pos_dict: Dictionary = config_pos if config_pos is Dictionary else {}
	var center = card_size * 0.5
	var x = center.x + float(pos_dict.get("x", 0.0)) - width * 0.5
	var y = center.y + float(pos_dict.get("y", 0.0)) - height * 0.5

	layer.position = Vector2(x, y)
	layer.size = Vector2(width, height)
	layer.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	layer.stretch_mode = TextureRect.STRETCH_SCALE

	if mask != null:
		var material := ShaderMaterial.new()
		material.shader = mask_shader
		material.set_shader_parameter("mask_texture", mask)
		layer.material = material
	else:
		layer.material = null

func _load_action_config(action_slug: String) -> Dictionary:
	return GameData.load_action_config(action_slug)

func _load_texture(path: String) -> Texture2D:
	return GameData.load_texture(path)

func _parse_color(value: String, fallback: Color) -> Color:
	if value.is_empty():
		return fallback
	if value.begins_with("rgba(") and value.ends_with(")"):
		var inner = value.substr(5, value.length() - 6)
		var parts = inner.split(",")
		if parts.size() == 4:
			return Color(
				clamp(float(parts[0].strip_edges()) / 255.0, 0.0, 1.0),
				clamp(float(parts[1].strip_edges()) / 255.0, 0.0, 1.0),
				clamp(float(parts[2].strip_edges()) / 255.0, 0.0, 1.0),
				clamp(float(parts[3].strip_edges()), 0.0, 1.0)
			)
	if value.is_valid_html_color():
		return Color.html(value)
	return fallback
