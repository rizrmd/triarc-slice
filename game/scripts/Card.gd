extends Control

signal double_clicked(card)

@onready var masked_group = $MaskedGroup
@onready var char_bg = $MaskedGroup/CharBG
@onready var frame = $Frame
@onready var char_fg = $CharFG
@onready var name_label = $NameLabel

var mask_shader = preload("res://shaders/mask.gdshader")
var group_mask_shader = preload("res://shaders/group_mask.gdshader")
var multiply_shader = preload("res://shaders/multiply.gdshader")

var _dragging = false
var _drag_offset = Vector2()
var _original_z_index = 0

func _gui_input(event):
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.double_click:
				double_clicked.emit(self)
				accept_event()
				return

			if event.pressed:
				_dragging = true
				_drag_offset = get_global_mouse_position() - global_position
				_original_z_index = z_index
				z_index = 100 # Bring to front
				accept_event()
			else:
				_dragging = false
				z_index = _original_z_index
				accept_event()
				
	elif event is InputEventMouseMotion:
		if _dragging:
			global_position = get_global_mouse_position() - _drag_offset
			accept_event()

func _ready():
	# Load Global Mask for the Group
	var mask_tex = load_texture("res://assets/ui/hero-mask.webp")
	if mask_tex:
		var mat = ShaderMaterial.new()
		mat.shader = group_mask_shader
		mat.set_shader_parameter("mask_texture", mask_tex)
		masked_group.material = mat
	
	# Default load logic removed
	# To load a hero, call load_hero("slug") manually

func _process(_delta):
	if masked_group.material:
		var rect = get_global_rect()
		masked_group.material.set_shader_parameter("mask_origin", rect.position)
		masked_group.material.set_shader_parameter("mask_size", rect.size)

func load_hero(slug: String):
	print("Loading hero: ", slug)
	var json_path = "res://data/hero/" + slug + "/hero.json"
	if not FileAccess.file_exists(json_path):
		print("Error: JSON not found at ", json_path)
		return
		
	var file = FileAccess.open(json_path, FileAccess.READ)
	var content = file.get_as_text()
	var json = JSON.new()
	var error = json.parse(content)
	
	if error != OK:
		print("JSON Parse Error: ", json.get_error_message())
		return
		
	var data = json.data
	
	# 1. Load Frame first to establish base size
	var frame_tex = load_texture("res://assets/ui/hero-frame.webp")
	# mask setup removed

	if data.has("frame_image") and data.frame_image != "":
		# If it's a local path in assets, try to load it
		# For now fallback to default
		pass
		
	if frame_tex:
		frame.texture = frame_tex
		frame.visible = true
		
		# Resize card container to match frame
		custom_minimum_size = frame_tex.get_size()
		size = frame_tex.get_size()
		
		# Center the frame
		frame.size = size
		frame.position = Vector2.ZERO
	
	var card_size = size
	var center = card_size / 2
	
	# 2. Load and Position Layers
	setup_layer(char_bg, "char-bg", slug, data.get("char_bg_pos", {}), data.get("char_bg_scale", 100), card_size, center)
	
	setup_layer(char_fg, "char-fg", slug, data.get("char_fg_pos", {}), data.get("char_fg_scale", 100), card_size, center)
	char_fg.visible = true
	
	# 3. Name Label
	if data.has("full_name"):
		name_label.visible = true
		name_label.text = data.full_name
		
		# Font Size
		var font_size = data.get("name_scale", 40)
		name_label.add_theme_font_size_override("font_size", font_size)
		
		# Shadow/Outline (Match Frontend "strokeText")
		var shadow_color_str = data.get("text_shadow_color", "rgba(0, 0, 0, 0.5)")
		var shadow_color = parse_color(shadow_color_str)
		
		# Disable standard drop shadow
		name_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0))
		
		# Enable outline
		name_label.add_theme_color_override("font_outline_color", shadow_color)
		name_label.add_theme_constant_override("outline_size", 3)
		
		# Position
		var name_pos = data.get("name_pos", {})
		var offset_x = name_pos.get("x", 0)
		var offset_y = name_pos.get("y", 0)
		
		# Force size update to calculate correct centering
		name_label.reset_size()
		var label_size = name_label.get_combined_minimum_size()
		
		# Calculate target top-left position to center the text at (center + offset)
		var target_center = center + Vector2(offset_x, offset_y)
		var target_pos = target_center - (label_size / 2)
		
		# Use Top-Left preset to allow manual positioning without anchor interference
		name_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
		name_label.position = target_pos
		
	else:
		name_label.visible = false
	# Remove existing tint overlay if any
	var existing_tint = frame.get_node_or_null("FrameTint")
	if existing_tint:
		existing_tint.queue_free()
	
	# Reset base frame color
	frame.modulate = Color.WHITE

	if data.has("tint") and data.tint != "":
		# Create Tint Overlay with Multiply Shader
		var tint_overlay = TextureRect.new()
		tint_overlay.name = "FrameTint"
		tint_overlay.texture = frame.texture
		tint_overlay.expand_mode = frame.expand_mode
		tint_overlay.stretch_mode = frame.stretch_mode
		tint_overlay.layout_mode = 1 # Anchors
		tint_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
		
		var mat = ShaderMaterial.new()
		mat.shader = multiply_shader
		tint_overlay.material = mat
		
		# Set tint color (passed as COLOR to shader)
		tint_overlay.modulate = parse_color(data.tint)
		
		frame.add_child(tint_overlay)

