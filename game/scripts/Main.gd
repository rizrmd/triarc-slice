extends Control

var card_scene = preload("res://scenes/Card.tscn")
var current_cards = []
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

	# 1. First is always Frost Queen if available, otherwise random
	var first_hero = "frost-queen"
	if not available_heroes.has(first_hero):
		first_hero = available_heroes[0]
		
	var card1 = create_card(first_hero)
	
	# 2. Pick 2 other random heroes
	var others = []
	for hero in available_heroes:
		if hero != first_hero:
			others.append(hero)
	
	others.shuffle()
	
	# Handle cases with fewer than 3 heroes total
	var cards = [card1]
	
	if others.size() >= 1:
		cards.append(create_card(others[0]))
	if others.size() >= 2:
		cards.append(create_card(others[1]))
	
	current_cards = cards

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
