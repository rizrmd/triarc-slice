extends Node
class_name LayoutManager

# Layout configuration for different scenes
static var _scenes = {
	"cave": {
		"bg_path": "res://assets/places/cave.webp",
		"bg_size": Vector2(1640, 2460),
		"fit_mode": "cover", # cover or contain
		"card_formations": {
			1: [
				{"nx": 0.50, "ny": 0.50, "scale": 1.0}
			],
			2: [
				{"nx": 0.35, "ny": 0.60, "scale": 1.0},
				{"nx": 0.65, "ny": 0.60, "scale": 1.0}
			],
			3: [
				{"nx": 0.22, "ny": 0.70, "scale": 1.0},
				{"nx": 0.50, "ny": 0.70, "scale": 1.0},
				{"nx": 0.78, "ny": 0.70, "scale": 1.0}
			],
			4: [
				{"nx": 0.25, "ny": 0.72, "scale": 0.9},
				{"nx": 0.42, "ny": 0.68, "scale": 1.0},
				{"nx": 0.58, "ny": 0.68, "scale": 1.0},
				{"nx": 0.75, "ny": 0.72, "scale": 0.9}
			],
			5: [
				{"nx": 0.20, "ny": 0.74, "scale": 0.85},
				{"nx": 0.35, "ny": 0.70, "scale": 0.95},
				{"nx": 0.50, "ny": 0.67, "scale": 1.05}, # Captain
				{"nx": 0.65, "ny": 0.70, "scale": 0.95},
				{"nx": 0.80, "ny": 0.74, "scale": 0.85}
			]
		}
	}
}

static var _layout_loaded = false
static var _layout_data = {}

static func _ensure_layout_loaded():
	if _layout_loaded: return
	_layout_loaded = true
	
	var path = "res://data/game-layout.json"
	
	# Try to find external layout file for development (sibling to game folder)
	var res_abs_path = ProjectSettings.globalize_path("res://")
	var dev_path = res_abs_path.path_join("../data/game-layout.json")
	
	if FileAccess.file_exists(dev_path):
		path = dev_path
		print("Using external layout file: ", path)
	elif not FileAccess.file_exists(path):
		print("Layout file not found: ", path)
		return
		
	var file = FileAccess.open(path, FileAccess.READ)
	var content = file.get_as_text()
	var json = JSON.new()
	var error = json.parse(content)
	
	if error != OK:
		print("JSON Parse Error in layout: ", json.get_error_message())
		return
		
	var data = json.data
	_layout_data = data
	
	# Update background
	if data.has("background"):
		# Assuming standard path or resolving it
		var bg_name = data.background
		# If it's just filename, assume assets/places/
		if not bg_name.begins_with("res://"):
			bg_name = "res://assets/places/" + bg_name
		
		# Ensure "cave" key exists or create new if needed. 
		# For now we update "cave" since the gameplay scene uses it.
		if not _scenes.has("cave"):
			_scenes["cave"] = { "card_formations": {} }
			
		_scenes["cave"]["bg_path"] = bg_name
		
	# Update card formations based on heroes found
	if data.has("boxes"):
		var boxes = data.boxes
		var heroes = []
		
		# Find all heroes: hero1, hero2, ...
		for i in range(1, 6):
			var key = "hero" + str(i)
			if boxes.has(key):
				heroes.append(boxes[key])
		
		if heroes.size() > 0:
			var count = heroes.size()
			var formation = []
			
			# Standardized Layout Calculation
			# -------------------------------
			# Position (nx, ny): Relative to the Background Image (to strictly adhere to artwork features like stairs)
			# Size (nw, nh): Relative to the Screen Size (to ensure UI consistency across aspect ratios)
			
			# Reference Viewport for Normalization
			var ref_viewport_w = 1080.0
			var ref_viewport_h = 1920.0
			
			for h in heroes:
				var nx = h.get("nx", 0.5)
				var ny = h.get("ny", 0.5)
				var pivot = h.get("pivot", "center")
				var screen_relative = h.get("screen_relative", false)
				
				# Width/Height in JSON are pixels in the 1080x1920 Reference Viewport
				var w = h.get("width", 344.0)
				
				# Normalize Size relative to Reference Viewport Width (1080)
				# We use WIDTH as the primary size driver for this portrait game
				var size_norm = w / ref_viewport_w
				
				var card_slug = h.get("cardSlug", "")
				
				formation.append({
					"nx": nx,
					"ny": ny,
					"pivot": pivot,
					"screen_relative": screen_relative,
					"size_norm": size_norm,
					"cardSlug": card_slug
				})
			
			# Update the formation for this count
			# Note: We overwrite the existing formation for this specific count
			_scenes["cave"]["card_formations"][count] = formation
			print("Updated layout for ", count, " cards from JSON")

