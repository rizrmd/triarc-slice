class_name Hero
extends Control
## Hero - Displays a hero with layered sprites, HP bar, and status effects

signal hero_clicked(hero: Hero)

@onready var bg_sprite: Sprite2D = $BGSprite
@onready var shadow_sprite: Sprite2D = $ShadowSprite
@onready var char_sprite: Sprite2D = $CharSprite
@onready var hp_bar: Control = $HPBar
@onready var _cast_indicator: Control = $CastIndicator
@onready var status_container: HBoxContainer = $StatusContainer
@onready var floating_text_origin: Marker2D = $FloatingTextOrigin

var hero_instance_id: String = ""
var hero_slug: String = ""
var hero_name: String = ""
var team: int = 0
var slot_index: int = 0
var max_hp: int = 100
var current_hp: int = 100
var is_alive: bool = true
var is_enemy: bool = false

var _tween_hp: Tween = null
var _tween_cast: Tween = null
var _tween_brightness: Tween = null
var _tween_selection: Tween = null
var _current_brightness: float = 1.0
var _is_selected: bool = false
var _selection_strength: float = 0.0
var _drag_dim_strength: float = 0.0
var _frame_base_modulate: Color = Color.WHITE
var _cast_pie: CastPie = null
var _cast_action_label: Label = null
var _current_cast_id: String = ""
var _hero_config: Dictionary = {}
var _pose_animap: AnimapPlayer = null
var _card_shader: Shader
var _empty_mask: ImageTexture
var _bar_fill_shader: Shader
var _bar_bg: TextureRect
var _bar_fg: TextureRect
var _bar_frame: TextureRect
var _bar_label: Label
var _hp_bar_hue: float = 0.0
var _hp_bar_font_size: float = 31.0
var _name_label: Label

# Target indicator for pre-targeting system
var _target_indicator: Control = null
var _target_tween: Tween = null
var _target_info_panel: PanelContainer = null
var _target_name_label: Label = null

func _ready():
	mouse_filter = Control.MOUSE_FILTER_STOP
	hp_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cast_indicator.visible = false
	_build_cast_indicator()
	_build_hp_bar()
	_update_hp_display()
	_card_shader = Shader.new()
	_card_shader.code = """shader_type canvas_item;
uniform sampler2D mask_tex;
uniform vec2 char_uv_offset;
uniform vec2 char_uv_scale;
uniform float brightness : hint_range(0.0, 1.0) = 1.0;
void fragment() {
	vec2 luv = char_uv_offset + UV * char_uv_scale;
	vec4 col = texture(TEXTURE, luv);
	vec4 mask = texture(mask_tex, luv);
	col.a *= (1.0 - mask.a);
	col.rgb *= brightness;
	COLOR = col;
}
"""
	var img = Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_empty_mask = ImageTexture.create_from_image(img)

func _gui_input(event: InputEvent):
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		print("[Hero] click hero=", hero_slug, " slot=", slot_index, " enemy=", is_enemy, " rect=", get_global_rect())
		hero_clicked.emit(self)
		accept_event()

func setup(data: Dictionary, is_enemy_team: bool = false):
	hero_instance_id = data.get("hero_instance_id", "")
	hero_slug = data.get("hero_slug", "")
	team = data.get("team", 0)
	slot_index = data.get("slot_index", 0)
	is_enemy = is_enemy_team
	
	var hero_def = GameState.get_hero_def(hero_slug)
	hero_name = hero_def.get("name", hero_slug)
	max_hp = hero_def.get("max_hp", 1000)
	
	# Load config and sprites
	_load_hero_config()
	_apply_bar_config()
	_load_sprites()

	# Clip sprites to box bounds (editor clips pose char layer + card content)
	clip_children = Control.CLIP_CHILDREN_ONLY

	# Initial HP
	current_hp = data.get("hp_current", max_hp)
	max_hp = data.get("hp_max", max_hp)
	is_alive = data.get("alive", true)
	_update_hp_display()
	
	if not is_alive:
		_set_dead_visuals()

# Editor authoring reference sizes
const POSE_REF_SIZE := Vector2(320, 517)  # 9-16 enemy2 box
const CARD_REF_SIZE := Vector2(471, 720)  # hero-frame.webp dimensions

