extends Button
## ActionCard - Draggable action card rendered like the editor preview

signal card_drag_started(card: Button)
signal card_drag_ended(card: Button, dropped_on_target: bool)

var action_slug: String = ""
var action_name: String = ""
var energy_cost: int = 0
var target_rule: String = "enemy"
var slot_index: int = 0
var is_dragging: bool = false
var drag_start_pos: Vector2 = Vector2.ZERO
var _drag_offset: Vector2 = Vector2.ZERO

# Cached resources (same pattern as hero_select.gd)
var _frame_tex: Texture2D
var _char_shader: Shader
var _mask_shader: Shader
var _bg_group: CanvasGroup

# Reference card size (action-frame.webp is 1024x1536)
const REF_W: float = 1024.0
const REF_H: float = 1536.0

func _ready():
	button_down.connect(_on_button_down)
	z_index = 1

	_frame_tex = load("res://assets/ui/action-frame.webp")

	_char_shader = Shader.new()
	_char_shader.code = """shader_type canvas_item;
uniform vec2 char_uv_offset;
uniform vec2 char_uv_scale;

void fragment() {
	vec2 luv = char_uv_offset + UV * char_uv_scale;
	if (luv.x < 0.0 || luv.x > 1.0 || luv.y < 0.0 || luv.y > 1.0) {
		COLOR = vec4(0.0);
	} else {
		COLOR = texture(TEXTURE, luv);
	}
}
"""

	_mask_shader = Shader.new()
	_mask_shader.code = """shader_type canvas_item;
render_mode blend_mul;
uniform vec2 char_uv_offset;
uniform vec2 char_uv_scale;

void fragment() {
	vec2 luv = char_uv_offset + UV * char_uv_scale;
	if (luv.x < 0.0 || luv.x > 1.0 || luv.y < 0.0 || luv.y > 1.0) {
		COLOR = vec4(1.0);
	} else {
		float mask_a = texture(TEXTURE, luv).a;
		COLOR = vec4(1.0, 1.0, 1.0, 1.0 - mask_a);
	}
}
"""

func setup(data: Dictionary):
	action_slug = data.get("action_slug", "")
	slot_index = data.get("slot_index", 0)

	# Server sends name/cost/targeting directly — use those as base, overlay file config
	action_name = data.get("action_name", action_slug.replace("_", " ").replace("-", " ").capitalize())
	energy_cost = int(data.get("energy_cost", 0))
	target_rule = data.get("target_rule", "enemy")

	var config = _load_action_config(action_slug)

	# File config overrides server data when present
	if not config.is_empty():
		action_name = config.get("full_name", action_name)
		energy_cost = int(config.get("cost", energy_cost))
		var targeting = config.get("targeting", {})
		if not targeting.is_empty():
			target_rule = targeting.get("side", target_rule)

	_build_card_visual(config)

func _load_action_config(slug: String) -> Dictionary:
	# Normalize slug: server may send underscores, directories use hyphens
	var normalized = slug.replace("_", "-")
	var path = "res://data/action/%s/action.json" % normalized
	var file = FileAccess.open(path, FileAccess.READ)
	if not file:
		return {}
	var json = JSON.new()
	if json.parse(file.get_as_text()) != OK:
		return {}
	return json.data

## Resolve the action slug to the filesystem format (hyphens).
func _fs_slug() -> String:
	return action_slug.replace("_", "-")

