extends SceneTree
## Scene builder — run: timeout 60 godot --headless --script scenes/build_loading.gd

func _initialize() -> void:
	var root = Control.new()
	root.name = "Loading"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.set_script(load("res://scripts/loading_screen.gd"))

	# Black background
	var bg = ColorRect.new()
	bg.name = "Background"
	bg.color = Color.BLACK
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(bg)

	# Video player for logo
	var video = VideoStreamPlayer.new()
	video.name = "VideoStreamPlayer"
	video.autoplay = false
	root.add_child(video)

	_set_owners(root, root)
	var packed := PackedScene.new()
	packed.pack(root)
	ResourceSaver.save(packed, "res://scenes/loading.tscn")
	print("Saved: res://scenes/loading.tscn")
	quit(0)

func _set_owners(node: Node, owner: Node) -> void:
	for c in node.get_children():
		c.owner = owner
		if c.scene_file_path.is_empty():
			_set_owners(c, owner)
