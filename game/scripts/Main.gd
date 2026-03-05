extends Control

var card_scene = preload("res://scenes/Card.tscn")

func _ready():
	# Load cards
	var card1 = card_scene.instantiate()
	add_child(card1)
	card1.load_hero("arc-strider")
	
	var card2 = card_scene.instantiate()
	add_child(card2)
	card2.load_hero("dawn-priest")
	
	# Wait for frame to update size
	# Ideally we should use call_deferred to ensure sizes are calculated if there's any layout pass
	# But since Card.gd sets size directly on load, it should be fine.
	
	call_deferred("layout_cards", card1, card2)

func layout_cards(c1, c2):
	var viewport_size = get_viewport_rect().size
	var screen_w = viewport_size.x
	var screen_h = viewport_size.y
	var padding = 20
	var gap = 20
	
	# Assume same size for simplicity or take max width
	var card_w = max(c1.size.x, c2.size.x)
	var card_h = max(c1.size.y, c2.size.y)
	
	# Calculate scale
	# (width * scale * 2) + gap + (padding * 2) <= screen_w
	var available_w = screen_w - (padding * 2) - gap
	var scale_factor = available_w / (card_w * 2)
	
	# Limit scale to 1.0 (don't upscale pixel art too much if not needed, or maybe we want to fill?)
	# Let's keep it at 1.0 max for now to avoid blurriness if assets are small
	# But actually assets are usually large.
	if scale_factor > 1.0:
		scale_factor = 1.0
		
	# Apply scale
	c1.scale = Vector2(scale_factor, scale_factor)
	c2.scale = Vector2(scale_factor, scale_factor)
	
	# Center vertically and horizontally
	var final_w = card_w * scale_factor
	var final_h = card_h * scale_factor
	
	var total_w = (final_w * 2) + gap
	
	var start_x = (screen_w - total_w) / 2
	var start_y = (screen_h - final_h) / 2
	
	c1.position = Vector2(start_x, start_y)
	c2.position = Vector2(start_x + final_w + gap, start_y)

