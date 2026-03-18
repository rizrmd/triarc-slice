extends Control
## Hero Selection Screen - Pick 3 heroes before queuing

@onready var hero_grid: GridContainer = $HeroGrid
@onready var selected_container: HBoxContainer = $SelectedContainer
@onready var find_match_button: Button = $FindMatchButton
@onready var back_button: Button = $BackButton
@onready var status_label: Label = $StatusLabel

const HERO_BUTTON_SCENE = preload("res://scenes/hero_button.tscn")
const HERO_PREVIEW_SCENE = preload("res://scenes/hero_preview.tscn")

func _ready():
	_find_match_button.pressed.connect(_on_find_match_pressed)
	back_button.pressed.connect(_on_back_pressed)
	_populate_hero_grid()
	_update_ui()

func _populate_hero_grid():
	# Clear existing
	for child in hero_grid.get_children():
		child.queue_free()
	
	var hero_slugs = GameState.get_all_hero_slugs()
	for slug in hero_slugs:
		var hero_def = GameState.get_hero_def(slug)
		if hero_def.is_empty():
			continue
		
		var btn = Button.new()
		btn.custom_minimum_size = Vector2(200, 280)
		btn.toggle_mode = true
		btn.button_pressed = GameState.is_hero_selected(slug)
		
		# Vertical layout with icon and name
		var vbox = VBoxContainer.new()
		vbox.alignment = BoxContainer.ALIGNMENT_CENTER
		
		# Hero icon (pose-char-fg)
		var icon = TextureRect.new()
		icon.expand_mode = TextureRect.EXPAND_FIT_HEIGHT
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.custom_minimum_size = Vector2(180, 180)
		var texture_path = "res://data/hero/%s/img/pose-char-fg.webp" % slug
		if ResourceLoader.exists(texture_path):
			icon.texture = load(texture_path)
		vbox.add_child(icon)
		
		# Hero name
		var name_label = Label.new()
		name_label.text = hero_def.get("name", slug)
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		vbox.add_child(name_label)
		
		# Affinities (simplified - just show element color)
		var color_rect = ColorRect.new()
		color_rect.color = hero_def.get("tint", Color.WHITE)
		color_rect.custom_minimum_size = Vector2(180, 10)
		vbox.add_child(color_rect)
		
		btn.add_child(vbox)
		btn.pressed.connect(_on_hero_pressed.bind(slug, btn))
		hero_grid.add_child(btn)

func _on_hero_pressed(slug: String, btn: Button):
	var selected = GameState.select_hero(slug)
	btn.button_pressed = GameState.is_hero_selected(slug)
	
	if not selected and not btn.button_pressed:
		# Was deselected
		pass
	elif not selected:
		# Max heroes reached
		status_label.text = "Select exactly 3 heroes"
	
	_update_ui()

func _update_ui():
	# Update selected previews
	for child in selected_container.get_children():
		child.queue_free()
	
	for slug in GameState.selected_heroes:
		var hero_def = GameState.get_hero_def(slug)
		var preview = TextureRect.new()
		preview.expand_mode = TextureRect.EXPAND_FIT_HEIGHT
		preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		preview.custom_minimum_size = Vector2(100, 100)
		var texture_path = "res://data/hero/%s/img/pose-char-fg.webp" % slug
		if ResourceLoader.exists(texture_path):
			preview.texture = load(texture_path)
		selected_container.add_child(preview)
	
	# Enable/disable find match button
	find_match_button.disabled = not GameState.can_queue()
	
	if GameState.can_queue():
		status_label.text = "Ready to find match!"
	else:
		status_label.text = "Select %d more hero(es)" % (3 - GameState.selected_heroes.size())

func _on_find_match_pressed():
	if not GameState.can_queue():
		return
	
	# Send queue_matchmaking message
	GameState.send_json({
		"type": "queue_matchmaking",
		"hero_slug_1": GameState.selected_heroes[0],
		"hero_slug_2": GameState.selected_heroes[1],
		"hero_slug_3": GameState.selected_heroes[2]
	})
	
	# Transition to find match / searching screen
	get_tree().change_scene_to_file("res://scenes/find_match.tscn")

func _on_back_pressed():
	get_tree().change_scene_to_file("res://scenes/main.tscn")
