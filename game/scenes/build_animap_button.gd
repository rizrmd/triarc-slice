extends SceneTree
## Scene builder — run: godot --headless --script scenes/build_animap_button.gd

func _initialize() -> void:
	print("Generating: AnimapButton scene")

	var root = Control.new()
	root.name = "AnimapButton"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.set_script(load("res://scripts/animap_button.gd"))

	# AnimapPlayer for rendering the button graphics
	var animap_player = AnimapPlayer.new()
	animap_player.name = "AnimapPlayer"
	animap_player.set_anchors_preset(Control.PRESET_FULL_RECT)
	animap_player.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(animap_player)

	# LayerRoot for animap layers
	var layer_root = Control.new()
	layer_root.name = "LayerRoot"
	layer_root.set_anchors_preset(Control.PRESET_TOP_LEFT)
	animap_player.add_child(layer_root)

	# Mouse capture - captures all mouse events and forwards to animap
	var mouse_capture = Control.new()
	mouse_capture.name = "MouseCapture"
	mouse_capture.set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_capture.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(mouse_capture)

	_set_owners(root, root)

	# Save
	var packed := PackedScene.new()
	var err := packed.pack(root)
	if err != OK:
		push_error("Pack failed: " + str(err))
		quit(1)
		return

	err = ResourceSaver.save(packed, "res://scenes/animap_button.tscn")
	if err != OK:
		push_error("Save failed: " + str(err))
		quit(1)
		return

	print("Saved: res://scenes/animap_button.tscn")
	quit(0)

func _set_owners(node: Node, owner: Node) -> void:
	for c in node.get_children():
		c.owner = owner
		if c.scene_file_path.is_empty():
			_set_owners(c, owner)
