extends Control

var card_scene = preload("res://scenes/Card.tscn")
var current_cards = []
var _extra_box_nodes = {}
var available_heroes = []

@onready var bg_texture = $Background # Requires TextureRect in scene
@onready var hero_select = $UI/HBoxContainer/HeroSelect
@onready var load_button = $UI/HBoxContainer/LoadButton

func _ready():
	randomize()
	
	_scan_heroes()
	
	# Setup UI
	for hero in available_heroes:
		hero_select.add_item(hero)
	
	load_button.pressed.connect(_on_load_hero_pressed)
	
	# Load cards
	_load_initial_cards()
	
	# Initial layout
	call_deferred("update_layout")
	
	# Connect to resize signal
	get_tree().root.size_changed.connect(update_layout)

func _scan_heroes():
	var dir = DirAccess.open("res://data/hero/")
	if dir:
		dir.list_dir_begin()
		var file_name = dir.get_next()
		while file_name != "":
			if dir.current_is_dir() and not file_name.begins_with("."):
				available_heroes.append(file_name)
			file_name = dir.get_next()
		available_heroes.sort()
	else:
		push_error("Failed to open data/hero directory")
		# Fallback list if directory scan fails
		available_heroes = ["frost-queen", "iron-knight", "storm-ranger"]

func _load_initial_cards():
	if available_heroes.is_empty(): return

	var layout_count = LayoutManager.get_layout_hero_count()
	if layout_count <= 0: layout_count = 3
	
	var config = LayoutManager.get_hero_config(layout_count)
	if config.is_empty():
		# Fallback if config not found
		config = []
		for i in range(layout_count): config.append({})
	
	var chosen_heroes = []
	var used_heroes = []
	
	# Pre-fill used heroes from fixed slots to avoid duplicates later
	for i in range(layout_count):
		if i < config.size():
			var slot = config[i]
			var slug = slot.get("cardSlug", "")
			if slug != "" and available_heroes.has(slug):
				used_heroes.append(slug)

	for i in range(layout_count):
		var slug = ""
		if i < config.size():
			var slot = config[i]
			slug = slot.get("cardSlug", "")
		
		# If slug is defined in JSON and available, use it
		if slug != "" and available_heroes.has(slug):
			chosen_heroes.append(slug)
		else:
			# Need to pick a random one
			# Try to pick one not already used
			var candidates = []
			for h in available_heroes:
				if not used_heroes.has(h):
					candidates.append(h)
			
			if candidates.is_empty():
				# If ran out of unique heroes, just pick any random
				candidates = available_heroes
				
			if not candidates.is_empty():
				var picked = candidates.pick_random()
				chosen_heroes.append(picked)
				used_heroes.append(picked)
	
	current_cards = []
	for slug in chosen_heroes:
		var card = create_card(slug)
		current_cards.append(card)

func create_card(hero_slug):
	var card = card_scene.instantiate()
	add_child(card)
	card.load_hero(hero_slug)
	card.double_clicked.connect(_on_card_double_clicked)
	return card

func update_layout():
	var viewport_size = get_viewport_rect().size
	
	# Use LayoutManager to position background and cards
	# "cave" is our scene key, bg_texture is the TextureRect node
	LayoutManager.apply_layout("cave", bg_texture, current_cards, viewport_size)
	
	_render_extra_layout_boxes(viewport_size)

func _get_hero_pose_texture(slug: String) -> Texture2D:
	# Try external path first for development
	var res_path = ProjectSettings.globalize_path("res://")
	var ext_path = res_path.path_join("../data/hero/" + slug + "/img/pose-char-fg.webp")
	
	if FileAccess.file_exists(ext_path):
		var image = Image.load_from_file(ext_path)
		if image:
			return ImageTexture.create_from_image(image)
	
	# Fallback to res://
	var int_path = "res://data/hero/" + slug + "/img/pose-char-fg.webp"
	if ResourceLoader.exists(int_path):
		return load(int_path)
	
	return null

func _load_hero_config(slug: String) -> Dictionary:
	# Try external path first
	var res_path = ProjectSettings.globalize_path("res://")
	var ext_path = res_path.path_join("../data/hero/" + slug + "/hero.json")
	
	if FileAccess.file_exists(ext_path):
		var file = FileAccess.open(ext_path, FileAccess.READ)
		if file:
			var content = file.get_as_text()
			var json = JSON.new()
			if json.parse(content) == OK:
				return json.data
	
	# Fallback to internal
	var int_path = "res://data/hero/" + slug + "/hero.json"
	if FileAccess.file_exists(int_path):
		var file = FileAccess.open(int_path, FileAccess.READ)
		if file:
			var content = file.get_as_text()
			var json = JSON.new()
			if json.parse(content) == OK:
				return json.data
	
	return {}

func _parse_vector(data) -> Vector2:
	if data is Dictionary:
		return Vector2(data.get("x", 0), data.get("y", 0))
	return Vector2.ZERO