func apply_layout_size(layout_size: Vector2):
	var center = layout_size / 2.0

	if is_enemy:
		_apply_pose_layout(layout_size, center)
	else:
		_apply_card_layout(layout_size, center)

	floating_text_origin.position = Vector2(center.x, layout_size.y * 0.3)
	# Reposition UI elements
	var ui_sx = layout_size.x / POSE_REF_SIZE.x
	var ui_sy = layout_size.y / POSE_REF_SIZE.y
	var bar_ar = _get_bar_aspect_ratio()
	if is_enemy:
		# Enemy: HP bar on top, then cast indicator, then statuses below
		var bar_w = layout_size.x * 1.0
		var bar_h = bar_w / bar_ar
		hp_bar.position = Vector2((layout_size.x - bar_w) / 2.0, 8 * ui_sy)
		hp_bar.size = Vector2(bar_w, bar_h)
		var pie_size = bar_h * 1.8
		_cast_indicator.position = Vector2(hp_bar.position.x, hp_bar.position.y + bar_h + 20 + 5 * ui_sy)
		_cast_indicator.size = Vector2(bar_w, pie_size)
		_resize_cast_indicator(pie_size)
		status_container.size = Vector2(bar_w, 30 * ui_sy)
		status_container.position = Vector2(hp_bar.position.x, _cast_indicator.position.y + pie_size + 5 * ui_sy)
	else:
		# Ally: use card config values matching editor preview
		var hp_scale_pct = float(_hero_config.get("hp_bar_scale", 250)) / 100.0
		var hp_pos_cfg = _hero_config.get("hp_bar_pos", {"x": 0, "y": 152})
		var ref_sx = layout_size.x / CARD_REF_SIZE.x
		var ref_sy = layout_size.y / CARD_REF_SIZE.y
		var bar_w = layout_size.x * 0.33 * hp_scale_pct
		var bar_h = bar_w / bar_ar
		var bar_x = center.x + float(hp_pos_cfg.get("x", 0)) * ref_sx - bar_w / 2.0
		var bar_y = center.y + float(hp_pos_cfg.get("y", 0)) * ref_sy - bar_h / 2.0
		hp_bar.position = Vector2(bar_x, bar_y)
		hp_bar.size = Vector2(bar_w, bar_h)
		var pie_size = bar_h * 1.8
		_cast_indicator.position = Vector2(bar_x, bar_y + bar_h + 20 + 5 * ref_sy)
		_cast_indicator.size = Vector2(bar_w, pie_size)
		_resize_cast_indicator(pie_size)
		status_container.size = Vector2(bar_w, 30 * ref_sy)
		status_container.position = Vector2(bar_x, _cast_indicator.position.y + pie_size + 5 * ref_sy)
	_resize_bar_children()
	if _bar_label:
		var font_size: int
		if is_enemy:
			font_size = max(8, int(hp_bar.size.y * 0.78))
		else:
			font_size = max(8, int(layout_size.x * (_hp_bar_font_size / CARD_REF_SIZE.x)))
		_bar_label.add_theme_font_size_override("font_size", font_size)
	# Position hero name label
	if _name_label and is_enemy:
		var name_font_size = max(8, int(hp_bar.size.y * 0.9625))
		_name_label.add_theme_font_size_override("font_size", name_font_size)
		_name_label.size = Vector2(layout_size.x, name_font_size * 1.5)
		_name_label.position = Vector2(0, hp_bar.position.y - _name_label.size.y)
	elif _name_label and not is_enemy:
		var name_pos_cfg = _hero_config.get("name_pos", {"x": 0, "y": 0})
		var name_scale = float(_hero_config.get("name_scale", 40))
		var ref_sx = layout_size.x / CARD_REF_SIZE.x
		var ref_sy = layout_size.y / CARD_REF_SIZE.y
		var name_font_size = max(8, int(name_scale * ref_sy))
		_name_label.add_theme_font_size_override("font_size", name_font_size)
		# Size label to full card width so horizontal centering works
		_name_label.size = Vector2(layout_size.x, name_font_size * 1.5)
		_name_label.position = Vector2(
			0 + float(name_pos_cfg.get("x", 0)) * ref_sx,
			center.y + float(name_pos_cfg.get("y", 0)) * ref_sy - _name_label.size.y / 2.0
		)
	# Position target UI elements
	_position_target_ui(layout_size)

func _apply_pose_layout(layout_size: Vector2, _center: Vector2):
	if _pose_animap == null:
		return
	_pose_animap.position = Vector2.ZERO
	_pose_animap.size = layout_size
	# Hide unused Sprite2D nodes in pose mode
	bg_sprite.visible = false
	shadow_sprite.visible = false
	char_sprite.visible = false

