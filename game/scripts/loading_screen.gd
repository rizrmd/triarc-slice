extends Control
## res://scripts/loading_screen.gd

@onready var video_player: VideoStreamPlayer = $VideoStreamPlayer

func _ready() -> void:
	_apply_layout()
	video_player.finished.connect(_on_video_finished)
	if video_player.stream:
		video_player.play()
	else:
		push_warning("No video stream loaded, skipping to main scene")
		_on_video_finished()

func _apply_layout() -> void:
	var boxes = GameState.get_scene_boxes("startup")
	if not boxes.has("logo"):
		return

	var logo_data: Dictionary = boxes["logo"]
	var viewport_size = get_viewport().get_visible_rect().size

	# Box size: use percentage of viewport if available, else scale from 1080-wide reference
	var box_w: float
	var box_h: float
	if logo_data.has("width_percent"):
		box_w = viewport_size.x * logo_data["width_percent"] / 100.0
	else:
		box_w = logo_data.get("width", 588) * (viewport_size.x / 1080.0)
	if logo_data.has("height_percent"):
		box_h = viewport_size.y * logo_data["height_percent"] / 100.0
	else:
		box_h = logo_data.get("height", 571) * (viewport_size.x / 1080.0)

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

	# Position: nx/ny are the center of the box relative to the viewport
	var cx: float
	var cy: float
	if logo_data.has("nx") and logo_data.has("ny"):
		cx = logo_data["nx"] * viewport_size.x
		cy = logo_data["ny"] * viewport_size.y
	else:
		cx = viewport_size.x / 2.0
		cy = viewport_size.y / 2.0
	video_player.position = Vector2(cx - final_w / 2.0, cy - final_h / 2.0)

	if logo_data.has("asset"):
		var asset_path = "res://" + logo_data["asset"].lstrip("/")
		var stream = load(asset_path)
		if stream:
			video_player.stream = stream

func _on_video_finished() -> void:
	var tween = create_tween()
	tween.tween_property(video_player, "modulate:a", 0.0, 0.5)
	tween.tween_callback(func(): get_tree().change_scene_to_file("res://scenes/main.tscn"))
