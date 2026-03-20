class_name Hero
extends Control
## Hero - Displays a hero with layered sprites, HP bar, and status effects

@onready var bg_sprite: Sprite2D = $BGSprite
@onready var shadow_sprite: Sprite2D = $ShadowSprite
@onready var char_sprite: Sprite2D = $CharSprite
@onready var hp_bar: ProgressBar = $HPBar
@onready var _cast_bar: ProgressBar = $CastBar
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
var _hero_config: Dictionary = {}
var _mask_shader: Shader
var _card_shader: Shader
var _empty_mask: ImageTexture

func _ready():
	_cast_bar.visible = false
	_update_hp_display()
	_mask_shader = Shader.new()
	_mask_shader.code = """shader_type canvas_item;
uniform sampler2D mask_tex;
void fragment() {
	vec4 col = texture(TEXTURE, UV);
	vec4 mask = texture(mask_tex, UV);
	col.a *= (1.0 - mask.a);
	COLOR = col;
}
"""
	_card_shader = Shader.new()
	_card_shader.code = """shader_type canvas_item;
uniform sampler2D mask_tex;
uniform vec2 char_uv_offset;
uniform vec2 char_uv_scale;
void fragment() {
	vec2 luv = char_uv_offset + UV * char_uv_scale;
	vec4 col = texture(TEXTURE, luv);
	vec4 mask = texture(mask_tex, luv);
	col.a *= (1.0 - mask.a);
	COLOR = col;
}
"""
	var img = Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_empty_mask = ImageTexture.create_from_image(img)

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
	hp_bar.size = Vector2(layout_size.x - 24 * ui_sx, 27 * ui_sy)
	_cast_bar.size = Vector2(layout_size.x - 24 * ui_sx, 20 * ui_sy)
	status_container.size = Vector2(layout_size.x - 24 * ui_sx, 30 * ui_sy)
	if is_enemy:
		# Enemy: HP bar on top, then cast bar, then statuses below
		hp_bar.position = Vector2(12 * ui_sx, 8 * ui_sy)
		_cast_bar.position = Vector2(12 * ui_sx, hp_bar.position.y + hp_bar.size.y + 5 * ui_sy)
		status_container.position = Vector2(12 * ui_sx, _cast_bar.position.y + _cast_bar.size.y + 5 * ui_sy)
	else:
		# Ally: HP bar at bottom, cast bar and statuses above
		hp_bar.position = Vector2(12 * ui_sx, layout_size.y - 35 * ui_sy)
		_cast_bar.position = Vector2(12 * ui_sx, hp_bar.position.y - 25 * ui_sy)
		status_container.position = Vector2(12 * ui_sx, _cast_bar.position.y - 35 * ui_sy)

func _apply_pose_layout(layout_size: Vector2, center: Vector2):
	if _hero_config == null:
		return
	var ref_sx = layout_size.x / POSE_REF_SIZE.x
	var ref_sy = layout_size.y / POSE_REF_SIZE.y
	var pose = _hero_config.get("pose", {})
	if pose == null:
		pose = {}

	bg_sprite.visible = false

	# Shadow
	var shadow_pos = pose.get("shadow_pos", {"x": 0, "y": 0})
	var shadow_scale_pct = float(pose.get("shadow_scale", 100)) / 100.0
	if shadow_sprite.texture:
		var tex_size = shadow_sprite.texture.get_size()
		shadow_sprite.scale = Vector2(
			layout_size.x * shadow_scale_pct / tex_size.x,
			layout_size.y * shadow_scale_pct / tex_size.y
		)
	shadow_sprite.position = center + Vector2(
		float(shadow_pos.get("x", 0)) * ref_sx,
		float(shadow_pos.get("y", 0)) * ref_sy
	)

	# Character
	var char_pos = pose.get("char_fg_pos", {"x": 0, "y": 0})
	var char_scale_pct = float(pose.get("char_fg_scale", 100)) / 100.0
	if char_sprite.texture:
		var tex_size = char_sprite.texture.get_size()
		char_sprite.scale = Vector2(
			layout_size.x * char_scale_pct / tex_size.x,
			layout_size.y * char_scale_pct / tex_size.y
		)
	char_sprite.position = center + Vector2(
		float(char_pos.get("x", 0)) * ref_sx,
		float(char_pos.get("y", 0)) * ref_sy
	)