func _get_hero_pose_shadow_texture(slug: String) -> Texture2D:
	# Try external path first for development
	var res_path = ProjectSettings.globalize_path("res://")
	var ext_path = res_path.path_join("../data/hero/" + slug + "/img/pose-shadow.webp")
	
	if FileAccess.file_exists(ext_path):
		var image = Image.load_from_file(ext_path)
		if image:
			return ImageTexture.create_from_image(image)
	
	# Fallback to res://
	var int_path = "res://data/hero/" + slug + "/img/pose-shadow.webp"
	if ResourceLoader.exists(int_path):
		return load(int_path)
	
	return null

func _render_extra_layout_boxes(viewport_size):
	var all_ids = LayoutManager.get_all_box_ids()
	for id in all_ids:
		# Skip heroes as they are handled by apply_layout and current_cards
		if id.begins_with("hero"): continue
		
		if not _extra_box_nodes.has(id):
			var data = LayoutManager.get_box(id)
			var w = data.get("width", 100)
			var h = data.get("height", 100)
			
			var pose_slug = data.get("poseSlug", "")
			
			var tex = null
			var shadow_tex = null
			if pose_slug != "":
				tex = _get_hero_pose_texture(pose_slug)
				shadow_tex = _get_hero_pose_shadow_texture(pose_slug)
			
			var node
			if tex:
				# Use a specialized PoseContainer that handles the scaling and positioning internally
				# similar to HeroPosePreview.tsx
				
				# Container is the "Box" from the editor.
				# LayoutManager will scale this container to match the box width.
				var container = Control.new()
				container.mouse_filter = Control.MOUSE_FILTER_IGNORE
				
				# Set size to match the box defined in JSON (unscaled pixels)
				container.custom_minimum_size = Vector2(w, h)
				container.size = Vector2(w, h)
				
				# Get pose configuration from the hero JSON, NOT the box JSON
				# The box JSON has "poseSlug" which tells us which hero to look up.
				# We need to load that hero's data to get char_fg_scale, shadow_pos, etc.
				
				# We need a helper to load hero config
				var hero_config = _load_hero_config(pose_slug)
				var pose_config = hero_config.get("pose", {})
				
				var char_fg_scale = pose_config.get("char_fg_scale", 100.0) / 100.0
				var char_fg_pos = _parse_vector(pose_config.get("char_fg_pos", {"x":0, "y":0}))
				
				var shadow_scale = pose_config.get("shadow_scale", 100.0) / 100.0
				var shadow_pos = _parse_vector(pose_config.get("shadow_pos", {"x":0, "y":0}))
				
				# Render Shadow
				if shadow_tex:
					var shadow = Sprite2D.new()
					shadow.texture = shadow_tex
					shadow.centered = true
					
					# Shadow Size relative to container
					# shadowW = w * scale
					# Sprite scale = target_size / texture_size
					var shadow_target_w = w * shadow_scale
					var shadow_tex_w = shadow_tex.get_width()
					var s_scale = shadow_target_w / shadow_tex_w if shadow_tex_w > 0 else 1.0
					shadow.scale = Vector2(s_scale, s_scale)
					
					# Shadow Position relative to center
					# sx = (w/2) + shadowPos.x - (shadowW/2) <-- This is top-left
					# Sprite is centered, so we want center position.
					# CenterX = sx + shadowW/2 = (w/2) + shadowPos.x
					shadow.position = Vector2(w/2.0 + shadow_pos.x, h/2.0 + shadow_pos.y)
					
					container.add_child(shadow)
				
				# Render Character
				var sprite = Sprite2D.new()
				sprite.texture = tex
				sprite.centered = true
				
				# Character Size
				var fg_target_w = w * char_fg_scale
				var tex_w = tex.get_width()
				var fg_scale = fg_target_w / tex_w if tex_w > 0 else 1.0
				sprite.scale = Vector2(fg_scale, fg_scale)
				
				# Character Position
				sprite.position = Vector2(w/2.0 + char_fg_pos.x, h/2.0 + char_fg_pos.y)
				
				container.add_child(sprite)
				
				node = container
			else:
				var box = ColorRect.new()
				box.color = Color(1, 0, 0, 0.2) # Semi-transparent red
				box.mouse_filter = Control.MOUSE_FILTER_IGNORE
				box.custom_minimum_size = Vector2(w, h)
				box.size = Vector2(w, h)
				
				var lbl = Label.new()
				lbl.text = data.get("label", id)
				lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
				lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
				lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				lbl.set_anchors_preset(Control.PRESET_FULL_RECT)
				box.add_child(lbl)
				node = box
			
			add_child(node)
			_extra_box_nodes[id] = node
			
		var node = _extra_box_nodes[id]
		LayoutManager.apply_box_layout(node, id, viewport_size)

func _on_load_hero_pressed():
	var index = hero_select.selected
	if index == -1: return
	
	# Check max cards (LayoutManager only supports up to 5)
	if current_cards.size() >= 5:
		push_warning("Cannot add more than 5 cards.")
		return
	
	var hero_slug = hero_select.get_item_text(index)
	
	# Create new card and append
	var card = create_card(hero_slug)
	current_cards.append(card)
	
	# Update layout
	update_layout()

func _on_card_double_clicked(card):
	if current_cards.has(card):
		current_cards.erase(card)
		card.queue_free()
		
		# Update layout after removal
		# We need to defer this slightly or just call it, 
		# queue_free removes it from tree at end of frame, 
		# but we already removed it from our list.
		update_layout()
