extends Control

var card_scene = preload("res://scenes/Card.tscn")
var current_cards = []

@onready var bg_texture = $Background # Requires TextureRect in scene

func _ready():
	# Load cards
	var card1 = create_card("frost-queen")
	
	current_cards = [card1]
	
	# Initial layout
	call_deferred("update_layout")
	
	# Connect to resize signal
	get_tree().root.size_changed.connect(update_layout)

func create_card(hero_slug):
	var card = card_scene.instantiate()
	add_child(card)
	card.load_hero(hero_slug)
	return card

func update_layout():
	var viewport_size = get_viewport_rect().size
	
	# Use LayoutManager to position background and cards
	# "cave" is our scene key, bg_texture is the TextureRect node
	LayoutManager.apply_layout("cave", bg_texture, current_cards, viewport_size)

# LayoutManager handles the complex positioning logic now