func setup_layer(node: TextureRect, layer_name: String, slug: String, pos_data: Dictionary, scale_percent: float, card_size: Vector2, center: Vector2):
	# Load Image
	# Priority: upload/custom extensions, then default .webp
	var base_path = "res://data/hero/" + slug + "/img/" + layer_name
	var tex_path = ""

	var exts = [".upload", ".gif", ".png", ".jpg", ".jpeg"]
	for ext in exts:
		if FileAccess.file_exists(base_path + ext):
			tex_path = base_path + ext
			break

	if tex_path == "":
		tex_path = base_path + ".webp"

	var tex = load_texture(tex_path)
	
	if tex:
		node.texture = tex
		node.visible = true
	else:
		node.visible = false
		return

	# Load Mask
	var mask_path = "res://data/hero/" + slug + "/img/" + layer_name.replace("char", "mask") + ".webp"
	var mask_tex = load_texture(mask_path)
	
	if mask_tex:
		var mat = ShaderMaterial.new()
		mat.shader = mask_shader
		mat.set_shader_parameter("mask_texture", mask_tex)
		node.material = mat
	else:
		node.material = null
		
	# Transform
	# React: lw = w * (scale / 100)
	var target_w = card_size.x * (scale_percent / 100.0)
	var target_h = card_size.y * (scale_percent / 100.0)
	var target_size = Vector2(target_w, target_h)
	
	node.size = target_size
	# React: x = w/2 + config.x - lw/2
	var offset_x = pos_data.get("x", 0)
	var offset_y = pos_data.get("y", 0)
	
	node.position = center + Vector2(offset_x, offset_y) - (target_size / 2)

func load_texture(path: String) -> Texture2D:
	if FileAccess.file_exists(path):
		return load(path)
	return null

func parse_color(color_str: String) -> Color:
	if color_str.begins_with("#"):
		return Color(color_str)
	elif color_str.begins_with("rgba"):
		# rgba(r, g, b, a)
		var inner = color_str.replace("rgba(", "").replace(")", "").replace(" ", "")
		var parts = inner.split(",")
		if parts.size() == 4:
			return Color(float(parts[0])/255.0, float(parts[1])/255.0, float(parts[2])/255.0, float(parts[3]))
	elif color_str.begins_with("rgb"):
		# rgb(r, g, b)
		var inner = color_str.replace("rgb(", "").replace(")", "").replace(" ", "")
		var parts = inner.split(",")
		if parts.size() == 3:
			return Color(float(parts[0])/255.0, float(parts[1])/255.0, float(parts[2])/255.0)
	
	# Fallback logic: check if valid hex without hash or standard color name
	var test_color = Color.from_string(color_str, Color(0, 0, 0, 0.5))
	return test_color
