extends Control
class_name AnimapPlayer

signal animap_loaded(slug: String)
signal state_changed(state_id: String)

const LAYER_SHADER := preload("res://shaders/animap_layer.gdshader")
const VOLKHOV_FONT := preload("res://fonts/Volkhov-Regular.ttf")
const MAX_MASK_TEXTURES := 4
const LOOP_SWAP_MARGIN := 0.05

@onready var layer_root: Control = $LayerRoot

var animap_slug: String = ""
var animap_data: Dictionary = {}
var current_state_id: String = AnimapLoader.DEFAULT_STATE_ID

var _layer_nodes: Dictionary = {}
var _layer_materials: Dictionary = {}
var _video_layers: Dictionary = {}
var _transition_tween: Tween = null

## "cover" scales by height (may overflow width), "contain"/"stretch" fit content to bounds, "none" positions without scaling
var fit_mode: String = "cover":
	set(value):
		fit_mode = value
		_layout_layers()

## Horizontal pan position: 0.0 = left edge, 0.5 = centered, 1.0 = right edge
var pan_x: float = 0.5:
	set(value):
		pan_x = value
		_layout_layers()

func _ready() -> void:
	anchors_preset = PRESET_FULL_RECT
	layer_root.anchors_preset = PRESET_TOP_LEFT
	resized.connect(_layout_layers)

func _gui_input(event: InputEvent) -> void:
	pass

func _process(_delta: float) -> void:
	for layer_id in _video_layers.keys():
		var video_state: Dictionary = _video_layers[layer_id]
		var active: VideoStreamPlayer = video_state.get("active")
		if active == null:
			continue

		var layer: Dictionary = video_state.get("layer", {})
		if layer.is_empty():
			continue

		var texture := active.get_video_texture()
		var node: Control = _layer_nodes.get(layer_id)
		if texture != null and node != null and texture.get_size().x > 0.0 and texture.get_size().y > 0.0:
			node.size = texture.get_size()
			active.size = texture.get_size()
			var sb: VideoStreamPlayer = video_state.get("standby")
			if sb != null:
				sb.size = texture.get_size()

		var loop_start := float(layer.get("loop_start", 0.0))
		var loop_end := float(layer.get("loop_end", 0.0))
		var loop_enabled := bool(layer.get("loop", true))

		if not loop_enabled:
			active.loop = false
			var stop_at := loop_end
			if stop_at <= 0.0:
				stop_at = active.get_stream_length()
			if stop_at > 0.0 and active.stream_position >= stop_at - 0.01:
				active.stream_position = stop_at
				active.paused = true
			continue

		var loop_end_eff := loop_end
		if loop_end_eff <= 0.0:
			loop_end_eff = active.get_stream_length()
		if loop_end_eff <= 0.0:
			continue

		var threshold := loop_end_eff - LOOP_SWAP_MARGIN
		if threshold <= loop_start:
			threshold = loop_end_eff

		if active.stream_position >= threshold:
			var standby: VideoStreamPlayer = video_state.get("standby")
			if standby != null:
				standby.visible = true
				standby.paused = false
				standby.play()
				active.visible = false
				active.paused = true
				active.stream_position = loop_start
				video_state["active"] = standby
				video_state["standby"] = active
				_video_layers[layer_id] = video_state
			else:
				active.stream_position = loop_start
				if not active.is_playing():
					active.play()

func load_animap(slug: String) -> void:
	animap_slug = slug
	# Try instance-level cache first (from preload_animap_async), then fall back to static load
	if _animap_loader != null and _animap_loader.is_cached(slug):
		animap_data = AnimapLoader.load_animap(slug)  # Uses cached version internally
	else:
		animap_data = AnimapLoader.load_animap(slug)
	current_state_id = AnimapLoader.DEFAULT_STATE_ID
	_clear_layers()
	_build_layers()
	_apply_state(current_state_id, false)
	_layout_layers()
	animap_loaded.emit(slug)

## Set the AnimapLoader instance to use for caching
var _animap_loader: AnimapLoader = null
func set_animap_loader(loader: AnimapLoader) -> void:
	_animap_loader = loader

func has_state(state_id: String) -> bool:
	return AnimapLoader.has_state(animap_data, state_id)

func get_available_states() -> PackedStringArray:
	return AnimapLoader.get_available_states(animap_data)

func get_state() -> String:
	return current_state_id