func _apply_card_layout(layout_size: Vector2, center: Vector2):
	if _hero_config == null:
		return
	var ref_sx = layout_size.x / CARD_REF_SIZE.x
	var ref_sy = layout_size.y / CARD_REF_SIZE.y

	# BG layer — sized to card bounds, UV shader maps the correct portion
	bg_sprite.visible = true
	if bg_sprite.texture:
		var tex_size = bg_sprite.texture.get_size()
		bg_sprite.scale = Vector2(layout_size.x / tex_size.x, layout_size.y / tex_size.y)
	bg_sprite.position = center
	_apply_card_uv(bg_sprite, "bg", layout_size, ref_sx, ref_sy)

	# Frame (reuses shadow_sprite, fills the whole card)
	if shadow_sprite.texture:
		var tex_size = shadow_sprite.texture.get_size()
		shadow_sprite.scale = Vector2(layout_size.x / tex_size.x, layout_size.y / tex_size.y)
	shadow_sprite.position = center

	# FG layer — sized to card bounds, UV shader maps the correct portion
	if char_sprite.texture:
		var tex_size = char_sprite.texture.get_size()
		char_sprite.scale = Vector2(layout_size.x / tex_size.x, layout_size.y / tex_size.y)
	char_sprite.position = center
	_apply_card_uv(char_sprite, "fg", layout_size, ref_sx, ref_sy)

func _apply_card_uv(sprite: Sprite2D, layer: String, layout_size: Vector2, ref_sx: float, ref_sy: float):
	var pos_key = "char_%s_pos" % layer
	var scale_key = "char_%s_scale" % layer
	var pos = _hero_config.get(pos_key, {"x": 0, "y": 0})
	var scale_pct = float(_hero_config.get(scale_key, 100)) / 100.0

	# Layer size and position in card space (may extend beyond card)
	var lw = layout_size.x * scale_pct
	var lh = layout_size.y * scale_pct
	var lx = layout_size.x / 2.0 + float(pos.get("x", 0)) * ref_sx - lw / 2.0
	var ly = layout_size.y / 2.0 + float(pos.get("y", 0)) * ref_sy - lh / 2.0

	# UV mapping: card space -> layer space
	var mat = ShaderMaterial.new()
	mat.shader = _card_shader
	mat.set_shader_parameter("char_uv_offset", Vector2(-lx / lw, -ly / lh))
	mat.set_shader_parameter("char_uv_scale", Vector2(layout_size.x / lw, layout_size.y / lh))

	var mask_path = "res://data/hero/%s/img/mask-%s.webp" % [hero_slug, layer]
	mat.set_shader_parameter("mask_tex", load(mask_path) if ResourceLoader.exists(mask_path) else _empty_mask)
	sprite.material = mat

func _build_hp_bar():
	_bar_fill_shader = Shader.new()
	_bar_fill_shader.code = """shader_type canvas_item;
uniform float fill : hint_range(0.0, 1.0) = 1.0;
uniform float hue_shift : hint_range(0.0, 1.0) = 0.0;

vec3 rgb2hsv(vec3 c) {
	vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
	vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
	vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
	float d = q.x - min(q.w, q.y);
	float e = 1.0e-10;
	return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
	vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void fragment() {
	vec4 col = texture(TEXTURE, UV);
	if (UV.x > fill) {
		col.a = 0.0;
	} else {
		vec3 hsv = rgb2hsv(col.rgb);
		hsv.x = fract(hsv.x + hue_shift);
		col.rgb = hsv2rgb(hsv);
	}
	COLOR = col;
}
"""
	var bar_bg_tex = load("res://assets/ui/bar/bar-bg.webp")
	var bar_fg_tex = load("res://assets/ui/bar/bar-fg.webp")
	var bar_frame_tex = load("res://assets/ui/bar/bar-frame.webp")

	_bar_bg = TextureRect.new()
	_bar_bg.texture = bar_bg_tex
	_bar_bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_bar_bg.stretch_mode = TextureRect.STRETCH_SCALE
	_bar_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hp_bar.add_child(_bar_bg)

	_bar_fg = TextureRect.new()
	_bar_fg.texture = bar_fg_tex
	_bar_fg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_bar_fg.stretch_mode = TextureRect.STRETCH_SCALE
	_bar_fg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fg_mat = ShaderMaterial.new()
	fg_mat.shader = _bar_fill_shader
	fg_mat.set_shader_parameter("fill", 1.0)
	fg_mat.set_shader_parameter("hue_shift", 0.0)
	_bar_fg.material = fg_mat
	hp_bar.add_child(_bar_fg)

	_bar_frame = TextureRect.new()
	_bar_frame.texture = bar_frame_tex
	_bar_frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_bar_frame.stretch_mode = TextureRect.STRETCH_SCALE
	_bar_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hp_bar.add_child(_bar_frame)

	_bar_label = Label.new()
	_bar_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_bar_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_bar_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar_label.add_theme_color_override("font_color", Color.WHITE)
	_bar_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	_bar_label.add_theme_constant_override("shadow_offset_y", 1)
	hp_bar.add_child(_bar_label)

	# Hero name label (rendered on card, above frame)
	_name_label = Label.new()
	_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_name_label.add_theme_color_override("font_color", Color.WHITE)
	_name_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.5))
	_name_label.add_theme_constant_override("shadow_offset_x", 3)
	_name_label.add_theme_constant_override("shadow_offset_y", 3)
	_name_label.visible = false
	add_child(_name_label)