func _build_card_visual(config: Dictionary):
	for child in get_children():
		child.queue_free()

	var card_size = size
	var sx = card_size.x / REF_W
	var sy = card_size.y / REF_H
	var cx = card_size.x / 2.0
	var cy = card_size.y / 2.0

	# All visuals go inside a Control container (matches hero_select.gd pattern;
	# adding TextureRects directly to a Button can cause layout issues).
	var container = Control.new()
	container.size = card_size
	container.clip_children = CanvasItem.CLIP_CHILDREN_ONLY
	container.mouse_filter = Control.MOUSE_FILTER_IGNORE

	# --- char-bg layer with mask (CanvasGroup so mask blends only against char) ---
	var bg_pos = config.get("char_bg_pos", {"x": 0, "y": 0})
	var bg_scale = float(config.get("char_bg_scale", 100)) / 100.0
	_bg_group = _make_masked_char_group("bg", bg_pos, bg_scale, card_size)
	if _bg_group:
		container.add_child(_bg_group)

	# --- Frame overlay (tinted) ---
	if _frame_tex:
		var frame_rect = TextureRect.new()
		frame_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		frame_rect.stretch_mode = TextureRect.STRETCH_SCALE
		frame_rect.position = Vector2.ZERO
		frame_rect.size = card_size
		frame_rect.texture = _frame_tex
		frame_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var tint_str = config.get("tint", "#ffffff")
		if typeof(tint_str) == TYPE_STRING:
			frame_rect.modulate = Color(tint_str)
		container.add_child(frame_rect)

	# --- Name label ---
	var full_name = config.get("full_name", action_name)
	if full_name:
		var name_cfg = config.get("name_pos", {"x": 0, "y": 500})
		var name_scale_val = float(config.get("name_scale", 122))
		var font_size = int(name_scale_val * sy)
		var shadow_size = int(max(1, float(config.get("text_shadow_size", 3)) * sy))

		var name_lbl = Label.new()
		name_lbl.text = full_name
		name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		name_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		name_lbl.add_theme_font_size_override("font_size", font_size)
		name_lbl.add_theme_color_override("font_color", Color.WHITE)
		var shadow_color = Color(0, 0, 0, 0.5)
		var shadow_color_str = config.get("text_shadow_color", "")
		if typeof(shadow_color_str) == TYPE_STRING and shadow_color_str.begins_with("rgba"):
			var inner = shadow_color_str.trim_prefix("rgba(").trim_suffix(")")
			var parts = inner.split(",")
			if parts.size() == 4:
				shadow_color = Color(
					float(parts[0].strip_edges()) / 255.0,
					float(parts[1].strip_edges()) / 255.0,
					float(parts[2].strip_edges()) / 255.0,
					float(parts[3].strip_edges())
				)
		elif typeof(shadow_color_str) == TYPE_STRING and not shadow_color_str.is_empty():
			shadow_color = Color(shadow_color_str)
		name_lbl.add_theme_color_override("font_outline_color", shadow_color)
		name_lbl.add_theme_constant_override("outline_size", shadow_size)
		name_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var label_h = font_size * 1.5
		name_lbl.position = Vector2(
			float(name_cfg.get("x", 0)) * sx,
			cy + float(name_cfg.get("y", 0)) * sy - label_h / 2.0
		)
		name_lbl.size = Vector2(card_size.x, label_h)
		container.add_child(name_lbl)

	# --- Cost badge (top-left circle on frame) ---
	var cost_font_size = int(card_size.x * 0.13)
	var cost_lbl = Label.new()
	cost_lbl.text = str(energy_cost)
	cost_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cost_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	cost_lbl.add_theme_font_size_override("font_size", cost_font_size)
	cost_lbl.add_theme_color_override("font_color", Color.WHITE)
	cost_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
	cost_lbl.add_theme_constant_override("outline_size", int(max(1, 2 * sy)))
	cost_lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var cost_w = cost_font_size * 2.0
	var cost_h = cost_font_size * 2.0
	cost_lbl.position = Vector2(
		card_size.x * 0.132 - cost_w / 2.0,
		card_size.y * 0.09 - cost_h / 2.0
	)
	cost_lbl.size = Vector2(cost_w, cost_h)
	container.add_child(cost_lbl)

	add_child(container)