func set_state(state_id: String) -> void:
	if animap_data.is_empty():
		return

	var target_state := state_id
	if not has_state(target_state):
		push_warning("Animap state '%s' missing on '%s', falling back to default" % [state_id, animap_slug])
		target_state = AnimapLoader.DEFAULT_STATE_ID

	if current_state_id == target_state:
		return

	var transition := AnimapLoader.get_transition(animap_data, current_state_id, target_state)
	current_state_id = target_state
	_apply_state(target_state, transition.get("mode", "instant") != "instant", transition)
	state_changed.emit(current_state_id)

func _build_layers() -> void:
	var layers: Array = animap_data.get("layers", [])
	for raw_layer in layers:
		if not (raw_layer is Dictionary):
			continue

		var layer := raw_layer as Dictionary
		var layer_id := String(layer.get("id", ""))
		var layer_type := String(layer.get("type", ""))
		var node: Control = null

		match layer_type:
			"image":
				node = _create_image_layer(layer)
			"video":
				node = _create_video_layer(layer)
			"text":
				node = _create_text_layer(layer)
			"effekseer":
				node = _create_effekseer_layer(layer)
			"mask":
				continue
			_:
				push_warning("Animap layer type '%s' not supported for '%s/%s'" % [layer_type, animap_slug, layer_id])
				continue

		if node == null:
			continue

		node.name = layer_id
		node.mouse_filter = Control.MOUSE_FILTER_IGNORE
		layer_root.add_child(node)
		_layer_nodes[layer_id] = node
		_layer_materials[layer_id] = _create_layer_material()

func _create_image_layer(layer: Dictionary) -> Control:
	var node := TextureRect.new()
	node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	node.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	node.position = Vector2.ZERO

	var texture_path := _resolve_media_path(String(layer.get("file", "")), false)
	if texture_path.is_empty():
		push_warning("Animap image missing for '%s/%s'" % [animap_slug, String(layer.get("id", ""))])
		return node

	if ResourceLoader.exists(texture_path):
		node.texture = load(texture_path)
		if node.texture != null:
			var lw := float(layer.get("width", 0))
			var lh := float(layer.get("height", 0))
			if lw > 0.0 and lh > 0.0:
				node.size = Vector2(lw, lh)
			else:
				node.size = node.texture.get_size()

	return node

func _create_video_layer(layer: Dictionary) -> Control:
	var stream_path := _resolve_media_path(String(layer.get("file", "")), true)
	if stream_path.is_empty() or not ResourceLoader.exists(stream_path):
		push_warning("Animap video missing or unsupported for '%s/%s'" % [animap_slug, String(layer.get("id", ""))])
		return null

	var stream: VideoStream = load(stream_path)
	if stream == null:
		push_warning("Animap video failed to load: %s" % stream_path)
		return null

	var container := Control.new()
	container.position = Vector2.ZERO

	var player_a := _make_video_player(stream)
	var player_b := _make_video_player(stream.duplicate())
	player_b.visible = false
	player_b.autoplay = false

	container.add_child(player_a)
	container.add_child(player_b)

	var layer_id := String(layer.get("id", ""))
	_video_layers[layer_id] = {
		"active": player_a,
		"standby": player_b,
		"layer": layer.duplicate(true),
	}

	return container

func _create_text_layer(layer: Dictionary) -> Control:
	var node := Label.new()
	node.position = Vector2.ZERO
	node.clip_contents = false
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.size = Vector2(float(layer.get("width", 480.0)), float(layer.get("height", 160.0)))
	node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	node.text = String(layer.get("text", layer.get("name", "")))
	node.add_theme_font_override("font", VOLKHOV_FONT)
	node.add_theme_font_size_override("font_size", int(layer.get("font_size", 96)))
	node.add_theme_color_override("font_color", Color.from_string(String(layer.get("color", "#ffffff")), Color.WHITE))
	node.horizontal_alignment = _resolve_text_alignment(String(layer.get("text_align", "left")))
	node.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	return node

