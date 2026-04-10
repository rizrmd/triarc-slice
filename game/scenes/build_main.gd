extends SceneTree
## Scene builder — run: godot --headless --script scenes/build_main.gd

func _initialize() -> void:
	print("Generating: Main scene with panning video background")

	var root = Control.new()
	root.name = "Main"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.set_script(load("res://scripts/main.gd"))

	# Clip container — full rect, clips video overflow
	var clip = Control.new()
	clip.name = "VideoClip"
	clip.set_anchors_preset(Control.PRESET_FULL_RECT)
	clip.clip_contents = true
	root.add_child(clip)

	# VideoStreamPlayer — 1920x1920 (square video at full viewport height)
	var video = VideoStreamPlayer.new()
	video.name = "VideoBackground"
	video.stream = load("res://assets/ui/main.ogv")
	video.autoplay = true
	video.loop = true
	video.expand = true
	# Position at (0,0), size 1920x1920 — wider than viewport
	video.position = Vector2(0, 0)
	video.size = Vector2(1920, 1920)
	clip.add_child(video)

	# --- Login UI ---
	var login_ui = Control.new()
	login_ui.name = "LoginUI"
	login_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(login_ui)

	var login_title = Label.new()
	login_title.name = "TitleLabel"
	login_title.text = "VanGambit"
	login_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	login_title.set_anchors_preset(Control.PRESET_CENTER_TOP)
	login_title.position = Vector2(-100, 400)
	login_title.size = Vector2(200, 60)
	login_title.add_theme_font_size_override("font_size", 48)
	login_ui.add_child(login_title)

	var login_btn = Button.new()
	login_btn.name = "LoginButton"
	login_btn.text = "Sign in with Google"
	login_btn.set_anchors_preset(Control.PRESET_CENTER)
	login_btn.position = Vector2(-150, 100)
	login_btn.size = Vector2(300, 60)
	login_btn.add_theme_font_size_override("font_size", 28)
	login_ui.add_child(login_btn)

	var status_label = Label.new()
	status_label.name = "StatusLabel"
	status_label.text = ""
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.set_anchors_preset(Control.PRESET_CENTER)
	status_label.position = Vector2(-150, 180)
	status_label.size = Vector2(300, 40)
	status_label.add_theme_font_size_override("font_size", 20)
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
	home_title.position = Vector2(-100, 400)
	home_title.size = Vector2(200, 60)
	home_title.add_theme_font_size_override("font_size", 48)
	home_ui.add_child(home_title)

	var find_match_btn = Button.new()
	find_match_btn.name = "FindMatchButton"
	find_match_btn.text = "Find Match"
	find_match_btn.set_anchors_preset(Control.PRESET_CENTER)
	find_match_btn.position = Vector2(-100, 50)
	find_match_btn.size = Vector2(200, 60)
	find_match_btn.add_theme_font_size_override("font_size", 28)
	home_ui.add_child(find_match_btn)

	var logout_btn = Button.new()
	logout_btn.name = "LogoutButton"
	logout_btn.text = "Logout"
	logout_btn.set_anchors_preset(Control.PRESET_CENTER)
	logout_btn.position = Vector2(-100, 150)
	logout_btn.size = Vector2(200, 60)
	logout_btn.add_theme_font_size_override("font_size", 28)
	home_ui.add_child(logout_btn)

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