# Helper function to get pivot offset
static func _get_pivot_offset(pivot_name: String) -> Vector2:
	match pivot_name:
		"top-left": return Vector2(0, 0)
		"top-center": return Vector2(0.5, 0)
		"top-right": return Vector2(1, 0)
		"center-left": return Vector2(0, 0.5)
		"center": return Vector2(0.5, 0.5)
		"center-right": return Vector2(1, 0.5)
		"bottom-left": return Vector2(0, 1)
		"bottom-center": return Vector2(0.5, 1)
		"bottom-right": return Vector2(1, 1)
	return Vector2(0.5, 0.5) # Default center

# Helper to calculate position for a single slot/box
static func _calculate_box_transform(slot: Dictionary, viewport_size: Vector2, bg_metrics: Dictionary) -> Dictionary:
	var is_screen_relative = slot.get("screen_relative", false)
	var screen_x = 0.0
	var screen_y = 0.0
	
	if is_screen_relative:
		# Relative to viewport size
		screen_x = slot.nx * viewport_size.x
		screen_y = slot.ny * viewport_size.y
	else:
		# Relative to background image
		screen_x = bg_metrics.offset_x + (slot.nx * bg_metrics.scaled_w)
		screen_y = bg_metrics.offset_y + (slot.ny * bg_metrics.scaled_h)
	
	# Calculate Scale
	var target_w = 0.0
	if slot.has("size_norm"):
		target_w = slot.size_norm * viewport_size.x
	elif slot.has("nw"):
		target_w = slot.nw * viewport_size.x
	else:
		var base_w = (viewport_size.x - 48.0) / 3.0
		target_w = base_w * slot.get("scale", 1.0)
		
	return {
		"position": Vector2(screen_x, screen_y),
		"target_width": target_w,
		"pivot": slot.get("pivot", "center") # Revert to use pivot from slot for now
	}

# Apply layout to a background node and a list of card nodes
static func apply_layout(scene_key: String, bg_node: TextureRect, cards: Array, viewport_size: Vector2):
	_ensure_layout_loaded()
	
	if not _scenes.has(scene_key):
		push_error("Scene key not found: " + scene_key)
		return

	var config = _scenes[scene_key]
	var count = cards.size()
	
	# 1. Setup Background
	# -------------------
	# We manually calculate cover/contain to get the exact offset for card placement
	var bg_tex = load(config.bg_path)
	if bg_node.texture != bg_tex:
		bg_node.texture = bg_tex
	
	var bg_w = config.bg_size.x
	var bg_h = config.bg_size.y
	
	var scale_x = viewport_size.x / bg_w
	var scale_y = viewport_size.y / bg_h
	var final_scale = 1.0
	
	if config.fit_mode == "cover":
		final_scale = max(scale_x, scale_y)
	else:
		final_scale = min(scale_x, scale_y)
		
	# Apply transform to background
	# We center it
	var scaled_w = bg_w * final_scale
	var scaled_h = bg_h * final_scale
	var offset_x = (viewport_size.x - scaled_w) / 2.0
	var offset_y = (viewport_size.y - scaled_h) / 2.0
	
	# Set anchors to top-left to prevent anchor-based size override
	bg_node.anchor_left = 0.0
	bg_node.anchor_top = 0.0
	bg_node.anchor_right = 0.0
	bg_node.anchor_bottom = 0.0
	bg_node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg_node.position = Vector2(offset_x, offset_y)
	bg_node.set_deferred("size", Vector2(scaled_w, scaled_h))
	
	var bg_metrics = {
		"scaled_w": scaled_w,
		"scaled_h": scaled_h,
		"offset_x": offset_x,
		"offset_y": offset_y
	}
	
	# 2. Position Cards
	# -----------------
	if count == 0:
		return

	if not config.card_formations.has(count):
		push_warning("No formation found for card count: " + str(count))
		# Fallback to simple line or return
		return

	var formation = config.card_formations[count]
	
	for i in range(count):
		var card = cards[i]
		var slot = formation[i]
		
		# For card nodes, apply the exact same logic as apply_box_layout
		# This ensures consistency between heroes and other boxes
		var transform = _calculate_box_transform(slot, viewport_size, bg_metrics)
		var target_w = transform.target_width
		var pos_center = transform.position
		
		var ref_size = card.size
		if ref_size.x <= 0: ref_size = Vector2(750, 1050)
		
		# Calculate scale based on width
		var final_card_scale = target_w / ref_size.x
		var scaled_size = ref_size * final_card_scale
		
		card.scale = Vector2(final_card_scale, final_card_scale)
		
		# Position card such that its CENTER is at pos_center
		# Cards are Control nodes (usually) or Node2D
		# Assuming standard top-left pivot for the card node itself
		card.position = pos_center - (scaled_size * 0.5)
		
		# Z-index
		card.z_index = i
		if slot.has("scale"): 
			card.z_index = int(slot.scale * 10)