func _resize_bar_children():
	var s = hp_bar.size
	for child in [_bar_bg, _bar_fg, _bar_frame, _bar_label]:
		if child:
			child.position = Vector2.ZERO
			child.size = s

func _apply_bar_config():
	_hp_bar_hue = float(_hero_config.get("hp_bar_hue", 0)) / 360.0
	_hp_bar_font_size = float(_hero_config.get("hp_bar_font_size", 31))
	if _bar_fg and _bar_fg.material is ShaderMaterial:
		(_bar_fg.material as ShaderMaterial).set_shader_parameter("hue_shift", _hp_bar_hue)
	# Hero name label config
	if _name_label:
		var full_name = _hero_config.get("full_name", "")
		var display_name = full_name if full_name != "" else hero_name
		_name_label.text = display_name
		_name_label.visible = display_name != ""
		var shadow_size = int(_hero_config.get("text_shadow_size", 3))
		_name_label.add_theme_constant_override("shadow_offset_x", shadow_size)
		_name_label.add_theme_constant_override("shadow_offset_y", shadow_size)
		var shadow_color_str = _hero_config.get("text_shadow_color", "")
		if shadow_color_str is String and shadow_color_str.begins_with("rgba"):
			# Parse "rgba(r, g, b, a)" to Color
			var inner = shadow_color_str.trim_prefix("rgba(").trim_suffix(")")
			var parts = inner.split(",")
			if parts.size() == 4:
				var sc = Color(
					float(parts[0].strip_edges()) / 255.0,
					float(parts[1].strip_edges()) / 255.0,
					float(parts[2].strip_edges()) / 255.0,
					float(parts[3].strip_edges())
				)
				_name_label.add_theme_color_override("font_shadow_color", sc)

func _get_bar_aspect_ratio() -> float:
	if _bar_bg and _bar_bg.texture:
		var tex_size = _bar_bg.texture.get_size()
		if tex_size.y > 0:
			return tex_size.x / tex_size.y
	return 4.0

func _load_hero_config():
	var path = "res://data/hero/%s/hero.json" % hero_slug
	var file = FileAccess.open(path, FileAccess.READ)
	if not file:
		return
	var json = JSON.new()
	if json.parse(file.get_as_text()) == OK and json.data is Dictionary:
		_hero_config = json.data

func _load_sprites():
	if is_enemy:
		_load_pose_sprites()
	else:
		_load_card_sprites()

func _load_pose_sprites():
	var animap_scene = preload("res://scenes/animap_player.tscn")
	_pose_animap = animap_scene.instantiate()
	add_child(_pose_animap)
	move_child(_pose_animap, 0)
	_pose_animap.load_animap("pose-%s" % hero_slug)

func _load_card_sprites():
	var base_path = "res://data/hero/%s/img/" % hero_slug

	# Background layer
	var bg_path = base_path + "char-bg.webp"
	if ResourceLoader.exists(bg_path):
		bg_sprite.texture = load(bg_path)

	# Frame (reuse shadow_sprite, tinted)
	var frame_tex = load("res://assets/ui/hero-frame.webp")
	if frame_tex:
		shadow_sprite.texture = frame_tex
		var tint_str = _hero_config.get("tint", "#ffffff")
		if typeof(tint_str) == TYPE_STRING:
			shadow_sprite.modulate = Color(tint_str)
		_frame_base_modulate = shadow_sprite.modulate

	# Foreground layer
	var fg_path = base_path + "char-fg.webp"
	if ResourceLoader.exists(fg_path):
		char_sprite.texture = load(fg_path)

func update_state(data: Dictionary):
	var new_hp = data.get("hp_current", current_hp)
	var new_alive = data.get("alive", is_alive)
	
	if new_hp != current_hp:
		var delta = new_hp - current_hp
		if delta != 0:
			_show_floating_text(delta)
		_tween_hp_change(new_hp)
	
	if not new_alive and is_alive:
		_set_dead_visuals()
	
	is_alive = new_alive
	
	# Update busy state (casting) — only used as fallback if no cast data
	var busy_until = int(data.get("busy_until", 0))
	var now_ms = int(Time.get_unix_time_from_system() * 1000.0)
	if busy_until > now_ms:
		_show_casting("busy_%s" % hero_instance_id, busy_until - now_ms)

