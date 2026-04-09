extends Control
## Main screen with animap background and UI views (login, home, hero select, find match)
## Handles scene navigation, WebSocket communication, and Google Sign-In

signal view_changed(view_name: String)

# Node references
@onready var animap_player: AnimapPlayer = $AnimapClip/AnimapPlayer
@onready var login_ui: Control = $LoginUI
@onready var home_ui: Control = $HomeUI
@onready var hero_select_ui: Control = $HeroSelectUI
@onready var find_match_ui: Control = $FindMatchUI
@onready var logo_animap: AnimapPlayer = $LoginUI/LogoContainer/LogoAnimap
@onready var sign_in_button: AnimapButton = $LoginUI/SignInContainer/SignInButton
@onready var overlay: ColorRect = $Overlay
@onready var fade_rect: ColorRect = $FadeRect

# Current view state
var _current_view: String = "login"

# Overlay scenes (keep main scene alive for instant navigation)
var _overlay_scenes: Array = []

# Animap loader for caching
var _animap_loader: AnimapLoader = AnimapLoader.new()

# Google Sign-In
const WEB_CLIENT_ID := "12643923522-2oi6nt6clhbiav3r7kqgj27v00rm1nk6.apps.googleusercontent.com"
const SIGN_IN_URL := "https://sg.vangambit.com/sign-in/desktop"
var _google_sign_in: Object = null
var _is_signing_in: bool = false

# WebSocket
const SERVER_URL := "wss://sg.vangambit.com/ws"
var _ws: WebSocketPeer = null
var _player_id: String = ""
var _display_name: String = ""
var _id_token: String = ""
var _session_token: String = ""
var _reauth_attempted: bool = false

# Animap configuration
const MAIN_ANIMAP_SLUG := "main"
const VIEW_TO_ANIMAP_STATE := {
	"login": "login",
	"home": "home",
	"find_match": "find-match",
}
const VIEW_PAN_X := {
	"login": 0.0,
	"home": 0.35,
	"hero_select": 0.6,
	"find_match": 0.6,
}

func _ready() -> void:
	_init_animap_loader()
	_connect_button_signals()
	_connect_auth()
	_connect_visibility_handler()

	# Handle returning from gameplay
	if not GameState.player_id.is_empty():
		_player_id = GameState.player_id
		_display_name = GameState.display_name
		_id_token = GameState.id_token
		home_ui.get_node("TitleLabel").text = "Welcome, " + _display_name
		if GameState.ws and GameState.ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
			_ws = GameState.ws
		else:
			home_ui.get_node("TitleLabel").text = "Reconnecting..."
			_connect_to_server()
		var start_view := "hero_select" if GameState.should_return_to_hero_select() else "home"
		_show_view(start_view, false)
		_fade_in_from_black()
		return

	# Check for saved credentials
	var saved := _load_saved_credentials()
	if not saved.is_empty():
		_id_token = saved.get("id_token", "")
		_display_name = saved.get("display_name", "")
		_session_token = saved.get("session_token", "")
		login_ui.get_node("StatusLabel").text = "Connecting..."
		sign_in_button.visible = false
		_show_view("login", false)
		_fade_in_from_black()
		_connect_to_server()
		return

	_show_view("login", false)
	_fade_in_from_black()

func _init_animap_loader() -> void:
	if GameState.animap_loader != null:
		_animap_loader = GameState.animap_loader
	elif _animap_loader == null:
		_animap_loader = AnimapLoader.new()
		_animap_loader.preload_animap_async(MAIN_ANIMAP_SLUG)
	GameState.animap_loader = _animap_loader
	animap_player.set_animap_loader(_animap_loader)

