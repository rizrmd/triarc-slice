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
	var file = FileAccess.open("res://data/game-layout.json", FileAccess.READ)
	if not file:
		push_warning("game-layout.json not found, using defaults")
		return

	var json = JSON.new()
	var err = json.parse(file.get_as_text())
	file.close()
	if err != OK:
		push_warning("Failed to parse game-layout.json")
		return

	var data: Dictionary = json.data
	var startup: Dictionary = data.get("scenes", {}).get("startup", {})
	var boxes: Dictionary = startup.get("boxes", {})

	var viewport_size = get_viewport().get_visible_rect().size
	var aspect = viewport_size.x / viewport_size.y
	var best_key = _find_best_breakpoint(boxes, aspect)
	if best_key.is_empty():
		return

	var layout: Dictionary = boxes[best_key]
	if layout.has("logo"):
		var logo_data: Dictionary = layout["logo"]
		var nx: float = logo_data.get("nx", 0.5)
		var ny: float = logo_data.get("ny", 0.5)
		var w: float = logo_data.get("width", 588)
		var h: float = logo_data.get("height", 571)

		var scale_factor = viewport_size.x / 1080.0
		var scaled_w = w * scale_factor
		var scaled_h = h * scale_factor

		# VideoStreamPlayer only has expand (bool), no stretch_mode.
		# With expand=true it stretches to fill its size rect.
		# We compute the actual video_player.size based on fill mode.
		var fill: String = logo_data.get("fill", "contain")
		video_player.expand = true
		# Default: just use box size (stretch)
		var final_w = scaled_w
		var final_h = scaled_h
		# For contain/cover we need the video's native aspect.
		# The ogv is square (4320x4320) but we handle any ratio generically.
		# We'll wait until first frame to know exact size; assume 1:1 for ogv.
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

		var pivot: String = logo_data.get("pivot", "center")
		var px = nx * viewport_size.x
		var py = ny * viewport_size.y
		match pivot:
			"center":
				px -= final_w / 2.0
				py -= final_h / 2.0
			"top-left":
				pass
			"top-right":
				px -= final_w
			"bottom-left":
				py -= final_h
			"bottom-right":
				px -= final_w
				py -= final_h
		video_player.position = Vector2(px, py)

		if logo_data.has("asset"):
			var asset_path = "res://" + logo_data["asset"].lstrip("/")
			var stream = load(asset_path)
			if stream:
				video_player.stream = stream

func _find_best_breakpoint(boxes: Dictionary, aspect: float) -> String:
	var best_key = ""
	var best_diff = INF
	for key in boxes.keys():
		var parts = key.split("-")
		if parts.size() == 2:
			var bw = float(parts[0])
			var bh = float(parts[1])
			var bp_aspect = bw / bh
			var diff = abs(aspect - bp_aspect)
			if diff < best_diff:
				best_diff = diff
				best_key = key
	return best_key

func _on_video_finished() -> void:
	get_tree().change_scene_to_file("res://scenes/main.tscn")
