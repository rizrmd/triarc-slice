extends Control
## res://scripts/main.gd: Main screen with animap background and three UI states

signal view_changed(view_name: String)

# Node references
@onready var animap_player: AnimapPlayer = $AnimapClip/AnimapPlayer
@onready var login_ui: Control = $LoginUI
@onready var home_ui: Control = $HomeUI
@onready var hero_select_ui: Control = $HeroSelectUI
@onready var find_match_ui: Control = $FindMatchUI
@onready var logo_animap: AnimapPlayer = $LoginUI/LogoContainer/LogoAnimap
@onready var sign_in_animap: AnimapPlayer = $LoginUI/SignInContainer/SignInAnimap
@onready var overlay: ColorRect = $Overlay

@onready var fade_rect: ColorRect = $FadeRect
var _current_view: String = "login"

# Loaded overlay scenes (keep main scene alive)
var _overlay_scenes: Array = []

# Animap loader for caching - created early so preloads can use it
var _animap_loader: AnimapLoader = AnimapLoader.new()

# Google Sign-In
const WEB_CLIENT_ID = "12643923522-2oi6nt6clhbiav3r7kqgj27v00rm1nk6.apps.googleusercontent.com"
const SIGN_IN_URL = "https://sg.vangambit.com/sign-in/desktop"
var _google_sign_in: Object = null

# WebSocket
const SERVER_URL = "wss://sg.vangambit.com/ws"
var _ws: WebSocketPeer = null
var _player_id: String = ""
var _display_name: String = ""
var _id_token: String = ""
var _session_token: String = ""

var _reauth_attempted: bool = false

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
	# Use preloaded AnimapLoader from loading screen if available, or reuse existing one
	if GameState.animap_loader != null:
		_animap_loader = GameState.animap_loader
		print("[Main] Using preloaded AnimapLoader")
	elif _animap_loader == null:
		_animap_loader = AnimapLoader.new()
		_animap_loader.preload_animap_async(MAIN_ANIMAP_SLUG)
		print("[Main] Created new AnimapLoader, started preload: ", MAIN_ANIMAP_SLUG)
	else:
		print("[Main] Reusing existing AnimapLoader")
	# Store in GameState so it persists across scene changes
	GameState.animap_loader = _animap_loader

	# Initialize animap player with the loader
	animap_player.set_animap_loader(_animap_loader)

	# Pause animap when app loses focus
	get_tree().root.visibility_changed.connect(_on_visibility_changed)

	# Connect button signals
	home_ui.get_node("FindMatchButton").pressed.connect(_on_find_match_pressed)
	home_ui.get_node("TrainingButton").pressed.connect(_on_training_pressed)
	home_ui.get_node("LogoutButton").pressed.connect(_on_logout_pressed)
	home_ui.get_node("TestVfxButton").pressed.connect(_on_test_vfx_pressed)
	hero_select_ui.back_requested.connect(func(): _show_view("home"))
	hero_select_ui.find_match_requested.connect(func(): _show_view("find_match"))
	find_match_ui.get_node("BackButton").pressed.connect(_on_back_pressed)
	sign_in_animap.gui_input.connect(_on_sign_in_gui_input)

	animap_player.load_animap(MAIN_ANIMAP_SLUG)
	logo_animap.load_animap("vg-logo")
	sign_in_animap.load_animap("google-sign-in")

	_apply_login_layout()
	_apply_home_layout()

	# Initialize Google Sign-In: native plugin on Android, OAuth loopback on desktop
	if Engine.has_singleton("GodotGoogleSignIn"):
		_google_sign_in = Engine.get_singleton("GodotGoogleSignIn")
		_google_sign_in.connect("sign_in_success", _on_sign_in_success)
		_google_sign_in.connect("sign_in_failed", _on_sign_in_failed)
		_google_sign_in.connect("sign_out_complete", _on_sign_out_complete)
		_google_sign_in.initialize(WEB_CLIENT_ID)
		print("[AUTH] Google Sign-In initialized (Android)")
	else:
		var desktop_auth = preload("res://scripts/desktop_google_auth.gd").new()
		add_child(desktop_auth)
		desktop_auth.sign_in_success.connect(_on_sign_in_success)
		desktop_auth.sign_in_failed.connect(_on_sign_in_failed)
		desktop_auth.sign_out_complete.connect(_on_sign_out_complete)
		desktop_auth.initialize(SIGN_IN_URL)
		_google_sign_in = desktop_auth
		print("[AUTH] Google Sign-In initialized (Desktop OAuth)")

	# If already authenticated (returning from gameplay), go straight to home
	if not GameState.player_id.is_empty():
		_player_id = GameState.player_id
		_display_name = GameState.display_name
		_id_token = GameState.id_token
		home_ui.get_node("TitleLabel").text = "Welcome, " + _display_name
		if GameState.ws and GameState.ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
			_ws = GameState.ws
		else:
			# Was authenticated but lost connection — reconnect silently
			home_ui.get_node("TitleLabel").text = "Reconnecting..."
			_connect_to_server()
		var start_view := "hero_select" if GameState.should_return_to_hero_select() else "home"
		_show_view(start_view, false)
		var tween = create_tween()
		tween.tween_property(fade_rect, "color:a", 0.0, 0.5)
		tween.tween_callback(func(): fade_rect.visible = false)
		return

	# If saved credentials exist, show login screen while connecting
	var saved = _load_saved_credentials()
	if not saved.is_empty():
		_id_token = saved.get("id_token", "")
		_display_name = saved.get("display_name", "")
		_session_token = saved.get("session_token", "")
		login_ui.get_node("StatusLabel").text = "Connecting..."
		sign_in_animap.visible = false
		_show_view("login", false)
		var tween = create_tween()
		tween.tween_property(fade_rect, "color:a", 0.0, 0.5)
		tween.tween_callback(func(): fade_rect.visible = false)
		_connect_to_server()
		return

	# Start on Login view
	_show_view("login", false)

	# Fade in from black
	var tween = create_tween()
	tween.tween_property(fade_rect, "color:a", 0.0, 0.5)
	tween.tween_callback(func(): fade_rect.visible = false)