func _tween_hp_change(new_hp: int):
	if _tween_hp and _tween_hp.is_valid():
		_tween_hp.kill()
	
	_tween_hp = create_tween()
	_tween_hp.set_ease(Tween.EASE_OUT)
	_tween_hp.set_trans(Tween.TRANS_CUBIC)
	_tween_hp.tween_method(_set_hp_value, current_hp, new_hp, 0.3)
	current_hp = new_hp

func _set_hp_value(value: int):
	current_hp = value
	_update_hp_display()

func _update_hp_display():
	var pct = float(current_hp) / max(max_hp, 1)
	pct = clampf(pct, 0.0, 1.0)
	if _bar_fg and _bar_fg.material is ShaderMaterial:
		(_bar_fg.material as ShaderMaterial).set_shader_parameter("fill", pct)
	if _bar_label:
		_bar_label.text = "%d / %d" % [current_hp, max_hp]

func _set_dead_visuals():
	if _pose_animap:
		_pose_animap.modulate = Color(0.3, 0.3, 0.3, 0.5)
	else:
		char_sprite.modulate = Color(0.3, 0.3, 0.3, 0.5)
		bg_sprite.modulate = Color(0.3, 0.3, 0.3, 0.5)
		shadow_sprite.visible = false

func _show_floating_text(amount: int):
	var text = FloatingText.new()
	text.position = floating_text_origin.position
	add_child(text)
	
	if amount > 0:
		text.show_heal(amount)
	else:
		text.show_damage(abs(amount))

## Take damage - reduces HP and shows floating text
func take_damage(amount: int):
	if is_dead():
		return
	
	current_hp = max(0, current_hp - amount)
	_update_hp_display()
	_show_floating_text(-amount)
	
	# Check for death
	if current_hp <= 0:
		is_alive = false
		_set_dead_visuals()
		print("[Hero] ", hero_slug, " died!")

## Show DoT applied indicator
func show_dot_applied(dot_type: String, damage_per_tick: int, ticks: int):
	# Show floating text for DoT application
	var dot_text = FloatingText.new()
	dot_text.position = floating_text_origin.position
	add_child(dot_text)
	dot_text.show_dot_damage(dot_type, damage_per_tick, ticks)

## Show/hide target marker (red circle/arrow above hero)
func show_target_marker(show: bool, is_primary: bool = true):
	if not show:
		if _target_indicator:
			_target_indicator.modulate.a = 0.0
		return
	
	# Create indicator if needed
	if not _target_indicator:
		_target_indicator = _create_target_indicator()
	
	# Position indicator above the hero using global position
	var global_pos = get_global_position()
	_target_indicator.global_position = Vector2(global_pos.x - 30, global_pos.y - 70)
	_target_indicator.modulate.a = 1.0
	
	# Pulse animation
	if _target_tween and _target_tween.is_valid():
		_target_tween.kill()
	_target_tween = create_tween().set_loops()
	_target_tween.set_trans(Tween.TRANS_SINE)
	_target_tween.set_ease(Tween.EASE_IN_OUT)
	_target_tween.tween_property(_target_indicator, "scale", Vector2(1.15, 1.15), 0.3)
	_target_tween.tween_property(_target_indicator, "scale", Vector2(1.0, 1.0), 0.3)

## Show target marker with offset for multiple sources targeting same enemy
## source_slot: the ally hero slot that is targeting this enemy
## offset_index: index among all allies targeting this same enemy (0, 1, 2)
var _marker_pool: Dictionary = {}  # source_slot -> Control node

func show_target_marker_with_offset(show: bool, source_slot: int, offset_index: int, ally_name: String):
	if not show:
		# Hide all markers
		for key in _marker_pool.keys():
			_marker_pool[key].modulate.a = 0.0
		return
	
	# Create or reuse indicator for this source slot
	if not _marker_pool.has(source_slot):
		_marker_pool[source_slot] = _create_indicator_for_pool()
	
	var indicator = _marker_pool[source_slot]
	
	# Position relative to this hero (indicator is child of hero)
	var offset_x = (source_slot - 1) * 50  # -50, 0, +50 based on slot
	var offset_y = -70 - (offset_index * 35)  # Stack vertically if multiple
	indicator.position = Vector2(-30 + offset_x, offset_y)
	indicator.modulate.a = 1.0
	
	# Pulse animation
	if _target_tween and _target_tween.is_valid():
		_target_tween.kill()
	_target_tween = create_tween().set_loops()
	_target_tween.set_trans(Tween.TRANS_SINE)
	_target_tween.set_ease(Tween.EASE_IN_OUT)
	_target_tween.tween_property(indicator, "scale", Vector2(1.15, 1.15), 0.3)
	_target_tween.tween_property(indicator, "scale", Vector2(1.0, 1.0), 0.3)

