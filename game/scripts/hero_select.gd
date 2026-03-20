extends Control
## Hero Selection Screen - Pick 3 heroes before queuing

signal back_requested
signal find_match_requested

@onready var hero_grid: GridContainer = $HeroScroll/HeroGrid
@onready var selected_container: HBoxContainer = $SelectedContainer
@onready var find_match_button: Button = $FindMatchButton
@onready var back_button: Button = $BackButton
@onready var status_label: Label = $StatusLabel

# Cached resources
var _frame_tex: Texture2D
var _char_shader: Shader
var _empty_mask: ImageTexture

# Reference card size (hero-frame.webp is 471x720)
const REF_W: float = 471.0
const REF_H: float = 720.0

func _ready():
	find_match_button.pressed.connect(_on_find_match_pressed)
	back_button.pressed.connect(_on_back_pressed)

	_frame_tex = load("res://assets/ui/hero-frame.webp")

	# Shader that maps card-space UV to layer-space UV, then applies painted mask.
	# The TextureRect fills the card area; the shader samples the correct portion
	# of the char texture — no overflow, no clip_children needed.
	# 1x1 transparent fallback when a mask file is missing
	var img = Image.create(1, 1, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_empty_mask = ImageTexture.create_from_image(img)

	_char_shader = Shader.new()
	_char_shader.code = """shader_type canvas_item;
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

	_populate_hero_grid()
	_update_ui()

func _load_hero_config(slug: String) -> Dictionary:
	var path = "res://data/hero/%s/hero.json" % slug
	var file = FileAccess.open(path, FileAccess.READ)
	if not file:
		return {}
	var json = JSON.new()
	if json.parse(file.get_as_text()) != OK:
		return {}
	return json.data

func _make_char_rect(slug: String, layer: String, pos: Dictionary, scale_pct: float, card_size: Vector2) -> TextureRect:
	var sx = card_size.x / REF_W
	var sy = card_size.y / REF_H
	var cx = card_size.x / 2.0
	var cy = card_size.y / 2.0

	# Layer position & size in card space (may extend beyond card bounds)
	var lw = card_size.x * scale_pct
	var lh = card_size.y * scale_pct
	var lx = cx + float(pos.get("x", 0)) * sx - lw / 2.0
	var ly = cy + float(pos.get("y", 0)) * sy - lh / 2.0

	# TextureRect fills the card — shader handles UV mapping
	var tex_rect = TextureRect.new()
	tex_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tex_rect.stretch_mode = TextureRect.STRETCH_SCALE
	tex_rect.position = Vector2.ZERO
	tex_rect.size = card_size

	var tex_path = "res://data/hero/%s/img/char-%s.webp" % [slug, layer]
	if ResourceLoader.exists(tex_path):
		tex_rect.texture = load(tex_path)

	var mat = ShaderMaterial.new()
	mat.shader = _char_shader

	# UV transform: card UV (0-1) -> layer UV (0-1)
	# card pixel (u * card_w, v * card_h) maps to layer pixel (u * card_w - lx, v * card_h - ly)
	# layer UV = (card_pixel - layer_origin) / layer_size = (UV * card_size - layer_pos) / layer_size
	mat.set_shader_parameter("char_uv_offset", Vector2(-lx / lw, -ly / lh))
	mat.set_shader_parameter("char_uv_scale", Vector2(card_size.x / lw, card_size.y / lh))

	var mask_path = "res://data/hero/%s/img/mask-%s.webp" % [slug, layer]
	var mask_tex = load(mask_path) if ResourceLoader.exists(mask_path) else _empty_mask
	mat.set_shader_parameter("mask_tex", mask_tex)

	tex_rect.material = mat
	return tex_rect

func _create_hero_card(slug: String, card_size: Vector2) -> Control:
	var config = _load_hero_config(slug)

	var sx = card_size.x / REF_W
	var sy = card_size.y / REF_H
	var cy = card_size.y / 2.0

	var container = Control.new()
	container.custom_minimum_size = card_size
	container.size = card_size

	# --- char-bg layer (behind frame) ---
	var bg_pos = config.get("char_bg_pos", {"x": 0, "y": 0})
	var bg_scale = float(config.get("char_bg_scale", 100)) / 100.0
	container.add_child(_make_char_rect(slug, "bg", bg_pos, bg_scale, card_size))

	# --- Frame layer (tinted) ---
	var frame_rect = TextureRect.new()
	frame_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	frame_rect.stretch_mode = TextureRect.STRETCH_SCALE
	frame_rect.position = Vector2.ZERO
	frame_rect.size = card_size
	frame_rect.texture = _frame_tex
	var tint_str = config.get("tint", "#ffffff")
	if typeof(tint_str) == TYPE_STRING:
		frame_rect.modulate = Color(tint_str)
	container.add_child(frame_rect)

	# --- char-fg layer (above frame, only if it has alpha / is a cutout) ---
	var fg_path = "res://data/hero/%s/img/char-fg.webp" % slug
	var bg_path = "res://data/hero/%s/img/char-bg.webp" % slug
	if ResourceLoader.exists(fg_path):
		var fg_tex = load(fg_path)
		var bg_tex = load(bg_path) if ResourceLoader.exists(bg_path) else null
		# Skip char-fg if it's the same image as char-bg (no cutout)
		if bg_tex == null or fg_tex.get_rid() != bg_tex.get_rid():
			var fg_img = fg_tex.get_image()
			if fg_img and fg_img.detect_alpha() != Image.ALPHA_NONE:
				var fg_pos = config.get("char_fg_pos", {"x": 0, "y": 0})
				var fg_scale = float(config.get("char_fg_scale", 100)) / 100.0
				container.add_child(_make_char_rect(slug, "fg", fg_pos, fg_scale, card_size))

	# --- Name label ---
	var full_name = config.get("full_name", slug)
	if full_name and card_size.x >= 60:
		var name_cfg = config.get("name_pos", {"x": 0, "y": 0})
		var name_scale_val = float(config.get("name_scale", 40))
		var font_size = int(name_scale_val * sy)
		var shadow_size = int(max(1, float(config.get("text_shadow_size", 3)) * sy))

		var name_lbl = Label.new()
		name_lbl.text = full_name
		name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		name_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		name_lbl.add_theme_font_size_override("font_size", font_size)
		name_lbl.add_theme_color_override("font_color", Color.WHITE)
		name_lbl.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.5))
		name_lbl.add_theme_constant_override("outline_size", shadow_size)
		var label_h = font_size * 1.5
		name_lbl.position = Vector2(
			float(name_cfg.get("x", 0)) * sx,
			cy + float(name_cfg.get("y", 0)) * sy - label_h / 2.0
		)
		name_lbl.size = Vector2(card_size.x, label_h)
		container.add_child(name_lbl)

	return container

func _populate_hero_grid():
	for child in hero_grid.get_children():
		child.queue_free()

	var card_w = 180.0
	var card_h = card_w * (REF_H / REF_W)
	var card_size = Vector2(card_w, card_h)

	var hero_slugs = GameState.get_all_hero_slugs()
	for slug in hero_slugs:
		var hero_def = GameState.get_hero_def(slug)
		if hero_def.is_empty():
			continue

		var btn = Button.new()
		btn.custom_minimum_size = card_size
		btn.toggle_mode = true
		btn.button_pressed = GameState.is_hero_selected(slug)

		var card = _create_hero_card(slug, card_size)
		btn.add_child(card)

		btn.pressed.connect(_on_hero_pressed.bind(slug, btn))
		hero_grid.add_child(btn)

func _on_hero_pressed(slug: String, btn: Button):
	var selected = GameState.select_hero(slug)
	btn.button_pressed = GameState.is_hero_selected(slug)

	if not selected and not btn.button_pressed:
		pass
	elif not selected:
		status_label.text = "Select exactly 3 heroes"

	_update_ui()

func _update_ui():
	for child in selected_container.get_children():
		child.queue_free()

	var preview_w = 65.0
	var preview_h = preview_w * (REF_H / REF_W)
	var preview_size = Vector2(preview_w, preview_h)

	for slug in GameState.selected_heroes:
		var card = _create_hero_card(slug, preview_size)
		selected_container.add_child(card)

	find_match_button.disabled = not GameState.can_queue()

	if GameState.can_queue():
		status_label.text = "Ready to find match!"
	else:
		status_label.text = "Select %d more hero(es)" % (3 - GameState.selected_heroes.size())

func _on_find_match_pressed():
	if not GameState.can_queue():
		return

	var msg_type = "start_training" if GameState.match_mode == "training" else "queue_matchmaking"
	GameState.send_json({
		"type": msg_type,
		"hero_slug_1": GameState.selected_heroes[0],
		"hero_slug_2": GameState.selected_heroes[1],
		"hero_slug_3": GameState.selected_heroes[2]
	})

	find_match_requested.emit()

func _on_back_pressed():
	back_requested.emit()