func _process(_delta: float) -> void:
	if _ws:
		_ws.poll()
		var state = _ws.get_ready_state()
		if state == WebSocketPeer.STATE_OPEN:
			while _ws and _ws.get_available_packet_count() > 0:
				var msg = _ws.get_packet().get_string_from_utf8()
				_on_ws_message(msg)
		elif state == WebSocketPeer.STATE_CLOSED:
			var code = _ws.get_close_code()
			var reason = _ws.get_close_reason()
			print("[WS] Connection closed: ", code, " ", reason)
			_ws = null
			GameState.ws = null
			_on_ws_disconnected()

# --- Mockup Mode Toggle (F12) - DEPRECATED, now integrated in gameplay.gd ---
# F12 in gameplay scene now toggles local mock mode directly

func _input(event: InputEvent) -> void:
	# F12 disabled - mock mode is now toggled within gameplay.gd itself
	pass

func _toggle_mockup_mode() -> void:
	# DEPRECATED: Mock mode is now integrated in gameplay.gd
	# Use F12 within gameplay scene to toggle mock mode
	print("[Main] F12 pressed - Mock mode is now integrated in gameplay.gd")
	print("[Main] Start a match first, then press F12 in gameplay to toggle mock mode")

func _on_ws_disconnected() -> void:
	match _current_view:
		"find_match":
			find_match_ui.get_node("SearchingLabel").text = "Connection lost."
			await get_tree().create_timer(1.5).timeout
			_show_view("home")
	# Try to reconnect if we have a session token
	if not _id_token.is_empty():
		home_ui.get_node("TitleLabel").text = "Reconnecting..."
		if _current_view != "home":
			_show_view("home")
		_connect_to_server()
	else:
		_show_view("login")
		login_ui.get_node("StatusLabel").text = "Connection lost. Please sign in."

# --- Google Sign-In callbacks ---

func _on_sign_in_success(id_token: String, email: String, display_name: String) -> void:
	print("[AUTH] Sign-in success: ", email)
	_id_token = id_token
	_display_name = display_name
	_save_credentials(id_token, email, display_name)
	_connect_to_server()

func _on_sign_in_failed(error: String) -> void:
	print("[AUTH] Sign-in failed: ", error)
	sign_in_animap.visible = true
	if "No credentials" in error or "NoCredential" in error:
		# No Google account on device — prompt user to add one
		login_ui.get_node("StatusLabel").text = "No Google account found.\nPlease add one in Settings."
		# Open Android account settings
		OS.shell_open("market://details?id=com.google.android.gms")
	else:
		login_ui.get_node("StatusLabel").text = "Sign-in failed. Try again."