func _connect_button_signals() -> void:
	home_ui.get_node("FindMatchButton").pressed.connect(_on_find_match_pressed)
	home_ui.get_node("TrainingButton").pressed.connect(_on_training_pressed)
	home_ui.get_node("LogoutButton").pressed.connect(_on_logout_pressed)
	home_ui.get_node("TestVfxButton").pressed.connect(_on_test_vfx_pressed)
	hero_select_ui.back_requested.connect(func(): _show_view("home"))
	hero_select_ui.find_match_requested.connect(func(): _show_view("find_match"))
	find_match_ui.get_node("BackButton").pressed.connect(_on_find_match_back_pressed)
	sign_in_button.pressed.connect(_on_sign_in_button_pressed)

	animap_player.load_animap(MAIN_ANIMAP_SLUG)
	logo_animap.load_animap("vg-logo")
	sign_in_button.load_animap("google-sign-in")

	_apply_login_layout()
	_apply_home_layout()

func _connect_auth() -> void:
	if Engine.has_singleton("GodotGoogleSignIn"):
		_google_sign_in = Engine.get_singleton("GodotGoogleSignIn")
		_google_sign_in.connect("sign_in_success", _on_sign_in_success)
		_google_sign_in.connect("sign_in_failed", _on_sign_in_failed)
		_google_sign_in.connect("sign_out_complete", _on_sign_out_complete)
		_google_sign_in.initialize(WEB_CLIENT_ID)
	else:
		var desktop_auth = preload("res://scripts/desktop_google_auth.gd").new()
		add_child(desktop_auth)
		desktop_auth.sign_in_success.connect(_on_sign_in_success)
		desktop_auth.sign_in_failed.connect(_on_sign_in_failed)
		desktop_auth.sign_out_complete.connect(_on_sign_out_complete)
		desktop_auth.initialize(SIGN_IN_URL)
		_google_sign_in = desktop_auth

func _connect_visibility_handler() -> void:
	get_tree().root.visibility_changed.connect(_on_visibility_changed)

func _fade_in_from_black() -> void:
	var tween := create_tween()
	tween.tween_property(fade_rect, "color:a", 0.0, 0.5)
	tween.tween_callback(func(): fade_rect.visible = false)

func _process(_delta: float) -> void:
	if not _ws:
		return
	_ws.poll()
	var state: WebSocketPeer.State = _ws.get_ready_state() as WebSocketPeer.State
	if state == WebSocketPeer.STATE_OPEN:
		while _ws and _ws.get_available_packet_count() > 0:
			var packet: PackedByteArray = _ws.get_packet()
			var msg: String = packet.get_string_from_utf8()
			_on_ws_message(msg)
	elif state == WebSocketPeer.STATE_CLOSED:
		_ws = null
		GameState.ws = null
		_on_ws_disconnected()

# --- WebSocket ---

func _connect_to_server() -> void:
	login_ui.get_node("StatusLabel").text = "Connecting..."
	sign_in_button.visible = false
	print("[DEBUG] _connect_to_server called at ", Time.get_ticks_msec())
	_ws = WebSocketPeer.new()
	var err := _ws.connect_to_url(SERVER_URL)
	if err != OK:
		_is_signing_in = false
		login_ui.get_node("StatusLabel").text = "Connection failed."
		sign_in_button.visible = true
		return
	_wait_for_connection()

func _wait_for_connection() -> void:
	var timer := get_tree().create_timer(0.1)
	timer.timeout.connect(_check_connection)

func _check_connection() -> void:
	if not _ws:
		return
	_ws.poll()
	match _ws.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			print("[DEBUG] STATE_OPEN at ", Time.get_ticks_msec())
			var auth_msg := {"type": "authenticate"}
			if not _session_token.is_empty():
				auth_msg["session_token"] = _session_token
			elif not _id_token.is_empty():
				auth_msg["id_token"] = _id_token
			_send_json(auth_msg)
		WebSocketPeer.STATE_CONNECTING:
			_wait_for_connection()
		_:
			print("[DEBUG] Connection failed state: ", _ws.get_ready_state(), " at ", Time.get_ticks_msec())
			_is_signing_in = false
			login_ui.get_node("StatusLabel").text = "Connection failed."
			sign_in_button.visible = true

func _send_json(data: Dictionary) -> void:
	if _ws and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		_ws.send_text(JSON.stringify(data))

