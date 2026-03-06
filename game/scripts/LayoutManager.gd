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
	if not FileAccess.file_exists(path):
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
		# For now we update "cave" since Main.gd uses it.
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
				
				# Width/Height in JSON are pixels in the 1080x1920 Reference Viewport
				var w = h.get("width", 344.0)
				var height = h.get("height", 516.0) 
				
				# Normalize Size relative to Reference Viewport Width (1080)
				# We use WIDTH as the primary size driver for this portrait game
				var size_norm = w / ref_viewport_w
				
				var card_slug = h.get("cardSlug", "")
				
				formation.append({
					"nx": nx,
					"ny": ny,
					"size_norm": size_norm,
					"cardSlug": card_slug
				})
			
			# Update the formation for this count
			# Note: We overwrite the existing formation for this specific count
			_scenes["cave"]["card_formations"][count] = formation
			print("Updated layout for ", count, " cards from JSON")

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
	
	bg_node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg_node.position = Vector2(offset_x, offset_y)
	bg_node.size = Vector2(scaled_w, scaled_h)
	
	# 2. Position Cards
	# -----------------
	if not config.card_formations.has(count):
		push_warning("No formation found for card count: " + str(count))
		# Fallback to simple line or return
		return

	var formation = config.card_formations[count]
	
	for i in range(count):
		var card = cards[i]
		var slot = formation[i]
		
		# Normalized position -> Screen position
		# pos = offset + (normalized * scaled_size)
		var screen_x = offset_x + (slot.nx * scaled_w)
		var screen_y = offset_y + (slot.ny * scaled_h)
		
		# Calculate Scale to match editor visual (Screen Relative)
		# We use width relative to viewport width
		var target_w = 0.0
		
		if slot.has("size_norm"):
			# New path (from JSON)
			target_w = slot.size_norm * viewport_size.x
		elif slot.has("nw"):
			# Intermediate path
			target_w = slot.nw * viewport_size.x
		else:
			# Legacy path
			var base_w = (viewport_size.x - 48.0) / 3.0
			target_w = base_w * slot.get("scale", 1.0)
			
		var ref_size = card.size
		if ref_size.x <= 0: ref_size = Vector2(750, 1050)
		
		# Calculate scale based on width
		var final_card_scale = target_w / ref_size.x
		
		card.scale = Vector2(final_card_scale, final_card_scale)
		
		# Center the card on the target position
		var card_size = card.size
		card.position = Vector2(screen_x, screen_y) - (card_size * final_card_scale / 2.0)
		
		# Z-index
		card.z_index = i # Simple index based z-ordering
		if slot.has("scale"): # Legacy
			card.z_index = int(slot.scale * 10)

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
