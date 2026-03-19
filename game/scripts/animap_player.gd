extends Control
class_name AnimapPlayer

signal animap_loaded(slug: String)
signal state_changed(state_id: String)

@onready var layer_root: Control = $LayerRoot

var animap_slug: String = ""
var animap_data: Dictionary = {}
var current_state_id: String = AnimapLoader.DEFAULT_STATE_ID
var _layer_nodes: Dictionary = {}
var _transition_tween: Tween = null

func _ready() -> void:
	anchors_preset = PRESET_FULL_RECT
	layer_root.anchors_preset = PRESET_TOP_LEFT
	resized.connect(_layout_layers)

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
		var layer_id := layer.get("id", "")
		var layer_type := layer.get("type", "")

		match layer_type:
			"image":
				var node := TextureRect.new()
				node.name = layer_id
				node.mouse_filter = Control.MOUSE_FILTER_IGNORE
				node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
				node.stretch_mode = TextureRect.STRETCH_KEEP_SIZE
				node.position = Vector2.ZERO
				var texture_path := "res://data/animap/%s/%s" % [animap_slug, layer.get("file", "")]
				if ResourceLoader.exists(texture_path):
					node.texture = load(texture_path)
				else:
					push_warning("Animap image missing: %s" % texture_path)
				layer_root.add_child(node)
				_layer_nodes[layer_id] = node
			_:
				push_warning("Animap layer type '%s' not supported yet for '%s/%s'" % [layer_type, animap_slug, layer_id])

func _apply_state(state_id: String, animate: bool, transition: Dictionary = {}) -> void:
	if _transition_tween and _transition_tween.is_valid():
		_transition_tween.kill()
		_transition_tween = null

	var effective_layers := AnimapLoader.get_effective_layers(animap_data, state_id)
	if animate:
		_transition_tween = create_tween()
		_transition_tween.set_parallel(true)
		_transition_tween.set_ease(Tween.EASE_IN_OUT)
		_transition_tween.set_trans(Tween.TRANS_CUBIC)

	for layer in effective_layers:
		var layer_id := layer.get("id", "")
		if not _layer_nodes.has(layer_id):
			continue
		var node: TextureRect = _layer_nodes[layer_id]
		_apply_layer_static(node, layer)
		if animate and _transition_tween:
			var duration := max(float(transition.get("duration_ms", 0)) / 1000.0, 0.0)
			if duration <= 0.0:
				_apply_layer_numeric(node, layer)
			else:
				_transition_tween.tween_property(node, "position", Vector2(layer.get("x", 0), layer.get("y", 0)), duration)
				_transition_tween.tween_property(node, "scale", Vector2.ONE * float(layer.get("scale", 1.0)), duration)
				_transition_tween.tween_property(node, "modulate:a", float(layer.get("opacity", 1.0)), duration)
		else:
			_apply_layer_numeric(node, layer)

func _apply_layer_static(node: TextureRect, layer: Dictionary) -> void:
	node.visible = layer.get("visible", true)
	if node.texture:
		node.size = node.texture.get_size()

func _apply_layer_numeric(node: TextureRect, layer: Dictionary) -> void:
	node.position = Vector2(layer.get("x", 0), layer.get("y", 0))
	node.scale = Vector2.ONE * float(layer.get("scale", 1.0))
	var modulate_color := node.modulate
	modulate_color.a = float(layer.get("opacity", 1.0))
	node.modulate = modulate_color

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
	layer_root.position = Vector2.ZERO
	layer_root.size = Vector2(animap_width, animap_height)
	layer_root.scale = Vector2.ONE * scale_factor

func _clear_layers() -> void:
	for child in layer_root.get_children():
		child.queue_free()
	_layer_nodes.clear()
