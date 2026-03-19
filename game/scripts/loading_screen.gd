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
	var scale_factor = viewport_size.x / 1080.0
	var w: float = logo_data.get("width", 588)
	var h: float = logo_data.get("height", 571)
	var scaled_w = w * scale_factor
	var scaled_h = h * scale_factor

	# VideoStreamPlayer: expand + fill mode
	var fill: String = logo_data.get("fill", "contain")
	video_player.expand = true
	var final_w = scaled_w
	var final_h = scaled_h
	var video_ratio = 1.0
	var box_ratio = scaled_w / scaled_h
	match fill:
		"contain":
			if video_ratio > box_ratio:
				final_w = scaled_w
				final_h = scaled_w / video_ratio
			else:
				final_h = scaled_h
				final_w = scaled_h * video_ratio
		"cover":
			if video_ratio > box_ratio:
				final_h = scaled_h
				final_w = scaled_h * video_ratio
			else:
				final_w = scaled_w
				final_h = scaled_w / video_ratio
		"stretch":
			final_w = scaled_w
			final_h = scaled_h
		"none":
			video_player.expand = false
	video_player.size = Vector2(final_w, final_h)

	# Position using shared resolve_box (handles pivot + screen_relative)
	var r = GameState.resolve_box(logo_data, viewport_size)
	# Adjust for scaled size vs original box size
	var px = r["x"] - (final_w - r["width"]) / 2.0
	var py = r["y"] - (final_h - r["height"]) / 2.0
	video_player.position = Vector2(px, py)

	if logo_data.has("asset"):
		var asset_path = "res://" + logo_data["asset"].lstrip("/")
		var stream = load(asset_path)
		if stream:
			video_player.stream = stream

func _on_video_finished() -> void:
	get_tree().change_scene_to_file("res://scenes/main.tscn")
