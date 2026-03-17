extends Control
class_name ActionCard

signal pressed(slot_index: int)
signal dragged_onto_hero(slot_index: int, hero_card: Control)

const DEFAULT_FRAME_PATH := "res://assets/ui/action-frame.webp"
const GameData = preload("res://scripts/GameData.gd")

var mask_shader = preload("res://shaders/mask.gdshader")
var multiply_shader = preload("res://shaders/multiply.gdshader")

var _dragging := false
var _drag_offset := Vector2.ZERO
var _original_position := Vector2.ZERO
var _original_scale := Vector2.ONE
var _tween: Tween = null

@onready var char_bg: TextureRect = $CharBG
@onready var frame: TextureRect = $Frame
@onready var frame_tint: TextureRect = $FrameTint
@onready var char_fg: TextureRect = $CharFG
@onready var cost_badge: Label = $CostBadge
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
var _action_cost: int = 0
var _has_action := false
var _enabled := false

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(400, 600)
	size = custom_minimum_size
	
	# Remove anchor presets from layers to allow manual positioning
	_clear_layer_anchors(char_bg)
	_clear_layer_anchors(frame)
	_clear_layer_anchors(frame_tint)
	_clear_layer_anchors(char_fg)
	
	_layout_overlay(size)
	_refresh_visual_state()

func _clear_layer_anchors(layer: Control) -> void:
	layer.set_anchors_preset(Control.PRESET_TOP_LEFT)
	layer.offset_left = 0
	layer.offset_top = 0
	layer.offset_right = 0
	layer.offset_bottom = 0

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed and _enabled and _has_action:
			_dragging = true
			_drag_offset = get_global_mouse_position() - global_position
			_original_position = global_position
			_original_scale = scale
			z_index = 100
			# Scale to 130% of original scale
			_animate_scale(_original_scale.x * 1.3)
			pressed.emit(_slot_index)
			accept_event()
		elif not event.pressed and _dragging:
			_end_drag()
			accept_event()

func _input(event: InputEvent) -> void:
	if _dragging and event is InputEventMouseMotion:
		global_position = get_global_mouse_position() - _drag_offset

func _animate_scale(target_scale: float) -> void:
	if _tween:
		_tween.kill()
	_tween = create_tween()
	_tween.tween_property(self, "scale", Vector2(target_scale, target_scale), 0.12).set_ease(Tween.EASE_OUT)

func _end_drag() -> void:
	if not _dragging:
		return
	_dragging = false
	z_index = 0

	# Check if dropped on a hero card
	var hero_card = _get_hero_card_at_position(get_global_mouse_position())
	if hero_card:
		dragged_onto_hero.emit(_slot_index, hero_card)

	# Always animate back to original position and scale
	if _tween:
		_tween.kill()
	_tween = create_tween()
	_tween.set_parallel(true)
	_tween.tween_property(self, "scale", _original_scale, 0.12).set_ease(Tween.EASE_OUT)
	_tween.tween_property(self, "global_position", _original_position, 0.12).set_ease(Tween.EASE_OUT)

func _get_hero_card_at_position(global_pos: Vector2) -> Control:
	var cards = get_tree().get_nodes_in_group("hero_cards")
	for card in cards:
		if card is Control and card.get_global_rect().has_point(global_pos):
			return card
	return null