func _create_effekseer_layer(layer: Dictionary) -> Control:
	# Effekseer layers are controlled separately - we create a Control container
	# The actual EffekseerEmitter2D is managed via the layer's effect file
	var container := Control.new()
	container.position = Vector2.ZERO
	container.size = Vector2(128, 128)  # Default size, actual scale controlled by animap layer

	var effect_file := String(layer.get("file", ""))
	if effect_file.is_empty():
		push_warning("Animap effekseer missing effect file for '%s/%s'" % [animap_slug, String(layer.get("id", ""))])
		return container

	# Check if EffekseerEmitter2D is available
	if not ClassDB.can_instantiate("EffekseerEmitter2D"):
		push_warning("Animap effekseer: EffekseerEmitter2D not available for '%s/%s'" % [animap_slug, String(layer.get("id", ""))])
		return container

	# Resolve effect path
	var effect_path := _resolve_effekseer_path(effect_file)
	if effect_path.is_empty():
		push_warning("Animap effekseer: could not resolve effect path for '%s'" % effect_file)
		return container

	if not ResourceLoader.exists(effect_path):
		push_warning("Animap effekseer: effect file not found at '%s'" % effect_path)
		return container

	# Create and configure the emitter
	var emitter = ClassDB.instantiate("EffekseerEmitter2D")
	if emitter == null:
		push_warning("Animap effekseer: failed to instantiate EffekseerEmitter2D")
		return container

	emitter.name = "EffekseerEmitter"
	var effect_res: Resource = load(effect_path)
	if effect_res == null:
		push_warning("Animap effekseer: failed to load effect resource '%s'" % effect_path)
		emitter.queue_free()
		return container

	emitter.effect = effect_res

	# Position at center of container (relative to parent)
	emitter.position = container.size / 2.0

	# Apply scale from layer config
	var layer_scale: float = float(layer.get("scale", 1.0))
	emitter.scale = Vector2.ONE * layer_scale

	# Track the emitter for state changes
	var layer_id := String(layer.get("id", ""))
	if not _effekseer_layers.has(layer_id):
		_effekseer_layers[layer_id] = {}
	_effekseer_layers[layer_id]["emitter"] = emitter
	_effekseer_layers[layer_id]["layer"] = layer.duplicate(true)

	container.add_child(emitter)

	# Auto-play if visible
	if bool(layer.get("visible", true)):
		emitter.play()

	return container

func _resolve_effekseer_path(file_name: String) -> String:
	if file_name.is_empty():
		return ""
	# Effekseer effects can be .efkefc or other Effekseer formats
	var candidates: Array[String] = []
	candidates.append("res://data/animap/%s/%s" % [animap_slug, file_name])
	# Also check VFX subdirectory
	candidates.append("res://data/animap/%s/VFX/%s" % [animap_slug, file_name])
	candidates.append("res://data/action/%s/VFX/%s" % [animap_slug, file_name])
	candidates.append("res://data/hero/%s/VFX/%s" % [animap_slug, file_name])

	for path in candidates:
		if ResourceLoader.exists(path):
			return path
	return ""

var _effekseer_layers: Dictionary = {}

func _make_video_player(stream: VideoStream) -> VideoStreamPlayer:
	var p := VideoStreamPlayer.new()
	p.expand = true
	p.autoplay = true
	p.loop = true
	p.position = Vector2.ZERO
	p.stream = stream
	p.use_parent_material = true
	return p

func _apply_state(state_id: String, animate: bool, transition: Dictionary = {}) -> void:
	if _transition_tween and _transition_tween.is_valid():
		_transition_tween.kill()
		_transition_tween = null

	var effective_layers := AnimapLoader.get_effective_layers(animap_data, state_id)
	var mask_map := _build_mask_map(effective_layers)

	if animate:
		_transition_tween = create_tween()
		_transition_tween.set_parallel(true)
		_transition_tween.set_ease(Tween.EASE_IN_OUT)
		_transition_tween.set_trans(Tween.TRANS_CUBIC)

	for layer in effective_layers:
		var layer_id := String(layer.get("id", ""))
		if not _layer_nodes.has(layer_id):
			continue

		var node: Control = _layer_nodes[layer_id]
		var material: ShaderMaterial = _layer_materials.get(layer_id)
		node.material = material

		_apply_layer_static(node, layer)
		_apply_layer_shader(material, layer, mask_map.get(layer_id, []))
		_apply_video_state(layer)
		_apply_effekseer_state(layer)

		if animate and _transition_tween:
			var duration: float = maxf(float(transition.get("duration_ms", 0)) / 1000.0, 0.0)
			if duration <= 0.0:
				_apply_layer_numeric(node, layer)
			else:
				_transition_tween.tween_property(node, "position", Vector2(float(layer.get("x", 0)), float(layer.get("y", 0))), duration)
				_transition_tween.tween_property(node, "scale", Vector2.ONE * float(layer.get("scale", 1.0)), duration)
				_transition_tween.tween_property(node, "modulate:a", float(layer.get("opacity", 1.0)), duration)
		else:
			_apply_layer_numeric(node, layer)

