extends Node
class_name LayoutManager

# Layout configuration for different scenes
# This could be moved to a JSON/Resource later
const SCENES = {
	"cave": {
		"bg_path": "res://assets/places/cave.webp",
		"bg_size": Vector2(1640, 2460),
		"fit_mode": "cover", # cover or contain
		"card_formations": {
			1: [
				{"nx": 0.50, "ny": 0.50, "scale": 1.0}
			],
			3: [
				{"nx": 0.34, "ny": 0.70, "scale": 1.0}, # Left
				{"nx": 0.50, "ny": 0.67, "scale": 1.1}, # Center (slightly larger/forward)
				{"nx": 0.66, "ny": 0.70, "scale": 1.0}  # Right
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

# Apply layout to a background node and a list of card nodes
static func apply_layout(scene_key: String, bg_node: TextureRect, cards: Array, viewport_size: Vector2):
	if not SCENES.has(scene_key):
		push_error("Scene key not found: " + scene_key)
		return

	var config = SCENES[scene_key]
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
		
		# Apply position (assuming card anchor is center, if not we adjust)
		# Card.gd usually centers content, but let's check if we need to offset by card size
		# If card anchor is top-left (default control), we shift by size/2
		# Let's assume we want the "feet" of the card at the Y position? 
		# Or the center of the card? 
		# Based on "below stairs", center seems safest for now, but usually feet is better for perspective.
		# Let's stick to center for simplicity first.
		
		# Base card scale: 1/3 of screen width (minus padding)
		var padding = 48.0
		var target_base_width = (viewport_size.x - padding) / 3.0
		
		# We need the unscaled card width to calculate the scale factor
		var ref_width = card.size.x
		if ref_width <= 0: ref_width = 750.0 # Fallback
		
		var card_base_scale = target_base_width / ref_width
		
		var scale_factor = card_base_scale * slot.scale
		card.scale = Vector2(scale_factor, scale_factor)
		
		# Center the card on the target position
		# Subtract half the scaled size to center the card at the target coordinates
		var card_size = card.size
		card.position = Vector2(screen_x, screen_y) - (card_size * scale_factor / 2.0)
		
		# Ensure Z-ordering (painters algorithm, center usually in front or based on Y)
		# For this specific cave formation, we want center in front
		# Simple heuristic: closer to bottom (higher Y) = front, but with manual override indices if needed
		# For now, just z_index based on scale (larger = closer)
		card.z_index = int(slot.scale * 10)