func _on_ws_disconnected() -> void:
	match _current_view:
		"find_match":
			find_match_ui.get_node("SearchingLabel").text = "Connection lost."
			await get_tree().create_timer(1.5).timeout
			_show_view("home")
	if not _id_token.is_empty():
		home_ui.get_node("TitleLabel").text = "Reconnecting..."
		if _current_view != "home":
			_show_view("home")
		_connect_to_server()
	else:
		_show_view("login")
		login_ui.get_node("StatusLabel").text = "Connection lost. Please sign in."

func _on_ws_message(msg: String) -> void:
	var json := JSON.new()
	if json.parse(msg) != OK:
		return
	var data: Dictionary = json.data
	var msg_type := str(data.get("type", ""))

	# Forward to gameplay if overlay is active
	GameState.ws_message_received.emit(msg)

	match msg_type:
		"connected":
			pass
		"authenticated":
			print("[DEBUG] authenticated at ", Time.get_ticks_msec())
			_player_id = str(data.get("player_id", ""))
			_display_name = str(data.get("display_name", _display_name))
			var new_session: String = str(data.get("session_token", ""))
			if not new_session.is_empty():
				_session_token = new_session
			_reauth_attempted = false
			home_ui.get_node("TitleLabel").text = "Welcome, " + _display_name
			var email: String = str(data.get("email", ""))
			_save_credentials(_id_token, email, _display_name)
			GameState.player_id = _player_id
			GameState.display_name = _display_name
			GameState.id_token = _id_token
			GameState.ws = _ws
			_show_view("home")
		"auth_error":
			print("[DEBUG] auth_error at ", Time.get_ticks_msec(), " error: ", data.get("error", ""))
			if _ws:
				_ws.close()
				_ws = null
			if not _reauth_attempted and _google_sign_in:
				_reauth_attempted = true
				login_ui.get_node("StatusLabel").text = "Refreshing session..."
				_google_sign_in.signIn()
			else:
				_reauth_attempted = false
				_clear_saved_credentials()
				_id_token = ""
				_session_token = ""
				sign_in_button.visible = true
				login_ui.get_node("StatusLabel").text = "Session expired. Please sign in again."
				_show_view("login")
		"matchmaking_queued":
			find_match_ui.get_node("SearchingLabel").text = "Searching..."
		"match_found":
			GameState.current_match_id = data.get("match_id", "")
			GameState.current_team = data.get("team", 1)
			# Store previous view to return correctly after gameplay
			GameState.previous_view_before_gameplay = _current_view
			if _current_view == "find_match":
				find_match_ui.get_node("SearchingLabel").text = "Match found!"
				await get_tree().create_timer(1.0).timeout
			_add_overlay_scene("res://scenes/gameplay.tscn", "GameplayOverlay")

# --- Google Sign-In ---

func _on_sign_in_success(id_token: String, _email: String, display_name: String) -> void:
	print("[DEBUG] _on_sign_in_success at ", Time.get_ticks_msec(), " display_name: ", display_name)
	_is_signing_in = false
	_id_token = id_token
	_display_name = display_name
	_save_credentials(id_token, "", display_name)
	_connect_to_server()

func _on_sign_in_failed(error: String) -> void:
	print("[DEBUG] _on_sign_in_failed at ", Time.get_ticks_msec(), " error: ", error)
	_is_signing_in = false
	sign_in_button.visible = true
	if "No credentials" in error or "NoCredential" in error:
		login_ui.get_node("StatusLabel").text = "No Google account found.\nPlease add one in Settings."
		OS.shell_open("market://details?id=com.google.android.gms")
	else:
		login_ui.get_node("StatusLabel").text = "Sign-in failed. Try again."

func _on_sign_out_complete() -> void:
	_player_id = ""
	_id_token = ""
	_session_token = ""
	_display_name = ""
	_is_signing_in = false
	_clear_saved_credentials()
	if _ws:
		_ws.close()
		_ws = null

# --- View Management ---