func _apply_layer_static(node: Control, layer: Dictionary) -> void:
	node.visible = bool(layer.get("visible", true))
	if node is TextureRect:
		var texture_node := node as TextureRect
		if texture_node.texture != null:
			var lw := float(layer.get("width", 0))
			var lh := float(layer.get("height", 0))
			if lw > 0.0 and lh > 0.0:
				texture_node.size = Vector2(lw, lh)
			else:
				texture_node.size = texture_node.texture.get_size()
	elif node is Label:
		var label_node := node as Label
		label_node.size = Vector2(float(layer.get("width", 480.0)), float(layer.get("height", 160.0)))
		label_node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label_node.text = String(layer.get("text", layer.get("name", "")))
		label_node.add_theme_font_override("font", VOLKHOV_FONT)
		label_node.add_theme_font_size_override("font_size", int(layer.get("font_size", 96)))
		label_node.add_theme_color_override("font_color", Color.from_string(String(layer.get("color", "#ffffff")), Color.WHITE))
		label_node.horizontal_alignment = _resolve_text_alignment(String(layer.get("text_align", "left")))
		label_node.vertical_alignment = VERTICAL_ALIGNMENT_CENTER

func _apply_layer_numeric(node: Control, layer: Dictionary) -> void:
	node.position = Vector2(float(layer.get("x", 0)), float(layer.get("y", 0)))
	node.scale = Vector2.ONE * float(layer.get("scale", 1.0))
	var modulate_color := node.modulate
	modulate_color.a = float(layer.get("opacity", 1.0))
	node.modulate = modulate_color

func _apply_video_state(layer: Dictionary) -> void:
	var layer_id := String(layer.get("id", ""))
	if not _video_layers.has(layer_id):
		return

	var video_state: Dictionary = _video_layers[layer_id]
	video_state["layer"] = layer.duplicate(true)
	_video_layers[layer_id] = video_state

	var active: VideoStreamPlayer = video_state.get("active")
	if active == null:
		return

	var loop_start := float(layer.get("loop_start", 0.0))
	if loop_start > 0.0 and active.stream_position < loop_start:
		active.stream_position = loop_start

	var visible := bool(layer.get("visible", true))
	active.paused = not visible
	if visible and not active.is_playing():
		active.play()

	var standby: VideoStreamPlayer = video_state.get("standby")
	if standby != null:
		standby.visible = false
		standby.paused = true
		standby.stream_position = loop_start

func _apply_effekseer_state(layer: Dictionary) -> void:
	var layer_id := String(layer.get("id", ""))
	if not _effekseer_layers.has(layer_id):
		return

	var effekseer_state: Dictionary = _effekseer_layers[layer_id]
	var emitter = effekseer_state.get("emitter")
	if emitter == null:
		return

	# Update stored layer config
	effekseer_state["layer"] = layer.duplicate(true)
	_effekseer_layers[layer_id] = effekseer_state

	# Update emitter scale
	var layer_scale: float = float(layer.get("scale", 1.0))
	emitter.scale = Vector2.ONE * layer_scale

	# Handle visibility - play/pause based on visible state
	var visible := bool(layer.get("visible", true))
	if visible:
		# If not currently playing, start playing
		if not emitter.is_playing():
			emitter.play()
	else:
		# Stop the effect when not visible
		if emitter.is_playing():
			emitter.stop()

func _apply_layer_shader(material: ShaderMaterial, layer: Dictionary, mask_textures: Array) -> void:
	material.set_shader_parameter("animap_size", Vector2(float(animap_data.get("width", 0)), float(animap_data.get("height", 0))))
	material.set_shader_parameter("layer_position", Vector2(float(layer.get("x", 0)), float(layer.get("y", 0))))
	material.set_shader_parameter("layer_scale", float(layer.get("scale", 1.0)))
	material.set_shader_parameter("hue_degrees", float(layer.get("hue", 0.0)))
	material.set_shader_parameter("saturation_pct", float(layer.get("saturation", 100.0)))
	material.set_shader_parameter("lightness_pct", float(layer.get("lightness", 100.0)))
	material.set_shader_parameter("brightness_pct", float(layer.get("brightness", 100.0)))
	material.set_shader_parameter("contrast_pct", float(layer.get("contrast", 100.0)))
	material.set_shader_parameter("mask_count", min(mask_textures.size(), MAX_MASK_TEXTURES))

	for i in range(MAX_MASK_TEXTURES):
		var texture: Texture2D = null
		if i < mask_textures.size():
			texture = mask_textures[i]
		material.set_shader_parameter("mask_tex_%d" % i, texture)