## Hide all pooled markers
func hide_all_pooled_markers():
	for key in _marker_pool.keys():
		_marker_pool[key].modulate.a = 0.0

## Create indicator node for the marker pool
func _create_indicator_for_pool() -> Control:
	# Create indicator as a child of this hero
	var indicator = Control.new()
	indicator.name = "PooledTargetIndicator"
	indicator.mouse_filter = Control.MOUSE_FILTER_IGNORE
	indicator.size = Vector2(60, 60)
	indicator.z_index = 500  # High z_index
	
	# Red circle background
	var circle = ColorRect.new()
	circle.name = "Circle"
	circle.color = Color(1.0, 0.2, 0.2, 0.9)
	circle.size = Vector2(60, 60)
	circle.position = Vector2.ZERO
	
	# Exclamation mark
	var arrow = Label.new()
	arrow.name = "Arrow"
	arrow.text = "!"
	arrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	arrow.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	arrow.position = Vector2.ZERO
	arrow.size = Vector2(60, 60)
	arrow.add_theme_font_size_override("font_size", 36)
	arrow.add_theme_color_override("font_color", Color.WHITE)
	arrow.add_theme_color_override("font_outline_color", Color(0.5, 0, 0, 1))
	arrow.add_theme_constant_override("outline_size", 3)
	
	indicator.add_child(circle)
	indicator.add_child(arrow)
	
	# Add as child of this hero (not HeroesContainer) to inherit transform
	add_child(indicator)
	# Start with modulate.a = 0 (hidden)
	indicator.modulate.a = 0.0
	
	return indicator

## Show/hide target info panel with enemy name
func show_target_info(show: bool, enemy_name: String = ""):
	if not show:
		if _target_info_panel:
			_target_info_panel.visible = false
		return
	
	# Create panel if needed
	if not _target_info_panel:
		_target_info_panel = _create_target_info_panel()
	
	_target_info_panel.visible = true
	if enemy_name != "":
		_target_name_label.text = "-> " + enemy_name

## Create target indicator visual (red circle above hero)
## Note: This is added to the hero's parent (HeroesContainer) to avoid clipping
func _create_target_indicator() -> Control:
	var indicator = Control.new()
	indicator.name = "TargetIndicator"
	indicator.mouse_filter = Control.MOUSE_FILTER_IGNORE
	indicator.size = Vector2(60, 60)
	
	# Red circle
	var circle = ColorRect.new()
	circle.name = "Circle"
	circle.color = Color(1.0, 0.2, 0.2, 0.9)
	circle.size = Vector2(60, 60)
	circle.position = Vector2.ZERO
	
	# Add an exclamation mark
	var arrow = Label.new()
	arrow.name = "Arrow"
	arrow.text = "!"
	arrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	arrow.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	arrow.position = Vector2.ZERO
	arrow.size = Vector2(60, 60)
	arrow.add_theme_font_size_override("font_size", 36)
	arrow.add_theme_color_override("font_color", Color.WHITE)
	arrow.add_theme_color_override("font_outline_color", Color(0.5, 0, 0, 1))
	arrow.add_theme_constant_override("outline_size", 3)
	
	indicator.add_child(circle)
	indicator.add_child(arrow)
	
	# Add to hero's parent instead of hero itself to avoid clip_children clipping
	var parent_node = get_parent()
	parent_node.add_child(indicator)
	
	return indicator

## Create target info panel showing the targeted enemy name
func _create_target_info_panel() -> PanelContainer:
	var panel = PanelContainer.new()
	panel.name = "TargetInfoPanel"
	panel.visible = false
	
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.2, 0.1, 0.1, 0.85)  # Dark red background
	style.set_corner_radius_all(6)
	style.set_content_margin_all(8)
	panel.add_theme_stylebox_override("panel", style)
	
	_target_name_label = Label.new()
	_target_name_label.name = "TargetNameLabel"
	_target_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_target_name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_target_name_label.add_theme_font_size_override("font_size", 22)
	_target_name_label.add_theme_color_override("font_color", Color(1.0, 0.7, 0.7, 1.0))
	panel.add_child(_target_name_label)
	
	add_child(panel)
	
	return panel

## Position target UI elements based on hero layout size
func _position_target_ui(layout_size: Vector2):
	if _target_indicator:
		var indicator_size = Vector2(60, 60)
		_target_indicator.position = Vector2((layout_size.x - indicator_size.x) / 2, -indicator_size.y - 10)
	
	# Position target info panel at bottom center of hero
	if _target_info_panel:
		var panel_width = 200.0
		var panel_height = 40.0
		_target_info_panel.position = Vector2((layout_size.x - panel_width) / 2, layout_size.y - panel_height - 10)
		_target_info_panel.size = Vector2(panel_width, panel_height)