func _on_sign_out_complete() -> void:
	print("[AUTH] Signed out")
	_player_id = ""
	_id_token = ""
	_session_token = ""
	_display_name = ""
	_clear_saved_credentials()
	if _ws:
		_ws.close()
		_ws = null

# --- WebSocket ---

func _connect_to_server() -> void:
	login_ui.get_node("StatusLabel").text = "Connecting..."
	sign_in_animap.visible = false
	_ws = WebSocketPeer.new()
	var err = _ws.connect_to_url(SERVER_URL)
	if err != OK:
		print("[WS] Failed to connect: ", err)
		login_ui.get_node("StatusLabel").text = "Connection failed."
		sign_in_animap.visible = true
		return
	# Wait for connection in _process, then authenticate
	_wait_for_connection()

func _wait_for_connection() -> void:
	# Use a timer to poll until connected
	var timer = get_tree().create_timer(0.1)
	timer.timeout.connect(_check_connection)

func _check_connection() -> void:
	if not _ws:
		return
	_ws.poll()
	var state = _ws.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		print("[WS] Connected, authenticating...")
		var auth_msg := {"type": "authenticate"}
		if not _session_token.is_empty():
			auth_msg["session_token"] = _session_token
		elif not _id_token.is_empty():
			auth_msg["id_token"] = _id_token
		_send_json(auth_msg)
	elif state == WebSocketPeer.STATE_CONNECTING:
		_wait_for_connection()
	else:
		print("[WS] Connection failed")
		login_ui.get_node("StatusLabel").text = "Connection failed."
		sign_in_animap.visible = true

func _send_json(data: Dictionary) -> void:
	if _ws and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		_ws.send_text(JSON.stringify(data))

func _on_ws_message(msg: String) -> void:
	var json = JSON.new()
	if json.parse(msg) != OK:
		return
	var data: Dictionary = json.data
	var msg_type: String = data.get("type", "")
	if msg_type != "state_update":
		print("[WS] Received: ", msg_type)

	# Forward all messages to GameState signal for gameplay to receive
	GameState.ws_message_received.emit(msg)

	match msg_type:
		"connected":
			print("[WS] Connected as: ", data.get("player_id", ""))
		"authenticated":
			_player_id = data.get("player_id", "")
			_display_name = data.get("display_name", _display_name)
			var new_session = data.get("session_token", "")
			if not new_session.is_empty():
				_session_token = new_session
			_reauth_attempted = false
			print("[WS] Authenticated: ", _player_id, " (", _display_name, ")")
			home_ui.get_node("TitleLabel").text = "Welcome, " + _display_name
			
			# Re-save credentials with session token
			var email = data.get("email", "")
			_save_credentials(_id_token, email, _display_name)

			# Update GameState
			GameState.player_id = _player_id
			GameState.display_name = _display_name
			GameState.id_token = _id_token
			GameState.ws = _ws

			_show_view("home")
		"auth_error":
			print("[WS] Auth error: ", data.get("message", ""))
			if _ws:
				_ws.close()
				_ws = null
			if not _reauth_attempted and _google_sign_in:
				# Try silent re-auth to get a fresh token
				_reauth_attempted = true
				print("[AUTH] Token rejected, attempting silent re-auth...")
				login_ui.get_node("StatusLabel").text = "Refreshing session..."
				_google_sign_in.signIn()
			else:
				_reauth_attempted = false
				_clear_saved_credentials()
				_id_token = ""
				_session_token = ""
				sign_in_animap.visible = true
				login_ui.get_node("StatusLabel").text = "Session expired. Please sign in again."
				_show_view("login")
		"matchmaking_queued":
			find_match_ui.get_node("SearchingLabel").text = "Searching..."
		"match_found":
			print("[WS] Match found: ", data.get("match_id", ""))

			# Store match info and transition to gameplay
			GameState.current_match_id = data.get("match_id", "")
			GameState.current_team = data.get("team", 1)

			if _current_view == "find_match":
				find_match_ui.get_node("SearchingLabel").text = "Match found!"
				await get_tree().create_timer(1.0).timeout
			# Add gameplay as overlay to keep main scene loaded
			print("[Main] Adding gameplay overlay...")
			_add_overlay_scene("res://scenes/gameplay.tscn", "GameplayOverlay")
			print("[Main] Gameplay overlay added")
		_:
			if msg_type != "state_update":
				print("[WS] ", msg_type, ": ", msg.left(200))