func _apply_card_layout(layout_size: Vector2, center: Vector2):
	if _hero_config == null:
		return
	var ref_sx = layout_size.x / CARD_REF_SIZE.x
	var ref_sy = layout_size.y / CARD_REF_SIZE.y

	# BG layer
	bg_sprite.visible = true
	var bg_pos = _hero_config.get("char_bg_pos", {"x": 0, "y": 0})
	var bg_scale_pct = float(_hero_config.get("char_bg_scale", 100)) / 100.0
	if bg_sprite.texture:
		var tex_size = bg_sprite.texture.get_size()
		bg_sprite.scale = Vector2(
			layout_size.x * bg_scale_pct / tex_size.x,
			layout_size.y * bg_scale_pct / tex_size.y
		)
	bg_sprite.position = center + Vector2(
		float(bg_pos.get("x", 0)) * ref_sx,
		float(bg_pos.get("y", 0)) * ref_sy
	)

	# Frame (reuses shadow_sprite, fills the whole card)
	if shadow_sprite.texture:
		var tex_size = shadow_sprite.texture.get_size()
		shadow_sprite.scale = Vector2(
			layout_size.x / tex_size.x,
			layout_size.y / tex_size.y
		)
	shadow_sprite.position = center

	# FG layer
	var fg_pos = _hero_config.get("char_fg_pos", {"x": 0, "y": 0})
	var fg_scale_pct = float(_hero_config.get("char_fg_scale", 100)) / 100.0
	if char_sprite.texture:
		var tex_size = char_sprite.texture.get_size()
		char_sprite.scale = Vector2(
			layout_size.x * fg_scale_pct / tex_size.x,
			layout_size.y * fg_scale_pct / tex_size.y
		)
	char_sprite.position = center + Vector2(
		float(fg_pos.get("x", 0)) * ref_sx,
		float(fg_pos.get("y", 0)) * ref_sy
	)

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
	var base_path = "res://data/hero/%s/img/" % hero_slug

	var shadow_path = base_path + "pose-shadow.webp"
	if ResourceLoader.exists(shadow_path):
		shadow_sprite.texture = load(shadow_path)

	var char_path = base_path + "pose-char-fg.webp"
	if ResourceLoader.exists(char_path):
		char_sprite.texture = load(char_path)

	var mask_path = base_path + "pose-mask-fg.webp"
	if ResourceLoader.exists(mask_path):
		var mat = ShaderMaterial.new()
		mat.shader = _mask_shader
		mat.set_shader_parameter("mask_tex", load(mask_path))
		char_sprite.material = mat

func _load_card_sprites():
	var base_path = "res://data/hero/%s/img/" % hero_slug

	# Background layer
	var bg_path = base_path + "char-bg.webp"
	if ResourceLoader.exists(bg_path):
		bg_sprite.texture = load(bg_path)
	var bg_mask_path = base_path + "mask-bg.webp"
	if ResourceLoader.exists(bg_mask_path):
		var mat = ShaderMaterial.new()
		mat.shader = _mask_shader
		mat.set_shader_parameter("mask_tex", load(bg_mask_path))
		bg_sprite.material = mat

	# Frame (reuse shadow_sprite, tinted)
	var frame_tex = load("res://assets/ui/hero-frame.webp")
	if frame_tex:
		shadow_sprite.texture = frame_tex
		var tint_str = _hero_config.get("tint", "#ffffff")
		if typeof(tint_str) == TYPE_STRING:
			shadow_sprite.modulate = Color(tint_str)

	# Foreground layer
	var fg_path = base_path + "char-fg.webp"
	if ResourceLoader.exists(fg_path):
		char_sprite.texture = load(fg_path)
	var fg_mask_path = base_path + "mask-fg.webp"
	if ResourceLoader.exists(fg_mask_path):
		var mat = ShaderMaterial.new()
		mat.shader = _mask_shader
		mat.set_shader_parameter("mask_tex", load(fg_mask_path))
		char_sprite.material = mat

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
	
	# Update busy state (casting)
	var busy_until = data.get("busy_until", 0)
	var now = Time.get_ticks_msec()
	if busy_until > now:
		_show_casting(busy_until - now)

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
	hp_bar.max_value = max_hp
	hp_bar.value = current_hp
	
	# Color based on HP percentage
	var pct = float(current_hp) / max_hp
	if pct > 0.6:
		hp_bar.modulate = Color.GREEN
	elif pct > 0.3:
		hp_bar.modulate = Color.YELLOW
	else:
		hp_bar.modulate = Color.RED

func _set_dead_visuals():
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

func _show_casting(duration_ms: int):
	_cast_bar.visible = true
	_cast_bar.max_value = duration_ms
	_cast_bar.value = duration_ms
	
	var tween = create_tween()
	tween.tween_property(_cast_bar, "value", 0, duration_ms / 1000.0)
	tween.tween_callback(func(): _cast_bar.visible = false)

func show_cast_indicator(progress: float):
	"""Show casting progress from 0 to 1"""
	_cast_bar.visible = true
	_cast_bar.max_value = 1.0
	_cast_bar.value = progress

func hide_cast_indicator():
	_cast_bar.visible = false

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

func get_slot_index() -> int:
	return slot_index

func is_dead() -> bool:
	return not is_alive

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
	
	func _animate():
		var tween = create_tween()
		tween.parallel().tween_property(self, "position:y", position.y - 100, 1.0)
		tween.parallel().tween_property(self, "modulate:a", 0.0, 1.0)
		tween.tween_callback(queue_free)