func _show_view(view_name: String, animate: bool = true) -> void:
	_current_view = view_name
	_update_ui_visibility(view_name)
	_update_animap_state(view_name, animate)
	_update_overlay_visibility(view_name, animate)
	view_changed.emit(view_name)

func _update_ui_visibility(view_name: String) -> void:
	login_ui.visible = (view_name == "login")
	home_ui.visible = (view_name == "home")
	hero_select_ui.visible = (view_name == "hero_select")
	find_match_ui.visible = (view_name == "find_match")

func _update_animap_state(view_name: String, animate: bool) -> void:
	var state_id: String = VIEW_TO_ANIMAP_STATE.get(view_name, AnimapLoader.DEFAULT_STATE_ID)
	if animap_player.has_state(state_id):
		animap_player.set_state(state_id)
	elif animap_player.has_state(AnimapLoader.DEFAULT_STATE_ID):
		animap_player.set_state(AnimapLoader.DEFAULT_STATE_ID)

	var target_pan: float = VIEW_PAN_X.get(view_name, 0.0)
	if animate:
		var pan_tw := create_tween()
		pan_tw.set_ease(Tween.EASE_IN_OUT)
		pan_tw.set_trans(Tween.TRANS_CUBIC)
		pan_tw.tween_property(animap_player, "pan_x", target_pan, 0.5)
	else:
		animap_player.pan_x = target_pan

func _update_overlay_visibility(view_name: String, animate: bool) -> void:
	if view_name == "login":
		overlay.visible = true
		if animate:
			overlay.color.a = 0.0
			var tw := create_tween()
			tw.tween_property(overlay, "color:a", 0.3, 0.3)
		else:
			overlay.color.a = 0.3
	else:
		if animate:
			var tw := create_tween()
			tw.tween_property(overlay, "color:a", 0.0, 0.3)
			tw.tween_callback(func(): overlay.visible = false)
		else:
			overlay.visible = false

# --- Button Handlers ---

func _on_sign_in_button_pressed() -> void:
	_on_login_pressed()

func _on_login_pressed() -> void:
	if _is_signing_in:
		return
	_is_signing_in = true
	print("[DEBUG] _on_login_pressed at ", Time.get_ticks_msec())
	login_ui.get_node("StatusLabel").text = "Signing in..."
	sign_in_button.visible = false
	var saved := _load_saved_credentials()
	if not saved.is_empty():
		print("[DEBUG] Using saved credentials, session_token length: ", _session_token.length())
		_id_token = saved.get("id_token", "")
		_display_name = saved.get("display_name", "")
		_session_token = saved.get("session_token", "")
		_connect_to_server()
	else:
		print("[DEBUG] No saved credentials, opening Google sign-in")
		_google_sign_in.signIn()

func _on_find_match_pressed() -> void:
	GameState.match_mode = "matchmaking"
	_show_view("hero_select")

func _on_training_pressed() -> void:
	GameState.match_mode = "training"
	_show_view("hero_select")

func _on_find_match_back_pressed() -> void:
	_show_view("hero_select")

func _on_logout_pressed() -> void:
	if _google_sign_in:
		_google_sign_in.signOut()
	if _ws:
		_ws.close()
		_ws = null
	sign_in_button.visible = true
	_show_view("login")
	login_ui.get_node("StatusLabel").text = ""

func _on_test_vfx_pressed() -> void:
	_add_overlay_scene("res://scenes/vfx_test.tscn", "VfxTestOverlay")

func _on_visibility_changed() -> void:
	if get_tree().root.visible:
		if _overlay_scenes.is_empty():
			animap_player.process_mode = Node.PROCESS_MODE_INHERIT
	else:
		animap_player.process_mode = Node.PROCESS_MODE_DISABLED

# --- Overlay Scene Management ---