# --- View management ---

func _show_view(view_name: String, _animate: bool = true) -> void:
	_current_view = view_name
	_update_ui_visibility(view_name)
	var state_id: String = VIEW_TO_ANIMAP_STATE.get(view_name, AnimapLoader.DEFAULT_STATE_ID)
	if animap_player.has_state(state_id):
		animap_player.set_state(state_id)
	elif animap_player.has_state(AnimapLoader.DEFAULT_STATE_ID):
		animap_player.set_state(AnimapLoader.DEFAULT_STATE_ID)
	# Pan background
	var target_pan = VIEW_PAN_X.get(view_name, 0.0)
	if _animate:
		var pan_tw = create_tween()
		pan_tw.set_ease(Tween.EASE_IN_OUT)
		pan_tw.set_trans(Tween.TRANS_CUBIC)
		pan_tw.tween_property(animap_player, "pan_x", target_pan, 0.5)
	else:
		animap_player.pan_x = target_pan
	# Overlay only visible on login
	if view_name == "login":
		overlay.visible = true
		if _animate:
			overlay.color.a = 0.0
			var tw = create_tween()
			tw.tween_property(overlay, "color:a", 0.3, 0.3)
		else:
			overlay.color.a = 0.3
	else:
		if _animate:
			var tw = create_tween()
			tw.tween_property(overlay, "color:a", 0.0, 0.3)
			tw.tween_callback(func(): overlay.visible = false)
		else:
			overlay.visible = false
	view_changed.emit(view_name)

func _update_ui_visibility(view_name: String) -> void:
	login_ui.visible = (view_name == "login")
	home_ui.visible = (view_name == "home")
	hero_select_ui.visible = (view_name == "hero_select")
	find_match_ui.visible = (view_name == "find_match")

func _on_sign_in_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			sign_in_animap.set_state("clicked")
		else:
			sign_in_animap.set_state("default")
			_on_login_pressed()
		sign_in_animap.accept_event()

func _on_login_pressed() -> void:
	login_ui.get_node("StatusLabel").text = "Signing in..."
	sign_in_animap.visible = false
	# Use saved credentials if available, skip Google entirely
	var saved = _load_saved_credentials()
	if not saved.is_empty():
		_id_token = saved.get("id_token", "")
		_display_name = saved.get("display_name", "")
		_session_token = saved.get("session_token", "")
		_connect_to_server()
	else:
		_google_sign_in.signIn()

func _on_find_match_pressed() -> void:
	GameState.match_mode = "matchmaking"
	_show_view("hero_select")

func _on_training_pressed() -> void:
	GameState.match_mode = "training"
	_show_view("hero_select")

func _on_logout_pressed() -> void:
	if _google_sign_in:
		_google_sign_in.signOut()
	if _ws:
		_ws.close()
		_ws = null
	sign_in_animap.visible = true
	_show_view("login")
	login_ui.get_node("StatusLabel").text = ""

func _on_test_vfx_pressed() -> void:
	print("[VFX TEST] Navigating to VFX Test scene...")
	_add_overlay_scene("res://scenes/vfx_test.tscn", "VfxTestOverlay")

func _on_back_pressed() -> void:
	# Remove any overlay scenes
	_remove_overlay_scenes()
	# Don't animate - just stay on current view, overlay is gone
	# The view was already set before going to overlay

func _on_visibility_changed() -> void:
	# Pause animap when app loses focus, resume when regained
	if get_tree().root.visible:
		# App is visible again - resume animap if no overlays
		if _overlay_scenes.is_empty():
			animap_player.process_mode = Node.PROCESS_MODE_INHERIT
			print("[Main] App visible, resumed animap")
	else:
		# App lost focus - pause animap
		animap_player.process_mode = Node.PROCESS_MODE_DISABLED
		print("[Main] App hidden, paused animap")

