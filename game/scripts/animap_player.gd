extends Control
class_name AnimapPlayer

signal animap_loaded(slug: String)
signal state_changed(state_id: String)

const LAYER_SHADER := preload("res://shaders/animap_layer.gdshader")
const MAX_MASK_TEXTURES := 4

@onready var layer_root: Control = $LayerRoot

var animap_slug: String = ""
var animap_data: Dictionary = {}
var current_state_id: String = AnimapLoader.DEFAULT_STATE_ID

var _layer_nodes: Dictionary = {}
var _layer_materials: Dictionary = {}
var _video_layers: Dictionary = {}
var _transition_tween: Tween = null

func _ready() -> void:
	anchors_preset = PRESET_FULL_RECT
	layer_root.anchors_preset = PRESET_TOP_LEFT
	resized.connect(_layout_layers)

func _process(_delta: float) -> void:
	for layer_id in _video_layers.keys():
		var video_state: Dictionary = _video_layers[layer_id]
		var player: VideoStreamPlayer = video_state.get("player")
		if player == null:
			continue

		var layer: Dictionary = video_state.get("layer", {})
		if layer.is_empty():
			continue

		var texture := player.get_video_texture()
		var node: VideoStreamPlayer = _layer_nodes.get(layer_id)
		if texture != null and node != null and texture.get_size().x > 0.0 and texture.get_size().y > 0.0:
			node.size = texture.get_size()

		var loop_start := float(layer.get("loop_start", 0.0))
		var loop_end := float(layer.get("loop_end", 0.0))
		var loop_enabled := bool(layer.get("loop", true))
		if loop_end > 0.0 and player.stream_position >= loop_end:
			if loop_enabled:
				player.stream_position = loop_start
				if not player.is_playing():
					player.play()
			else:
				player.stream_position = loop_end
				player.paused = true

func load_animap(slug: String) -> void:
	animap_slug = slug
	animap_data = AnimapLoader.load_animap(slug)
	current_state_id = AnimapLoader.DEFAULT_STATE_ID
	_clear_layers()
	_build_layers()
	_apply_state(current_state_id, false)
	_layout_layers()
	animap_loaded.emit(slug)

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
	node.stretch_mode = TextureRect.STRETCH_KEEP_SIZE
	node.position = Vector2.ZERO

	var texture_path := _resolve_media_path(String(layer.get("file", "")), false)
	if texture_path.is_empty():
		push_warning("Animap image missing for '%s/%s'" % [animap_slug, String(layer.get("id", ""))])
		return node

	if ResourceLoader.exists(texture_path):
		node.texture = load(texture_path)
		if node.texture != null:
			node.size = node.texture.get_size()

	return node

func _create_video_layer(layer: Dictionary) -> Control:
	var stream_path := _resolve_media_path(String(layer.get("file", "")), true)
	if stream_path.is_empty() or not ResourceLoader.exists(stream_path):
		push_warning("Animap video missing or unsupported for '%s/%s'" % [animap_slug, String(layer.get("id", ""))])
		return null

	var node := VideoStreamPlayer.new()
	node.expand = true
	node.autoplay = false
	node.loop = false
	node.position = Vector2.ZERO
	node.stream = load(stream_path)
	if node.stream == null:
		push_warning("Animap video failed to load: %s" % stream_path)
		return null
	node.play()

	_video_layers[String(layer.get("id", ""))] = {
		"player": node,
		"layer": layer.duplicate(true),
	}

	return node

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

		if animate and _transition_tween:
			var duration := max(float(transition.get("duration_ms", 0)) / 1000.0, 0.0)
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
			texture_node.size = texture_node.texture.get_size()

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

	var player: VideoStreamPlayer = video_state.get("player")
	if player == null:
		return

	var loop_start := float(layer.get("loop_start", 0.0))
	if loop_start > 0.0 and player.stream_position < loop_start:
		player.stream_position = loop_start

	var loop_enabled := bool(layer.get("loop", true))
	var visible := bool(layer.get("visible", true))
	player.loop = loop_enabled and float(layer.get("loop_end", 0.0)) <= 0.0
	player.paused = not visible
	if visible:
		player.paused = false
	if visible and not player.is_playing():
		player.play()

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

	var scale_factor := viewport_size.y / animap_height
	layer_root.position = Vector2((viewport_size.x - animap_width * scale_factor) * 0.5, 0.0)
	layer_root.size = Vector2(animap_width, animap_height)
	layer_root.scale = Vector2.ONE * scale_factor

func _clear_layers() -> void:
	for child in layer_root.get_children():
		child.queue_free()
	_layer_nodes.clear()
	_layer_materials.clear()
	_video_layers.clear()