# Apply layout to a single UI element (box)
static func apply_box_layout(node: Node, box_id: String, viewport_size: Vector2, scene_key: String = "cave"):
	_ensure_layout_loaded()
	var box = get_box(box_id)
	if box.is_empty(): return
	
	# Normalize box data to slot format expected by calculator
	# JSON box has width/height, need size_norm
	var ref_viewport_w = 1080.0
	var size_norm = box.get("width", 100.0) / ref_viewport_w
	
	var slot = {
		"nx": box.get("nx", 0.5),
		"ny": box.get("ny", 0.5),
		"pivot": box.get("pivot", "center"),
		"screen_relative": box.get("screen_relative", false),
		"size_norm": size_norm
	}
	
	# Calculate BG metrics (needed for world-relative items)
	var config = _scenes.get(scene_key, _scenes["cave"])
	var bg_w = config.bg_size.x
	var bg_h = config.bg_size.y
	
	var scale_x = viewport_size.x / bg_w
	var scale_y = viewport_size.y / bg_h
	var final_scale = 1.0
	if config.fit_mode == "cover":
		final_scale = max(scale_x, scale_y)
	else:
		final_scale = min(scale_x, scale_y)
		
	var bg_metrics = {
		"scaled_w": bg_w * final_scale,
		"scaled_h": bg_h * final_scale,
		"offset_x": (viewport_size.x - (bg_w * final_scale)) / 2.0,
		"offset_y": (viewport_size.y - (bg_h * final_scale)) / 2.0
	}
	
	var transform = _calculate_box_transform(slot, viewport_size, bg_metrics)
	
	# Fix pivot issue:
	# The Editor exports x/y which are top-left or center depending on pivot?
	# Wait, the editor calculates nx/ny based on CENTER of the box.
	# But in Godot, we position the node.
	# If pivot is "top-left", the node position should be Top-Left.
	# BUT our target position from _calculate_box_transform is the CENTER of the box (because nx/ny are center).
	# So we need to offset the position based on the pivot relative to center.
	
	var target_w = transform.target_width
	var pos_center = transform.position
	
	var ref_size = Vector2(100, 100)
	if node is Control:
		ref_size = node.custom_minimum_size
		if ref_size.x <= 0: ref_size = node.size
	elif node is Sprite2D and node.texture:
		ref_size = node.texture.get_size()
		
	if ref_size.x <= 0: ref_size = Vector2(100, 100)
	
	var node_scale = target_w / ref_size.x
	var scaled_size = ref_size * node_scale
	
	# The editor always calculates nx/ny based on the CENTER of the box.
	# So pos_center is where the visual center of the node should be.
	
	if node is Node2D or node is Control:
		node.scale = Vector2(node_scale, node_scale)
		
		if node is Sprite2D:
			if node.centered:
				# Origin is center
				node.position = pos_center
			else:
				# Origin is top-left
				node.position = pos_center - (scaled_size * 0.5)
		elif node is Control:
			# Origin is top-left
			node.position = pos_center - (scaled_size * 0.5)
			# Note: If Control has a modified pivot_offset, this logic might need adjustment.
			# But for standard controls, this places the center at pos_center.

static func get_hero_config(count: int) -> Array:
	_ensure_layout_loaded()
	if _scenes.has("cave") and _scenes["cave"]["card_formations"].has(count):
		return _scenes["cave"]["card_formations"][count]
	return []

static func get_layout_hero_count() -> int:
	_ensure_layout_loaded()
	# Return the count that was loaded from JSON (the one we printed)
	# We can check which keys exist in card_formations that were likely added from JSON
	# Since we only add ONE entry based on JSON heroes, we can just find it.
	# But wait, we might have default hardcoded ones too.
	# The JSON loader logic:
	# if heroes.size() > 0: ... _scenes["cave"]["card_formations"][count] = formation
	
	if _layout_data.has("boxes"):
		var count = 0
		for i in range(1, 6):
			if _layout_data.boxes.has("hero" + str(i)):
				count += 1
		return count
	return 3 # Default fallback


static func get_box(box_id: String) -> Dictionary:
	_ensure_layout_loaded()
	if _layout_data.has("boxes") and _layout_data.boxes.has(box_id):
		return _layout_data.boxes[box_id]
	return {}

static func get_all_box_ids() -> Array:
	_ensure_layout_loaded()
	if _layout_data.has("boxes"):
		return _layout_data.boxes.keys()
	return []