## Build a CanvasGroup containing the char layer + mask layer.
## The mask uses blend_mul so it only affects the char within the group.
## This avoids extra sampler2D uniforms which can fail in gl_compatibility.
func _make_masked_char_group(layer: String, pos: Dictionary, scale_pct: float, card_size: Vector2) -> CanvasGroup:
	var slug = _fs_slug()
	var tex_path = "res://data/action/%s/img/char-%s.webp" % [slug, layer]
	if not ResourceLoader.exists(tex_path):
		return null

	var tex: Texture2D = load(tex_path)
	if not tex:
		return null

	var sx = card_size.x / REF_W
	var sy = card_size.y / REF_H
	var cx = card_size.x / 2.0
	var cy = card_size.y / 2.0

	# Layer dimensions — preserve image aspect ratio (editor uses preserveAspectRatio for actions)
	var lw = card_size.x * scale_pct
	var lh = lw * (float(tex.get_height()) / float(tex.get_width())) if tex.get_width() > 0 else card_size.y * scale_pct
	var lx = cx + float(pos.get("x", 0)) * sx - lw / 2.0
	var ly = cy + float(pos.get("y", 0)) * sy - lh / 2.0

	var uv_offset = Vector2(-lx / lw, -ly / lh)
	var uv_scale = Vector2(card_size.x / lw, card_size.y / lh)

	# CanvasGroup renders children into a buffer — mask blends only within the group
	var group = CanvasGroup.new()

	# Char layer TextureRect (fills card, shader maps UV)
	var tex_rect = TextureRect.new()
	tex_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tex_rect.stretch_mode = TextureRect.STRETCH_SCALE
	tex_rect.position = Vector2.ZERO
	tex_rect.size = card_size
	tex_rect.texture = tex
	tex_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var char_mat = ShaderMaterial.new()
	char_mat.shader = _char_shader
	char_mat.set_shader_parameter("char_uv_offset", uv_offset)
	char_mat.set_shader_parameter("char_uv_scale", uv_scale)
	tex_rect.material = char_mat
	group.add_child(tex_rect)

	# Mask layer (blend_mul erases char alpha where mask is opaque)
	var mask_path = "res://data/action/%s/img/mask-%s.webp" % [slug, layer]
	if ResourceLoader.exists(mask_path):
		var mask_tex: Texture2D = load(mask_path)
		if mask_tex:
			var mask_rect = TextureRect.new()
			mask_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			mask_rect.stretch_mode = TextureRect.STRETCH_SCALE
			mask_rect.position = Vector2.ZERO
			mask_rect.size = card_size
			mask_rect.texture = mask_tex
			mask_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE

			var mask_mat = ShaderMaterial.new()
			mask_mat.shader = _mask_shader
			mask_mat.set_shader_parameter("char_uv_offset", uv_offset)
			mask_mat.set_shader_parameter("char_uv_scale", uv_scale)
			mask_rect.material = mask_mat
			group.add_child(mask_rect)

	return group

# --- Drag & drop ---

func _on_button_down():
	is_dragging = true
	drag_start_pos = global_position
	_drag_offset = get_global_mouse_position() - global_position
	card_drag_started.emit(self)

	scale = Vector2(1.1, 1.1)
	z_index = 100

func _input(event):
	if not is_dragging:
		return
	if event is InputEventMouseMotion:
		global_position = get_global_mouse_position() - _drag_offset
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		_end_drag()

func _end_drag():
	is_dragging = false

	var dropped_on = _get_drop_target()
	var valid_drop = _is_valid_target(dropped_on)

	if valid_drop:
		# Hide immediately — before any property resets that could flash
		visible = false
		_cast_action(dropped_on)
		card_drag_ended.emit(self, true)
	else:
		scale = Vector2(1.0, 1.0)
		modulate.a = 1.0
		z_index = 1
		_snap_back()
		card_drag_ended.emit(self, false)

func _get_drop_target() -> Control:
	var card_rect = get_global_rect()
	var card_center = card_rect.get_center()
	var best_dist = INF
	var best_hero: Control = null
	var gameplay = get_tree().get_first_node_in_group("gameplay")
	if gameplay:
		for hero in gameplay.get_heroes():
			if card_rect.intersects(hero.get_global_rect()):
				var dist = card_center.distance_to(hero.get_global_rect().get_center())
				if dist < best_dist:
					best_dist = dist
					best_hero = hero
	return best_hero

func _is_valid_target(target: Control) -> bool:
	if target == null:
		return false
	var target_hero = target as Hero
	if not target_hero:
		return false
	# Only your own alive, non-casting heroes are valid drop targets
	return not target_hero.is_enemy and not target_hero.is_dead() and not target_hero.is_casting()

func _cast_action(caster: Hero):
	# The hero you drop the card on IS the caster.
	# Server auto-resolves the target based on the action's target_rule.
	GameState.send_json({
		"type": "cast_action",
		"match_id": GameState.current_match_id,
		"caster_slot": caster.slot_index,
		"hand_slot_index": slot_index
	})

func _snap_back():
	var tween = create_tween()
	tween.set_ease(Tween.EASE_OUT)
	tween.set_trans(Tween.TRANS_BACK)
	tween.tween_property(self, "global_position", drag_start_pos, 0.3)

func can_afford(current_energy: int) -> bool:
	return current_energy >= energy_cost

func set_enabled(enabled: bool):
	if is_dragging:
		return
	disabled = not enabled
	if _bg_group:
		if enabled:
			var tween = create_tween()
			tween.tween_property(_bg_group, "modulate", Color.WHITE, 0.2)
		else:
			_bg_group.modulate = Color(0.5, 0.5, 0.5, 0.5)