func _add_overlay_scene(scene_path: String, scene_name: String) -> void:
	# Pause animap to save resources while overlay is active
	animap_player.process_mode = Node.PROCESS_MODE_DISABLED

	var scene = load(scene_path)
	var node = scene.instantiate()
	node.name = scene_name
	# Connect back button to remove overlay
	if node.has_signal("back_requested"):
		node.back_requested.connect(_remove_overlay_scenes)
	# Add at the end so it's on top, but don't hide main
	add_child(node)
	_overlay_scenes.append(node)
	print("[Main] Added overlay: ", scene_name, " (total: ", _overlay_scenes.size(), ")")

func _remove_overlay_scenes() -> void:
	for overlay in _overlay_scenes:
		if is_instance_valid(overlay):
			overlay.queue_free()
	_overlay_scenes.clear()
	# Resume animap when all overlays are removed
	animap_player.process_mode = Node.PROCESS_MODE_INHERIT
	print("[Main] Removed all overlays, resumed animap")

func _apply_layout_rect(node: Control, r: Dictionary) -> void:
	node.anchor_left = 0
	node.anchor_top = 0
	node.anchor_right = 0
	node.anchor_bottom = 0
	node.position = Vector2(r["x"], r["y"])
	node.size = Vector2(r["width"], r["height"])

func _apply_login_layout() -> void:
	var boxes = GameState.get_scene_boxes("login")
	if boxes.is_empty():
		return
	var vp_size = get_viewport().get_visible_rect().size

	if boxes.has("logo"):
		var box = boxes["logo"]
		logo_animap.fit_mode = str(box.get("fill", "contain"))
		_apply_layout_rect(login_ui.get_node("LogoContainer"), GameState.resolve_box(box, vp_size))

	if boxes.has("sign_in_button"):
		var box = boxes["sign_in_button"]
		sign_in_animap.fit_mode = str(box.get("fill", "contain"))
		_apply_layout_rect(login_ui.get_node("SignInContainer"), GameState.resolve_box(box, vp_size))

	if boxes.has("status_label"):
		_apply_layout_rect(login_ui.get_node("StatusLabel"), GameState.resolve_box(boxes["status_label"], vp_size))

## Map of home layout box id -> HomeUI child node name
const _HOME_BOX_NODES := {
	"title_label": "TitleLabel",
	"find_match_button": "FindMatchButton",
	"training_button": "TrainingButton",
	"logout_button": "LogoutButton",
	"test_vfx_button": "TestVfxButton",
}

func _apply_home_layout() -> void:
	var boxes = GameState.get_scene_boxes("home")
	if boxes.is_empty():
		print("[HOME LAYOUT] no boxes found")
		return
	var vp_size = get_viewport().get_visible_rect().size
	print("[HOME LAYOUT] viewport: ", vp_size, " boxes: ", boxes.keys())
	for box_id in _HOME_BOX_NODES:
		if not boxes.has(box_id):
			print("[HOME LAYOUT] box '", box_id, "' not in layout")
			continue
		var node_name: String = _HOME_BOX_NODES[box_id]
		if not home_ui.has_node(node_name):
			print("[HOME LAYOUT] node '", node_name, "' not in HomeUI")
			continue
		var r = GameState.resolve_box(boxes[box_id], vp_size)
		print("[HOME LAYOUT] ", box_id, " -> ", node_name, " = ", r)
		var node: Control = home_ui.get_node(node_name)
		_apply_layout_rect(node, r)

# --- Credential persistence (desktop) ---

const _CRED_PATH = "user://credentials.json"

func _save_credentials(id_token: String, email: String, display_name: String) -> void:
	var data = {"id_token": id_token, "email": email, "display_name": display_name, "session_token": _session_token}
	var file = FileAccess.open(_CRED_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(data))

func _load_saved_credentials() -> Dictionary:
	if not FileAccess.file_exists(_CRED_PATH):
		return {}
	var file = FileAccess.open(_CRED_PATH, FileAccess.READ)
	if not file:
		return {}
	var json = JSON.new()
	if json.parse(file.get_as_text()) != OK:
		return {}
	var data: Dictionary = json.data
	if data.get("id_token", "").is_empty():
		return {}
	return data

func _clear_saved_credentials() -> void:
	if FileAccess.file_exists(_CRED_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(_CRED_PATH))
