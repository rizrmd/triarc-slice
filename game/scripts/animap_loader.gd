extends RefCounted
class_name AnimapLoader

const DEFAULT_STATE_ID := "default"

static func load_animap(slug: String) -> Dictionary:
	var path := "res://data/animap/%s/animap.json" % slug
	if not FileAccess.file_exists(path):
		push_warning("Animap not found: %s" % path)
		return {}

	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_warning("Failed to open animap: %s" % path)
		return {}

	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("Invalid animap JSON: %s" % path)
		return {}

	var data := parsed as Dictionary
	data["slug"] = slug
	data["states"] = _normalize_states(data)
	return data

static func get_available_states(animap_data: Dictionary) -> PackedStringArray:
	var result: PackedStringArray = []
	for state in animap_data.get("states", []):
		if state is Dictionary:
			result.append((state as Dictionary).get("id", ""))
	return result

static func has_state(animap_data: Dictionary, state_id: String) -> bool:
	return not get_state(animap_data, state_id).is_empty()

static func get_state(animap_data: Dictionary, state_id: String) -> Dictionary:
	for state in animap_data.get("states", []):
		if state is Dictionary and (state as Dictionary).get("id", "") == state_id:
			return (state as Dictionary).duplicate(true)
	return {}

static func get_effective_layers(animap_data: Dictionary, state_id: String) -> Array[Dictionary]:
	var layers: Array[Dictionary] = []
	var layer_list: Array = animap_data.get("layers", [])
	var target_state := get_state(animap_data, state_id)

	for raw_layer in layer_list:
		if raw_layer is Dictionary:
			var layer := (raw_layer as Dictionary).duplicate(true)
			var layer_id: String = layer.get("id", "")
			var overrides: Dictionary = target_state.get("layer_overrides", {}).get(layer_id, {})
			for key in overrides.keys():
				layer[key] = overrides[key]
			layers.append(layer)

	return layers

static func get_transition(animap_data: Dictionary, from_state_id: String, to_state_id: String) -> Dictionary:
	var from_state := get_state(animap_data, from_state_id)
	if not from_state.is_empty():
		var transitions_to: Dictionary = from_state.get("transitions_to", {})
		if transitions_to.has(to_state_id):
			return _normalize_transition(transitions_to[to_state_id])

	var to_state := get_state(animap_data, to_state_id)
	if not to_state.is_empty():
		var transitions_from: Dictionary = to_state.get("transitions_from", {})
		if transitions_from.has(from_state_id):
			return _normalize_transition(transitions_from[from_state_id])

	return {"mode": "instant", "duration_ms": 0}

static func _normalize_states(animap_data: Dictionary) -> Array:
	var raw_states: Array = animap_data.get("states", [])
	var states: Array = []
	var has_default := false

	for raw_state in raw_states:
		if raw_state is Dictionary:
			var state := _normalize_state(raw_state as Dictionary)
			if state.get("id", "") == DEFAULT_STATE_ID:
				has_default = true
			states.append(state)

	if not has_default:
		states.push_front({
			"id": DEFAULT_STATE_ID,
			"name": "Default",
			"layer_overrides": {},
			"transitions_to": {},
			"transitions_from": {},
		})

	return states

static func _normalize_state(state: Dictionary) -> Dictionary:
	return {
		"id": state.get("id", DEFAULT_STATE_ID),
		"name": state.get("name", state.get("id", DEFAULT_STATE_ID)),
		"layer_overrides": state.get("layer_overrides", {}),
		"transitions_to": _normalize_transition_map(state.get("transitions_to", {})),
		"transitions_from": _normalize_transition_map(state.get("transitions_from", {})),
	}

static func _normalize_transition_map(input: Dictionary) -> Dictionary:
	var result := {}
	for key in input.keys():
		result[key] = _normalize_transition(input[key])
	return result

static func _normalize_transition(input: Variant) -> Dictionary:
	if input is Dictionary:
		return {
			"mode": (input as Dictionary).get("mode", "instant"),
			"duration_ms": int((input as Dictionary).get("duration_ms", 0)),
		}
	return {"mode": "instant", "duration_ms": 0}
