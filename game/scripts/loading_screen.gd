extends Control
## res://scripts/loading_screen.gd

@onready var video_player: VideoStreamPlayer = $VideoStreamPlayer

# Animap loader for background preloading
var _animap_loader: AnimapLoader = null

func _ready() -> void:
	_apply_layout()
	video_player.finished.connect(_on_video_finished)
	
	# Start preloading animaps in background while video plays
	_start_animap_preload()
	
	if video_player.stream:
		video_player.play()
	else:
		push_warning("No video stream loaded, skipping to main scene")
		_on_video_finished()

func _start_animap_preload() -> void:
	# Only create if not already available (e.g., returning from another scene)
	if GameState.animap_loader == null:
		_animap_loader = AnimapLoader.new()
		# Preload the main animap in background - will be ready when transitioning to main scene
		_animap_loader.preload_animap_async("main")
	else:
		_animap_loader = GameState.animap_loader

func _apply_layout() -> void:
	var boxes = GameState.get_scene_boxes("startup")
	if not boxes.has("logo"):
		return

	var logo_data: Dictionary = boxes["logo"]
	var viewport_size = get_viewport().get_visible_rect().size
	var resolved = GameState.resolve_box(logo_data, viewport_size)
	var box_w: float = resolved["width"]
	var box_h: float = resolved["height"]

	# VideoStreamPlayer: expand + fill mode
	var fill: String = logo_data.get("fill", "contain")
	video_player.expand = true
	var final_w = box_w
	var final_h = box_h
	var video_ratio = 1.0
	var box_ratio = box_w / box_h
	match fill:
		"contain":
			if video_ratio > box_ratio:
				final_w = box_w
				final_h = box_w / video_ratio
			else:
				final_h = box_h
				final_w = box_h * video_ratio
		"cover":
			if video_ratio > box_ratio:
				final_h = box_h
				final_w = box_h * video_ratio
			else:
				final_w = box_w
				final_h = box_w / video_ratio
		"stretch":
			final_w = box_w
			final_h = box_h
		"none":
			video_player.expand = false
	video_player.size = Vector2(final_w, final_h)

	video_player.position = Vector2(
		float(resolved["x"]) + (box_w - final_w) / 2.0,
		float(resolved["y"]) + (box_h - final_h) / 2.0
	)

	if logo_data.has("asset"):
		var asset_path = "res://" + logo_data["asset"].lstrip("/")
		var stream = load(asset_path)
		if stream:
			video_player.stream = stream

func _on_video_finished() -> void:
	# Pass the loader to GameState so main scene can use it
	GameState.animap_loader = _animap_loader
	
	var tween = create_tween()
	tween.tween_property(video_player, "modulate:a", 0.0, 0.5)
	tween.tween_callback(func(): get_tree().change_scene_to_file("res://scenes/main.tscn"))