func _build_mask_map(effective_layers: Array[Dictionary]) -> Dictionary:
	var result := {}
	for layer in effective_layers:
		if String(layer.get("type", "")) != "mask":
			continue
		if not bool(layer.get("visible", true)):
			continue

		var texture_path := _resolve_media_path(String(layer.get("file", "")), false)
		if texture_path.is_empty() or not ResourceLoader.exists(texture_path):
			continue

		var texture := load(texture_path)
		if not (texture is Texture2D):
			continue

		var targets: Array = layer.get("targets", [])
		for target in targets:
			var target_id := String(target)
			if not result.has(target_id):
				result[target_id] = []
			if result[target_id].size() < MAX_MASK_TEXTURES:
				result[target_id].append(texture)
			else:
				push_warning("Animap '%s' target '%s' exceeds max mask count %d" % [animap_slug, target_id, MAX_MASK_TEXTURES])
	return result

func _create_layer_material() -> ShaderMaterial:
	var material := ShaderMaterial.new()
	material.shader = LAYER_SHADER
	return material

func _resolve_media_path(file_name: String, prefer_ogv: bool) -> String:
	if file_name.is_empty():
		return ""

	var candidates: Array[String] = []
	if prefer_ogv:
		var base := file_name.get_basename()
		candidates.append("res://data/animap/%s/%s.ogv" % [animap_slug, base])
		candidates.append("res://data/animap/%s/%s.webm" % [animap_slug, base])
		var ext := file_name.get_extension().to_lower()
		if ext == "ogv" or ext == "webm":
			candidates.append("res://data/animap/%s/%s" % [animap_slug, file_name])
	else:
		candidates.append("res://data/animap/%s/%s" % [animap_slug, file_name])

	for path in candidates:
		if ResourceLoader.exists(path):
			return path
	return ""

func _get_content_bounds() -> Rect2:
	var bounds := Rect2()
	var first := true
	for layer_id in _layer_nodes:
		var node: Control = _layer_nodes[layer_id]
		if not node.visible:
			continue
		var layer_rect := Rect2(node.position, node.size * node.scale.x)
		if first:
			bounds = layer_rect
			first = false
		else:
			bounds = bounds.merge(layer_rect)
	return bounds

func _layout_layers() -> void:
	if animap_data.is_empty():
		return

	var animap_width := float(animap_data.get("width", 0))
	var animap_height := float(animap_data.get("height", 0))
	if animap_width <= 0.0 or animap_height <= 0.0:
		return

	var viewport_size := size
	if viewport_size.y <= 0.0:
		return

	layer_root.size = Vector2(animap_width, animap_height)

	if fit_mode == "stretch" or fit_mode == "contain":
		var content := _get_content_bounds()
		if content.size.x > 0 and content.size.y > 0:
			if fit_mode == "stretch":
				var sx := viewport_size.x / content.size.x
				var sy := viewport_size.y / content.size.y
				layer_root.scale = Vector2(sx, sy)
				layer_root.position = -content.position * Vector2(sx, sy)
			else:
				var sf := minf(viewport_size.x / content.size.x, viewport_size.y / content.size.y)
				var scaled_size := content.size * sf
				var offset := (viewport_size - scaled_size) * 0.5
				layer_root.scale = Vector2.ONE * sf
				layer_root.position = offset - content.position * sf
			return
	elif fit_mode == "none":
		# Position layer_root at top-left corner, no scaling
		layer_root.scale = Vector2.ONE
		layer_root.position = Vector2.ZERO
		return

	# cover mode (default)
	var scale_factor := viewport_size.y / animap_height
	var excess_x := animap_width * scale_factor - viewport_size.x
	layer_root.position = Vector2(-pan_x * excess_x, (viewport_size.y - animap_height * scale_factor) * 0.5)
	layer_root.scale = Vector2.ONE * scale_factor

func _clear_layers() -> void:
	for child in layer_root.get_children():
		child.queue_free()
	_layer_nodes.clear()
	_layer_materials.clear()
	_video_layers.clear()
	_effekseer_layers.clear()

func _resolve_text_alignment(value: String) -> HorizontalAlignment:
	match value:
		"center":
			return HORIZONTAL_ALIGNMENT_CENTER
		"right":
			return HORIZONTAL_ALIGNMENT_RIGHT
		_:
			return HORIZONTAL_ALIGNMENT_LEFT
