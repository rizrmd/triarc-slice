extends Control

signal double_clicked(card)

@onready var masked_group = $MaskedGroup
@onready var char_bg = $MaskedGroup/CharBG
@onready var frame = $Frame
@onready var frame_tint: TextureRect = $FrameTint
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
	add_to_group("hero_cards")
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
		name_label.add_theme_constant_override("outline_size", int(data.get("text_shadow_size", 3)))
		
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
		
	# 4. HP Bar
	var hp_bar_pos = data.get("hp_bar_pos")
	print("HP Bar - hp_bar_pos: ", hp_bar_pos)
	if hp_bar_pos:
		var hp_bar_node = get_node_or_null("HPBar")
		if not hp_bar_node:
			# Create HP Bar container
			hp_bar_node = Control.new()
			hp_bar_node.name = "HPBar"
			add_child(hp_bar_node)
			# Move HP bar to be above name_label but below nothing (top layer)
			move_child(hp_bar_node, -1)
			print("HP Bar - created HPBar node")

			# Create layers: BG, FG, Frame, Text
			var bar_bg_tex = load_texture("res://assets/ui/bar/bar-bg.webp")
			print("HP Bar - bar_bg texture: ", bar_bg_tex)
			var bar_bg = TextureRect.new()
			bar_bg.name = "BarBG"
			bar_bg.texture = bar_bg_tex
			bar_bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			bar_bg.stretch_mode = TextureRect.STRETCH_SCALE
			bar_bg.set_anchors_preset(Control.PRESET_TOP_LEFT)
			hp_bar_node.add_child(bar_bg)

			var bar_fg_tex = load_texture("res://assets/ui/bar/bar-fg.webp")
			print("HP Bar - bar_fg texture: ", bar_fg_tex)
			var bar_fg = TextureRect.new()
			bar_fg.name = "BarFG"
			bar_fg.texture = bar_fg_tex
			bar_fg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			bar_fg.stretch_mode = TextureRect.STRETCH_SCALE
			bar_fg.set_anchors_preset(Control.PRESET_TOP_LEFT)
			hp_bar_node.add_child(bar_fg)

			var bar_frame_tex = load_texture("res://assets/ui/bar/bar-frame.webp")
			print("HP Bar - bar_frame texture: ", bar_frame_tex)
			var bar_frame = TextureRect.new()
			bar_frame.name = "BarFrame"
			bar_frame.texture = bar_frame_tex
			bar_frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			bar_frame.stretch_mode = TextureRect.STRETCH_SCALE
			bar_frame.set_anchors_preset(Control.PRESET_TOP_LEFT)
			hp_bar_node.add_child(bar_frame)

			var bar_label = Label.new()
			bar_label.name = "BarLabel"
			bar_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			bar_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			bar_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
			# Add shadow to text
			bar_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
			bar_label.add_theme_constant_override("shadow_offset_x", 0)
			bar_label.add_theme_constant_override("shadow_offset_y", 1)
			bar_label.add_theme_constant_override("shadow_outline_size", 2)
			# Set font
			bar_label.add_theme_font_override("font", name_label.get_theme_font("font"))
			hp_bar_node.add_child(bar_label)
		
		# Update HP Bar properties
		var bar_scale = data.get("hp_bar_scale", 250) / 100.0
		
		var stats = data.get("stats", {})
		var stats_max_hp = stats.get("max_hp", 0)
		var default_hp = stats_max_hp if stats_max_hp > 0 else 100
		
		var current_hp = data.get("hp_bar_current", default_hp)
		var max_hp = data.get("hp_bar_max", default_hp)
		var hue_rot = data.get("hp_bar_hue", 0)
		var font_size_base = data.get("hp_bar_font_size", 31)
		
		# Calculate dimensions
		# Logic from CardPreview.tsx:
		# const baseWidth = cardW * 0.33;
		# const barW = baseWidth * barScale;
		# const barH = barW / aspectRatio;
		
		var bar_bg_tex = load_texture("res://assets/ui/bar/bar-bg.webp")
		print("HP Bar - bar_bg_tex for sizing: ", bar_bg_tex)
		if bar_bg_tex:
			var aspect = bar_bg_tex.get_width() / float(bar_bg_tex.get_height())
			var base_width = card_size.x * 0.33
			var final_w = base_width * bar_scale
			var final_h = final_w / aspect
			
			print("HP Bar - card_size: ", card_size, " aspect: ", aspect, " final_w: ", final_w, " final_h: ", final_h)
			
			hp_bar_node.size = Vector2(final_w, final_h)
			hp_bar_node.custom_minimum_size = Vector2(final_w, final_h)
			
			# Position
			# cx + config.hp_bar_pos.x - barW / 2
			var offset_x = hp_bar_pos.get("x", 0)
			var offset_y = hp_bar_pos.get("y", 0)
			
			hp_bar_node.position = center + Vector2(offset_x, offset_y + 10) - (hp_bar_node.size / 2)
			print("HP Bar - position: ", hp_bar_node.position, " center: ", center, " offset: ", Vector2(offset_x, offset_y))
			
			# Apply to children
			var bar_bg = hp_bar_node.get_node("BarBG")
			bar_bg.size = hp_bar_node.size
			bar_bg.position = Vector2.ZERO
			
			var bar_fg = hp_bar_node.get_node("BarFG")
			bar_fg.size = hp_bar_node.size
			bar_fg.position = Vector2.ZERO
			
			# Clip FG based on percentage
			# Use a Control container with clip_contents?
			# Or simpler: texture region? No, Expand mode.
			# Best way: Use a Container for FG and set its size width percentage.
			# But we need to keep aspect ratio of texture inside?
			# Actually, standard bars usually just crop.
			# Let's wrap FG in a Control that clips.
			
			var percentage = clamp(float(current_hp) / float(max_hp), 0.0, 1.0)
			
			# We need to recreate structure if we want proper clipping without scaling distortion
			# Or use a shader.
			# Simplest: TextureProgressBar?
			# TextureProgressBar supports expand and radial fill etc.
			# Let's replace TextureRect with TextureProgressBar if possible, but we already created nodes.
			# Let's adjust nodes.
			
			if bar_fg is TextureRect:
				# Replace with TextureProgressBar for easy handling
				var parent = bar_fg.get_parent()
				var new_bar = TextureProgressBar.new()
				new_bar.name = "BarFG"
				new_bar.texture_progress = bar_fg.texture
				# Use nine_patch_stretch to scale texture to size
				new_bar.nine_patch_stretch = true
				new_bar.stretch_margin_bottom = 0
				new_bar.stretch_margin_left = 0
				new_bar.stretch_margin_right = 0
				new_bar.stretch_margin_top = 0
				
				new_bar.value = percentage * 100
				new_bar.set_anchors_preset(Control.PRESET_TOP_LEFT)
				new_bar.size = hp_bar_node.size
				new_bar.position = Vector2.ZERO
				
				# Hue rotation
				if hue_rot != 0:
					# Create a material for hue rotation
					var mat = ShaderMaterial.new()
					# Simple hue shift shader
					var code = """
					shader_type canvas_item;
					uniform float hue_shift;
					vec3 hueShift(vec3 color, float hue) {
						const vec3 k = vec3(0.57735, 0.57735, 0.57735);
						float cosAngle = cos(hue);
						return vec3(color * cosAngle + cross(k, color) * sin(hue) + k * dot(k, color) * (1.0 - cosAngle));
					}
					void fragment() {
						vec4 tex = texture(TEXTURE, UV);
						COLOR = vec4(hueShift(tex.rgb, hue_shift), tex.a);
					}
					"""
					var shader = Shader.new()
					shader.code = code
					mat.shader = shader
					mat.set_shader_parameter("hue_shift", deg_to_rad(hue_rot))
					new_bar.material = mat
				
				parent.remove_child(bar_fg)
				bar_fg.queue_free()
				parent.add_child(new_bar)
				# Reorder to be behind frame (frame is last added texture, label is after)
				parent.move_child(new_bar, 1) 
			elif bar_fg is TextureProgressBar:
				bar_fg.size = hp_bar_node.size
				bar_fg.value = percentage * 100
			
			var bar_frame = hp_bar_node.get_node("BarFrame")
			bar_frame.size = hp_bar_node.size
			bar_frame.position = Vector2.ZERO
			
			# Label
			var bar_label = hp_bar_node.get_node("BarLabel")
			bar_label.text = str(int(round(current_hp))) + " / " + str(int(round(max_hp)))
			bar_label.size = hp_bar_node.size
			bar_label.position = Vector2(0, -5)
			bar_label.vertical_alignment = VERTICAL_ALIGNMENT_TOP
			bar_label.add_theme_constant_override("line_spacing", 0)
			
			# Font size
			# Logic: fontSizeRatio = baseFontSize / 471 (typical card width)
			# fontSize = cardW * fontSizeRatio
			var font_ratio = float(font_size_base) / 471.0
			var final_font_size = max(12, int(card_size.x * font_ratio))
			bar_label.add_theme_font_size_override("font_size", final_font_size)
			hp_bar_node.visible = true
			print("HP Bar - visible set to true, hp_bar_node.size: ", hp_bar_node.size, " position: ", hp_bar_node.position)
		else:
			print("HP Bar - bar_bg_tex is NULL, cannot size HP bar")
	else:
		var hp_bar_node = get_node_or_null("HPBar")
		if hp_bar_node:
			hp_bar_node.visible = false

	# Reset base frame color
	frame.modulate = Color.WHITE

	# Configure FrameTint
	frame_tint.texture = frame.texture
	frame_tint.expand_mode = frame.expand_mode
	frame_tint.stretch_mode = frame.stretch_mode
	frame_tint.size = frame.size
	frame_tint.position = frame.position
	frame_tint.visible = false
	frame_tint.material = null

	if data.has("tint") and data.tint != "":
		# Enable FrameTint with Multiply Shader
		var mat = ShaderMaterial.new()
		mat.shader = multiply_shader
		frame_tint.material = mat

		# Set tint color (passed as COLOR to shader)
		frame_tint.modulate = parse_color(data.tint)
		frame_tint.visible = true

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