func _build_cast_indicator():
	# Pie chart with action image background
	_cast_pie = CastPie.new()
	_cast_indicator.add_child(_cast_pie)

	# Action name label
	_cast_action_label = Label.new()
	_cast_action_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_cast_action_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_cast_action_label.add_theme_color_override("font_color", Color.WHITE)
	_cast_action_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	_cast_action_label.add_theme_constant_override("outline_size", 2)
	_cast_action_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cast_indicator.add_child(_cast_action_label)

func _resize_cast_indicator(pie_size: float):
	if _cast_pie:
		_cast_pie.position = Vector2.ZERO
		_cast_pie.size = Vector2(pie_size, pie_size)
	if _cast_action_label:
		var label_x = pie_size + 8 + 6
		_cast_action_label.position = Vector2(label_x, 0)
		_cast_action_label.size = Vector2(_cast_indicator.size.x - label_x, pie_size)
		_cast_action_label.add_theme_font_size_override("font_size", max(8, int(pie_size * 0.5)))

func _show_casting(cast_id: String, duration_ms: int, action_slug: String = ""):
	# Skip if already animating this same cast
	if cast_id == _current_cast_id and _tween_cast and _tween_cast.is_valid():
		return
	_current_cast_id = cast_id
	if _tween_cast and _tween_cast.is_valid():
		_tween_cast.kill()
	_cast_indicator.visible = true
	if _cast_pie:
		_cast_pie.progress = 1.0
	if not action_slug.is_empty():
		var normalized = action_slug.replace("_", "-")
		# Set action image as pie background
		var icon_path = "res://data/action/%s/img/char-bg.webp" % normalized
		if _cast_pie:
			_cast_pie.action_texture = load(icon_path) if ResourceLoader.exists(icon_path) else null
		# Load action name from config
		var cfg_path = "res://data/action/%s/action.json" % normalized
		var file = FileAccess.open(cfg_path, FileAccess.READ)
		if file:
			var json = JSON.new()
			if json.parse(file.get_as_text()) == OK and json.data is Dictionary:
				_cast_action_label.text = json.data.get("full_name", normalized.capitalize())
			else:
				_cast_action_label.text = normalized.replace("-", " ").capitalize()
		else:
			_cast_action_label.text = normalized.replace("-", " ").capitalize()
	_tween_cast = create_tween()
	_tween_cast.tween_method(_set_cast_progress, 1.0, 0.0, duration_ms / 1000.0)
	_tween_cast.tween_callback(_hide_cast_indicator)

func _set_cast_progress(value: float):
	if _cast_pie:
		_cast_pie.progress = value

func _hide_cast_indicator():
	_cast_indicator.visible = false
	_current_cast_id = ""

func add_status_icon(status_kind: String):
	# TODO: Add status effect icons (stun, shield, buff, etc.)
	var icon = ColorRect.new()
	icon.custom_minimum_size = Vector2(24, 24)
	icon.color = _get_status_color(status_kind)
	status_container.add_child(icon)

func clear_status_icons():
	for child in status_container.get_children():
		child.queue_free()

func _get_status_color(kind: String) -> Color:
	match kind:
		"stun": return Color.PURPLE
		"shield": return Color.BLUE
		"attack_buff": return Color.ORANGE
		"defense_buff": return Color.GREEN
		"dot": return Color.RED
		"hot": return Color.CYAN
		_: return Color.WHITE

func set_char_brightness(value: float, duration: float = 0.2):
	if _tween_brightness and _tween_brightness.is_valid():
		_tween_brightness.kill()
	_tween_brightness = create_tween()
	_tween_brightness.set_ease(Tween.EASE_OUT)
	_tween_brightness.set_trans(Tween.TRANS_CUBIC)
	_tween_brightness.tween_method(_apply_brightness, _current_brightness, value, duration)

func set_drag_dimmed(dimmed: bool):
	_drag_dim_strength = 1.0 if dimmed else 0.0
	if is_enemy:
		_refresh_selection_visuals()
		return
	_apply_brightness(0.4 if dimmed else 1.0)

func _apply_brightness(value: float):
	_current_brightness = value
	_refresh_selection_visuals()

func set_selected(selected: bool):
	if _is_selected == selected:
		print("[Hero] set_selected noop hero=", hero_slug, " selected=", selected)
		return
	_is_selected = selected
	print("[Hero] set_selected hero=", hero_slug, " selected=", selected)
	if _tween_selection and _tween_selection.is_valid():
		_tween_selection.kill()
	_tween_selection = create_tween()
	_tween_selection.set_ease(Tween.EASE_OUT)
	_tween_selection.set_trans(Tween.TRANS_CUBIC)
	_tween_selection.tween_method(_set_selection_strength, _selection_strength, 1.0 if _is_selected else 0.0, 0.18)

