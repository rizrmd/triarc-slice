extends SceneTree
## Scene builder — run: godot --headless --script scenes/build_main.gd

func _initialize() -> void:
	print("Generating: Main scene with AnimapPlayer background")

	var root = Control.new()
	root.name = "Main"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.set_script(load("res://scripts/main.gd"))

	# Animap container with clip - clips the video overflow when panning
	var animap_clip = Control.new()
	animap_clip.name = "AnimapClip"
	animap_clip.set_anchors_preset(Control.PRESET_FULL_RECT)
	animap_clip.clip_contents = true
	root.add_child(animap_clip)

	# AnimapPlayer inside the clip
	var animap_player = AnimapPlayer.new()
	animap_player.name = "AnimapPlayer"
	animap_player.set_anchors_preset(Control.PRESET_FULL_RECT)
	animap_clip.add_child(animap_player)

	# LayerRoot for animap layers
	var layer_root = Control.new()
	layer_root.name = "LayerRoot"
	layer_root.set_anchors_preset(Control.PRESET_TOP_LEFT)
	animap_player.add_child(layer_root)

	# Overlay for login screen darkening
	var overlay = ColorRect.new()
	overlay.name = "Overlay"
	overlay.color = Color(0, 0, 0, 0.3)
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.visible = true
	root.add_child(overlay)

	# FadeRect for scene transitions
	var fade_rect = ColorRect.new()
	fade_rect.name = "FadeRect"
	fade_rect.color = Color(0, 0, 0, 1.0)  # Start fully black
	fade_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	fade_rect.visible = true
	root.add_child(fade_rect)

	# --- Login UI ---
	var login_ui = Control.new()
	login_ui.name = "LoginUI"
	login_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(login_ui)

	var logo_container = Control.new()
	logo_container.name = "LogoContainer"
	logo_container.set_anchors_preset(Control.PRESET_CENTER_TOP)
	logo_container.position = Vector2(-150, 200)
	logo_container.size = Vector2(300, 150)
	login_ui.add_child(logo_container)

	var logo_animap = AnimapPlayer.new()
	logo_animap.name = "LogoAnimap"
	logo_animap.set_anchors_preset(Control.PRESET_FULL_RECT)
	logo_container.add_child(logo_animap)

	var logo_layer_root = Control.new()
	logo_layer_root.name = "LayerRoot"
	logo_layer_root.set_anchors_preset(Control.PRESET_TOP_LEFT)
	logo_animap.add_child(logo_layer_root)

	var sign_in_container = Control.new()
	sign_in_container.name = "SignInContainer"
	sign_in_container.set_anchors_preset(Control.PRESET_CENTER)
	sign_in_container.position = Vector2(-150, 50)
	sign_in_container.size = Vector2(300, 80)
	login_ui.add_child(sign_in_container)

	var sign_in_animap = AnimapPlayer.new()
	sign_in_animap.name = "SignInAnimap"
	sign_in_animap.set_anchors_preset(Control.PRESET_FULL_RECT)
	sign_in_container.add_child(sign_in_animap)

	var sign_in_layer_root = Control.new()
	sign_in_layer_root.name = "LayerRoot"
	sign_in_layer_root.set_anchors_preset(Control.PRESET_TOP_LEFT)
	sign_in_animap.add_child(sign_in_layer_root)

	var status_label = Label.new()
	status_label.name = "StatusLabel"
	status_label.text = ""
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.set_anchors_preset(Control.PRESET_CENTER)
	status_label.position = Vector2(-150, 150)
	status_label.size = Vector2(300, 60)
	status_label.add_theme_font_size_override("font_size", 26)
	login_ui.add_child(status_label)

	# --- Home UI ---
	var home_ui = Control.new()
	home_ui.name = "HomeUI"
	home_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	home_ui.visible = false
	root.add_child(home_ui)

	var home_title = Label.new()
	home_title.name = "TitleLabel"
	home_title.text = "Home"
	home_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	home_title.set_anchors_preset(Control.PRESET_CENTER_TOP)
	home_title.position = Vector2(-150, 100)
	home_title.size = Vector2(300, 60)
	home_title.add_theme_font_size_override("font_size", 48)
	home_ui.add_child(home_title)

	var find_match_btn = Button.new()
	find_match_btn.name = "FindMatchButton"
	find_match_btn.text = "Find Match"
	find_match_btn.set_anchors_preset(Control.PRESET_CENTER)
	find_match_btn.position = Vector2(-100, 200)
	find_match_btn.size = Vector2(200, 60)
	find_match_btn.add_theme_font_size_override("font_size", 28)
	home_ui.add_child(find_match_btn)

	var training_btn = Button.new()
	training_btn.name = "TrainingButton"
	training_btn.text = "Training"
	training_btn.set_anchors_preset(Control.PRESET_CENTER)
	training_btn.position = Vector2(-100, 280)
	training_btn.size = Vector2(200, 60)
	training_btn.add_theme_font_size_override("font_size", 28)
	home_ui.add_child(training_btn)

	var logout_btn = Button.new()
	logout_btn.name = "LogoutButton"
	logout_btn.text = "Logout"
	logout_btn.set_anchors_preset(Control.PRESET_CENTER)
	logout_btn.position = Vector2(-100, 360)
	logout_btn.size = Vector2(200, 60)
	logout_btn.add_theme_font_size_override("font_size", 28)
	home_ui.add_child(logout_btn)

	var test_vfx_btn = Button.new()
	test_vfx_btn.name = "TestVfxButton"
	test_vfx_btn.text = "Test VFX"
	test_vfx_btn.set_anchors_preset(Control.PRESET_CENTER)
	test_vfx_btn.position = Vector2(-100, 440)
	test_vfx_btn.size = Vector2(200, 60)
	test_vfx_btn.add_theme_font_size_override("font_size", 28)
	home_ui.add_child(test_vfx_btn)

	# --- Hero Select UI ---
	var hero_select_ui = preload("res://scenes/hero_select.tscn").instantiate()
	hero_select_ui.name = "HeroSelectUI"
	hero_select_ui.visible = false
	root.add_child(hero_select_ui)

	# --- Find Match UI ---
	var find_match_ui = Control.new()
	find_match_ui.name = "FindMatchUI"
	find_match_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	find_match_ui.visible = false
	root.add_child(find_match_ui)

	var fm_title = Label.new()
	fm_title.name = "TitleLabel"
	fm_title.text = "Find Match"
	fm_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	fm_title.set_anchors_preset(Control.PRESET_CENTER_TOP)
	fm_title.position = Vector2(-100, 400)
	fm_title.size = Vector2(200, 60)
	fm_title.add_theme_font_size_override("font_size", 48)
	find_match_ui.add_child(fm_title)

	var searching_label = Label.new()
	searching_label.name = "SearchingLabel"
	searching_label.text = "Searching..."
	searching_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	searching_label.set_anchors_preset(Control.PRESET_CENTER)
	searching_label.position = Vector2(-100, 0)
	searching_label.size = Vector2(200, 40)
	searching_label.add_theme_font_size_override("font_size", 28)
	find_match_ui.add_child(searching_label)

	var back_btn = Button.new()
	back_btn.name = "BackButton"
	back_btn.text = "Back"
	back_btn.set_anchors_preset(Control.PRESET_CENTER)
	back_btn.position = Vector2(-100, 150)
	back_btn.size = Vector2(200, 60)
	back_btn.add_theme_font_size_override("font_size", 28)
	find_match_ui.add_child(back_btn)

	# Set ownership chain
	_set_owners(root, root)

	# Save
	var packed := PackedScene.new()
	var err := packed.pack(root)
	if err != OK:
		push_error("Pack failed: " + str(err))
		quit(1)
		return

	err = ResourceSaver.save(packed, "res://scenes/main.tscn")
	if err != OK:
		push_error("Save failed: " + str(err))
		quit(1)
		return

	print("Saved: res://scenes/main.tscn")
	quit(0)

func _set_owners(node: Node, owner: Node) -> void:
	for c in node.get_children():
		c.owner = owner
		if c.scene_file_path.is_empty():
			_set_owners(c, owner)
