extends RefCounted
class_name GameData

static func list_hero_slugs() -> Array[String]:
	var heroes: Array[String] = []
	_append_directory_names("res://data/hero", heroes)
	heroes.sort()
	return heroes

static func list_action_slugs() -> Array[String]:
	var actions: Array[String] = []
	_append_directory_names("res://data/action", actions)
	_append_directory_names(_external_data_root().path_join("action"), actions)
	actions.sort()
	return actions

static func load_hero_config(hero_slug: String) -> Dictionary:
	return _load_json_dict("res://data/hero/%s/hero.json" % hero_slug)

static func load_action_config(action_slug: String) -> Dictionary:
	var res_path := "res://data/action/%s/action.json" % action_slug
	if FileAccess.file_exists(res_path):
		return _load_json_dict(res_path)
	return _load_json_dict(_external_data_root().path_join("action").path_join(action_slug).path_join("action.json"))

static func load_action_texture(action_slug: String, relative_path: String) -> Texture2D:
	var res_path := "res://data/action/%s/%s" % [action_slug, relative_path]
	if ResourceLoader.exists(res_path):
		return load_texture(res_path)
	return load_texture(_external_data_root().path_join("action").path_join(action_slug).path_join(relative_path))

static func load_texture(path: String) -> Texture2D:
	if path.is_empty():
		return null
	if path.begins_with("res://"):
		if not ResourceLoader.exists(path):
			return null
		var resource := load(path)
		return resource if resource is Texture2D else null
	if not FileAccess.file_exists(path):
		return null
	var image := Image.new()
	var error := image.load(path)
	if error != OK:
		return null
	return ImageTexture.create_from_image(image)

static func _append_directory_names(path: String, destination: Array[String]) -> void:
	var dir := DirAccess.open(path)
	if dir == null:
		return
	dir.list_dir_begin()
	var entry := dir.get_next()
	while not entry.is_empty():
		if dir.current_is_dir() and not entry.begins_with(".") and not destination.has(entry):
			destination.append(entry)
		entry = dir.get_next()

static func _load_json_dict(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed := JSON.parse_string(file.get_as_text())
	return parsed if parsed is Dictionary else {}

static func _external_data_root() -> String:
	return ProjectSettings.globalize_path("res://").path_join("../data")