func _set_selection_strength(value: float):
	_selection_strength = value
	_refresh_selection_visuals()

func _refresh_selection_visuals():
	var combined_dim = max(_selection_strength, _drag_dim_strength)
	if is_enemy:
		var pose_factor: float = lerpf(1.0, 0.4, _drag_dim_strength)
		if _pose_animap:
			_pose_animap.modulate = Color(pose_factor, pose_factor, pose_factor, 1.0)
	else:
		var bg_brightness = _current_brightness * lerpf(1.0, 0.35, combined_dim)
		if bg_sprite.material is ShaderMaterial:
			(bg_sprite.material as ShaderMaterial).set_shader_parameter("brightness", bg_brightness)
		if char_sprite.material is ShaderMaterial:
			(char_sprite.material as ShaderMaterial).set_shader_parameter("brightness", _current_brightness)
		char_sprite.modulate = Color.WHITE
		if shadow_sprite.texture:
			shadow_sprite.modulate = _frame_base_modulate * lerpf(1.0, 0.4, combined_dim)

func get_slot_index() -> int:
	return slot_index

func is_dead() -> bool:
	return not is_alive

func is_casting() -> bool:
	return _current_cast_id != ""

class CastPie:
	extends Control

	var progress: float = 1.0:
		set(v):
			progress = v
			queue_redraw()

	var action_texture: Texture2D = null:
		set(v):
			action_texture = v
			queue_redraw()

	func _draw():
		var radius = min(size.x, size.y) / 2.0
		var center = Vector2(radius, radius)
		if progress < 0.001:
			return
		# Build pie wedge points (clockwise from top)
		var pie_points: PackedVector2Array = [center]
		var start_angle = -PI / 2.0
		var end_angle = start_angle + TAU * progress
		var segments = max(4, int(64 * progress))
		for i in range(segments + 1):
			var angle = start_angle + (end_angle - start_angle) * float(i) / float(segments)
			pie_points.append(center + Vector2(cos(angle), sin(angle)) * radius)
		# Draw action texture clipped to pie, or solid color fallback
		if action_texture:
			var tex_size = action_texture.get_size()
			# Map pie points to UV (square texture -> circle area)
			var uvs: PackedVector2Array = []
			for pt in pie_points:
				uvs.append(Vector2(pt.x / (radius * 2.0), pt.y / (radius * 2.0)))
			draw_colored_polygon(pie_points, Color.WHITE, uvs, action_texture)
		else:
			draw_colored_polygon(pie_points, Color(0.3, 0.8, 1.0, 0.85))
		# Border ring
		var ring_points: PackedVector2Array = []
		for i in range(65):
			var angle = TAU * float(i) / 64.0
			ring_points.append(center + Vector2(cos(angle), sin(angle)) * radius)
		draw_polyline(ring_points, Color(1, 1, 1, 0.6), 1.5, true)

class FloatingText:
	extends Label
	
	func _init():
		horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		modulate = Color.WHITE
	
	func show_damage(amount: int):
		text = "-%d" % amount
		modulate = Color.RED
		_animate()
	
	func show_heal(amount: int):
		text = "+%d" % amount
		modulate = Color.GREEN
		_animate()
	
	func show_dot_damage(dot_type: String, damage_per_tick: int, ticks: int):
		# Show DoT application text - purple for poison
		match dot_type:
			"poison":
				modulate = Color(0.6, 0.2, 0.8, 1.0)  # Purple
				text = "☠️ POISON\n-%d/tick (%d)" % [damage_per_tick, ticks]
			"burn":
				modulate = Color(1.0, 0.4, 0.0, 1.0)  # Orange
				text = "🔥 BURN\n-%d/tick (%d)" % [damage_per_tick, ticks]
			"bleed":
				modulate = Color(0.8, 0.0, 0.0, 1.0)  # Red
				text = "🩸 BLEED\n-%d/tick (%d)" % [damage_per_tick, ticks]
			_:
				modulate = Color.PURPLE
				text = "DoT\n-%d/tick (%d)" % [damage_per_tick, ticks]
		
		add_theme_font_size_override("font_size", 28)
		_animate_dot()
	
	func _animate():
		var tween = create_tween()
		tween.parallel().tween_property(self, "position:y", position.y - 100, 1.0)
		tween.parallel().tween_property(self, "modulate:a", 0.0, 1.0)
		tween.tween_callback(queue_free)
	
	func _animate_dot():
		var tween = create_tween()
		tween.parallel().tween_property(self, "position:y", position.y - 80, 1.2)
		tween.parallel().tween_property(self, "modulate:a", 0.0, 1.2)
		tween.tween_callback(queue_free)