func _add_overlay_scene(scene_path: String, scene_name: String) -> void:
	animap_player.process_mode = Node.PROCESS_MODE_DISABLED

	var scene: PackedScene = load(scene_path)
	var node: Node = scene.instantiate()
	node.name = scene_name
	if node.has_signal("back_requested"):
		node.back_requested.connect(_remove_overlay_scenes)
	add_child(node)
	_overlay_scenes.append(node)

func _remove_overlay_scenes() -> void:
	for overlay in _overlay_scenes:
		if is_instance_valid(overlay):
			overlay.queue_free()
	_overlay_scenes.clear()
	animap_player.process_mode = Node.PROCESS_MODE_INHERIT

	# Return to correct view after gameplay
	# For training, always go to home. For matchmaking, return to hero_select.
	var target_view: String = "hero_select"
	if GameState.previous_view_before_gameplay == "home" or GameState.match_mode == "training":
		target_view = "home"
	GameState.previous_view_before_gameplay = ""
	_show_view(target_view, false)

# --- Layout ---

func _apply_layout_rect(node: Control, r: Dictionary) -> void:
	node.anchor_left = 0
	node.anchor_top = 0
	node.anchor_right = 0
	node.anchor_bottom = 0
	node.position = Vector2(r["x"], r["y"])
	node.size = Vector2(r["width"], r["height"])

func _apply_login_layout() -> void:
	var boxes: Dictionary = GameState.get_scene_boxes("login")
	if boxes.is_empty():
		return
	var vp_size := get_viewport().get_visible_rect().size

	if boxes.has("logo"):
		var box: Dictionary = boxes["logo"]
		logo_animap.fit_mode = str(box.get("fill", "contain"))
		var logo_rect := GameState.resolve_box(box, vp_size)
		_apply_layout_rect(login_ui.get_node("LogoContainer"), logo_rect)
		var logo_container: Control = login_ui.get_node("LogoContainer")
		logo_container.mouse_filter = Control.MOUSE_FILTER_IGNORE

	if boxes.has("sign_in_button"):
		var box: Dictionary = boxes["sign_in_button"]
		sign_in_button.set_fit_mode(str(box.get("fill", "contain")))
		var resolved := GameState.resolve_box(box, vp_size)
		_apply_layout_rect(login_ui.get_node("SignInContainer"), resolved)

	if boxes.has("status_label"):
		var status_box: Dictionary = boxes["status_label"]
		_apply_layout_rect(login_ui.get_node("StatusLabel"), GameState.resolve_box(status_box, vp_size))

const _HOME_BOX_NODES := {
	"title_label": "TitleLabel",
	"find_match_button": "FindMatchButton",
	"training_button": "TrainingButton",
	"logout_button": "LogoutButton",
	"test_vfx_button": "TestVfxButton",
}

func _apply_home_layout() -> void:
	var boxes: Dictionary = GameState.get_scene_boxes("home")
	if boxes.is_empty():
		return
	var vp_size := get_viewport().get_visible_rect().size
	for box_id in _HOME_BOX_NODES:
		if not boxes.has(box_id) or not home_ui.has_node(_HOME_BOX_NODES[box_id]):
			continue
		var node: Control = home_ui.get_node(_HOME_BOX_NODES[box_id])
		var box: Dictionary = boxes[box_id]
		_apply_layout_rect(node, GameState.resolve_box(box, vp_size))

# --- Credentials Persistence ---

const _CRED_PATH := "user://credentials.json"

func _save_credentials(id_token: String, email: String, display_name: String) -> void:
	var file := FileAccess.open(_CRED_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({
			"id_token": id_token,
			"email": email,
			"display_name": display_name,
			"session_token": _session_token,
		}))

func _load_saved_credentials() -> Dictionary:
	if not FileAccess.file_exists(_CRED_PATH):
		return {}
	var file := FileAccess.open(_CRED_PATH, FileAccess.READ)
	if not file:
		return {}
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK:
		return {}
	var data: Dictionary = json.data as Dictionary
	if str(data.get("id_token", "")).is_empty():
		return {}
	return data

func _clear_saved_credentials() -> void:
	if FileAccess.file_exists(_CRED_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(_CRED_PATH))
