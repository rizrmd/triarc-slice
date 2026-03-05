extends Control

@onready var char_bg = $CharBG
@onready var frame = $Frame
@onready var char_fg = $CharFG
@onready var name_label = $NameLabel

var mask_shader = preload("res://shaders/mask.gdshader")

func _ready():
	# Default load logic removed
	# To load a hero, call load_hero("slug") manually
	pass

func load_hero(slug: String):
	print("Loading hero: ", slug)
	var json_path = "res://cards/hero/" + slug + "/hero.json"
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
	if data.has("frame_image") and data.frame_image != "":
		# If it's a local path in assets, try to load it
		# For now fallback to default
		pass
		
	if frame_tex:
		frame.texture = frame_tex
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
	
	# 3. Name Label
	if data.has("full_name"):
		name_label.text = data.full_name
		
		# Font Size
		var font_size = data.get("name_scale", 40)
		name_label.add_theme_font_size_override("font_size", int(font_size))
		
		# Shadow Color
		# Use outline to match React strokeText(lineWidth=3)
		var shadow_color = Color(0, 0, 0, 0.5)
		if data.has("text_shadow_color"):
			shadow_color = parse_color(data.text_shadow_color)
			
		name_label.add_theme_color_override("font_outline_color", shadow_color)
		name_label.add_theme_constant_override("outline_size", 3)
		name_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0))
			
		var name_pos = data.get("name_pos", {"x": 0, "y": 0})
		var nx = name_pos.get("x", 0)
		var ny = name_pos.get("y", 0)
		
		# React logic: textX = w/2 + pos.x
		# We need to center the label pivot or adjust position by size/2
		# Since label size depends on content and font size, we should reset size to 0 to let it auto-resize
		name_label.size = Vector2.ZERO 
		# Force update size to get correct dimensions for centering
		var label_size = name_label.get_minimum_size()
		name_label.size = label_size
		
		# Correction for visual centering to match Canvas 'middle' baseline
		# Canvas 'middle' tends to be higher than Godot's bounding box center (which includes descent)
		# Shift up by ~22% of font size to align visual centers (increased from 12%)
		var correction_y = font_size * 0.22
		name_label.position = center + Vector2(nx, ny) - label_size / 2 - Vector2(0, correction_y)
		
	# 4. Tint
	if data.has("tint") and data.tint != "":
		# React uses multiply blend mode for tint
		# Godot Modulate is multiply by default for colors
		frame.modulate = parse_color(data.tint)

func setup_layer(node: TextureRect, layer_name: String, slug: String, pos_data: Dictionary, scale_percent: float, card_size: Vector2, center: Vector2):
	# Load Image
	# Priority: upload/custom extensions, then default .webp
	var base_path = "res://cards/hero/" + slug + "/img/" + layer_name
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
	var mask_path = "res://cards/hero/" + slug + "/img/" + layer_name.replace("char", "mask") + ".webp"
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
