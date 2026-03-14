extends Control

const HOME_SCENE := "res://scenes/Home.tscn"

var _client: GameServerClient

@onready var name_edit: LineEdit = $SafeArea/Panel/Margin/Content/NameEdit
@onready var status_label: Label = $SafeArea/Panel/Margin/Content/StatusLabel
@onready var back_button: Button = $SafeArea/Panel/Margin/Content/ButtonRow/BackButton
@onready var save_button: Button = $SafeArea/Panel/Margin/Content/ButtonRow/SaveButton

func _ready() -> void:
	_client = FlowState.client
	_client.load_session()
	if not _client.display_name.strip_edges().is_empty():
		FlowState.display_name = _client.display_name
		get_tree().change_scene_to_file(HOME_SCENE)
		return

	name_edit.text = FlowState.display_name
	back_button.visible = not FlowState.display_name.strip_edges().is_empty()
	save_button.disabled = true

	_client.connected_to_server.connect(_on_connected)
	_client.profile_updated.connect(_on_profile_updated)
	_client.error_received.connect(_on_error_received)
	_client.disconnected_from_server.connect(_on_disconnected)

	name_edit.text_changed.connect(_on_name_changed)
	_update_status("Connecting to server...")
	_client.connect_to_server()

func _on_connected(_player_id: String) -> void:
	save_button.disabled = name_edit.text.strip_edges().is_empty()
	_update_status("Connected. Account slot %d ready." % FlowState.session_slot)

func _on_profile_updated(profile: Dictionary) -> void:
	var display_name := str(profile.get("display_name", "")).strip_edges()
	if display_name.is_empty():
		_update_status("Profile save failed.")
		return
	FlowState.display_name = display_name
	_update_status("Profile saved. Returning home...")
	get_tree().change_scene_to_file(HOME_SCENE)

func _on_error_received(_code: String, message: String) -> void:
	save_button.disabled = false
	_update_status(message if not message.is_empty() else "Could not save profile.")

func _on_disconnected() -> void:
	save_button.disabled = true
	_update_status("Connection lost. Retrying...")
	_client.connect_to_server()

func _on_name_changed(new_text: String) -> void:
	save_button.disabled = new_text.strip_edges().is_empty() or not _client.connected

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file(HOME_SCENE)

func _on_save_pressed() -> void:
	var display_name := name_edit.text.strip_edges()
	if display_name.is_empty():
		_update_status("Enter a pilot name.")
		return
	save_button.disabled = true
	_update_status("Saving profile...")
	_client.register_profile(display_name)

func _update_status(message: String) -> void:
	status_label.text = message