func configure_empty(slot_index: int) -> void:
	_slot_index = slot_index
	_action_slug = ""
	_action_name = ""
	_action_description = ""
	_action_elements = []
	_targeting = {}
	_action_cost = 0
	_has_action = false
	slot_badge.visible = true
	slot_badge.text = str(slot_index)
	title_badge.text = "EMPTY"
	title_badge.visible = true
	tooltip_text = ""
	frame.texture = _load_texture(DEFAULT_FRAME_PATH)
	frame.set_anchors_preset(Control.PRESET_TOP_LEFT)
	frame.size = size
	frame.position = Vector2.ZERO
	frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	frame.stretch_mode = TextureRect.STRETCH_SCALE
	frame.visible = true
	frame.modulate = Color(1, 1, 1, 0.18)
	frame_tint.visible = false
	char_bg.visible = false
	char_fg.visible = false
	cost_badge.visible = false
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
	var mask_bg_texture: Texture2D = GameData.load_action_texture(action_slug, "img/mask-bg.webp")
	var mask_fg_texture: Texture2D = GameData.load_action_texture(action_slug, "img/mask-fg.webp")
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
	frame.set_anchors_preset(Control.PRESET_TOP_LEFT)
	frame.position = Vector2.ZERO
	frame.size = base_size
	frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	frame.stretch_mode = TextureRect.STRETCH_SCALE
	frame.visible = visible_layers.get("card", true)
	frame.modulate = Color.WHITE

	frame_tint.texture = frame_texture
	frame_tint.set_anchors_preset(Control.PRESET_TOP_LEFT)
	frame_tint.position = Vector2.ZERO
	frame_tint.size = base_size
	frame_tint.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	frame_tint.stretch_mode = TextureRect.STRETCH_SCALE
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

	# Cost badge - always show for actions, use same font size as title
	_action_cost = int(config.get("cost", 0))
	cost_badge.text = str(_action_cost)
	cost_badge.visible = true
	cost_badge.modulate = Color(1, 1, 1, 1)
	# Use same font size as title badge (name_scale default ~122)
	var title_font_size = float(config.get("name_scale", 122.0))
	cost_badge.add_theme_font_size_override("font_size", int(title_font_size))

	# Title badge with configurable position and styling
	title_badge.text = action_name
	title_badge.visible = bool(visible_layers.get("name", true))
	
	# Apply name position from config (name_pos is offset from card center)
	var name_pos: Dictionary = config.get("name_pos", {})
	var name_scale: float = float(config.get("name_scale", 122.0))
	var center = base_size * 0.5
	var name_offset_x = float(name_pos.get("x", 0.0))
	var name_offset_y = float(name_pos.get("y", 0.0))
	
	title_badge.add_theme_font_size_override("font_size", int(name_scale))
	
	# Apply text styling from config (use outline like editor strokeText)
	var shadow_color_str = str(config.get("text_shadow_color", "rgba(0, 0, 0, 0.5)"))
	var shadow_color = _parse_color(shadow_color_str, Color(0, 0, 0, 0.5))
	var shadow_size = int(config.get("text_shadow_size", 3))
	
	# Use outline to match editor's strokeText behavior
	title_badge.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0))
	title_badge.add_theme_color_override("font_outline_color", shadow_color)
	title_badge.add_theme_constant_override("outline_size", shadow_size)
	
	# Position title badge centered at (center + offset)
	title_badge.reset_size()
	var label_size = title_badge.get_combined_minimum_size()
	var target_center = center + Vector2(name_offset_x, name_offset_y - 50)
	title_badge.position = target_center - (label_size * 0.5)
	title_badge.size = label_size
	
	tooltip_text = action_name
	frame.visible = true
	_layout_overlay(base_size)
	_refresh_visual_state()

func set_enabled_state(enabled: bool) -> void:
	_enabled = enabled
	_refresh_visual_state()

func set_selected(_selected: bool) -> void:
	# Selection no longer shows visual frame - card is interacted via drag
	pass

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

func get_action_cost() -> int:
	return _action_cost

func _refresh_visual_state() -> void:
	var active = _enabled and _has_action
	disabled_shroud.visible = not active
	modulate = Color(1, 1, 1, 1) if active else Color(0.72, 0.72, 0.72, 0.92)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND if active else Control.CURSOR_ARROW
	
	# Cost badge should always be visible with full opacity when we have an action
	if _has_action:
		cost_badge.visible = true
		cost_badge.modulate = Color(1, 1, 1, 1)

func _layout_overlay(card_size: Vector2) -> void:
	selection_frame.position = Vector2(-8, -8)
	selection_frame.size = card_size + Vector2(16, 16)
	disabled_shroud.position = Vector2.ZERO
	disabled_shroud.size = card_size
	
	# Slot badge - hidden by default for action cards (used for hand slot display)
	slot_badge.visible = false
	
	# Cost badge - scale position and size based on card dimensions
	# Use same font size as title badge (name_scale default ~122)
	if _has_action:
		var scale_factor = card_size.x / 400.0
		var badge_x = 4.0 * scale_factor
		var badge_y = 10.0 * scale_factor
		var badge_w = 100.0 * scale_factor
		var badge_h = 80.0 * scale_factor
		
		cost_badge.visible = true
		cost_badge.modulate = Color(1, 1, 1, 1)
		cost_badge.position = Vector2(badge_x, badge_y)
		cost_badge.size = Vector2(badge_w, badge_h)

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

	# Calculate dimensions preserving aspect ratio
	var width = card_size.x * (scale_percent / 100.0)
	var height = width / (image_size.x / image_size.y)
	var pos_dict: Dictionary = config_pos if config_pos is Dictionary else {}
	var center = card_size * 0.5
	var x = center.x + float(pos_dict.get("x", 0.0)) - width * 0.5
	var y = center.y + float(pos_dict.get("y", 0.0)) - height * 0.5

	# Position and size the layer
	layer.set_anchors_preset(Control.PRESET_TOP_LEFT)
	layer.position = Vector2(x, y)
	layer.size = Vector2(width, height)
	layer.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	layer.stretch_mode = TextureRect.STRETCH_SCALE

	# Apply mask shader if mask exists
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
