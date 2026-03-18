extends Control
## res://scripts/main.gd: Main screen with panning video background and three UI states

signal view_changed(view_name: String)

# Node references
@onready var video_bg: VideoStreamPlayer = $VideoClip/VideoBackground
@onready var login_ui: Control = $LoginUI
@onready var home_ui: Control = $HomeUI
@onready var find_match_ui: Control = $FindMatchUI

# Pan positions computed dynamically based on viewport
var _pan_login: float = 0.0
var _pan_home: float = 0.0
var _pan_find_match: float = 0.0
const PAN_DURATION: float = 0.5

var _current_view: String = "login"
var _tween: Tween = null

# Google Sign-In
const WEB_CLIENT_ID = "12643923522-2oi6nt6clhbiav3r7kqgj27v00rm1nk6.apps.googleusercontent.com"
var _google_sign_in: Object = null

# WebSocket
const SERVER_URL = "wss://sg.vangambit.com/ws"
var _ws: WebSocketPeer = null
var _player_id: String = ""
var _display_name: String = ""
var _id_token: String = ""

func _ready() -> void:
	# Size video to fill viewport height (video is 1:1 square)
	var vp_size = get_viewport().get_visible_rect().size
	var video_size = vp_size.y  # full height, square so width = height
	video_bg.expand = true
	video_bg.size = Vector2(video_size, video_size)
	video_bg.position = Vector2(0, 0)

	# Compute pan offsets: extra width beyond viewport
	var extra = video_size - vp_size.x
	_pan_login = 0.0
	_pan_home = -extra * 0.2
	_pan_find_match = -extra

	# Connect button signals
	login_ui.get_node("LoginButton").pressed.connect(_on_login_pressed)
	home_ui.get_node("FindMatchButton").pressed.connect(_on_find_match_pressed)
	home_ui.get_node("LogoutButton").pressed.connect(_on_logout_pressed)
	find_match_ui.get_node("BackButton").pressed.connect(_on_back_pressed)

	# Initialize Google Sign-In plugin (Android only)
	if Engine.has_singleton("GodotGoogleSignIn"):
		_google_sign_in = Engine.get_singleton("GodotGoogleSignIn")
		_google_sign_in.connect("sign_in_success", _on_sign_in_success)
		_google_sign_in.connect("sign_in_failed", _on_sign_in_failed)
		_google_sign_in.connect("sign_out_complete", _on_sign_out_complete)
		_google_sign_in.initialize(WEB_CLIENT_ID)
		print("[AUTH] Google Sign-In initialized")
	else:
		print("[AUTH] Google Sign-In not available (not on Android)")

	# Start on Login view
	_show_view("login", false)

func _process(_delta: float) -> void:
	if _ws:
		_ws.poll()
		var state = _ws.get_ready_state()
		if state == WebSocketPeer.STATE_OPEN:
			while _ws.get_available_packet_count() > 0:
				var msg = _ws.get_packet().get_string_from_utf8()
				_on_ws_message(msg)
		elif state == WebSocketPeer.STATE_CLOSED:
			print("[WS] Connection closed: ", _ws.get_close_code(), " ", _ws.get_close_reason())
			_ws = null

# --- Google Sign-In callbacks ---

func _on_sign_in_success(id_token: String, email: String, display_name: String) -> void:
	print("[AUTH] Sign-in success: ", email)
	_id_token = id_token
	_display_name = display_name
	_connect_to_server()

func _on_sign_in_failed(error: String) -> void:
	print("[AUTH] Sign-in failed: ", error)
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
	_display_name = ""
	if _ws:
		_ws.close()
		_ws = null

# --- WebSocket ---

func _connect_to_server() -> void:
	login_ui.get_node("StatusLabel").text = "Connecting..."
	_ws = WebSocketPeer.new()
	var err = _ws.connect_to_url(SERVER_URL)
	if err != OK:
		print("[WS] Failed to connect: ", err)
		login_ui.get_node("StatusLabel").text = "Connection failed."
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
		_send_json({"type": "authenticate", "id_token": _id_token})
	elif state == WebSocketPeer.STATE_CONNECTING:
		_wait_for_connection()
	else:
		print("[WS] Connection failed")
		login_ui.get_node("StatusLabel").text = "Connection failed."

func _send_json(data: Dictionary) -> void:
	if _ws and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		_ws.send_text(JSON.stringify(data))

func _on_ws_message(msg: String) -> void:
	var json = JSON.new()
	if json.parse(msg) != OK:
		return
	var data: Dictionary = json.data
	var msg_type: String = data.get("type", "")

	match msg_type:
		"connected":
			print("[WS] Connected as: ", data.get("player_id", ""))
		"authenticated":
			_player_id = data.get("player_id", "")
			_display_name = data.get("display_name", _display_name)
			print("[WS] Authenticated: ", _player_id, " (", _display_name, ")")
			home_ui.get_node("TitleLabel").text = "Welcome, " + _display_name
			_show_view("home")
		"auth_error":
			print("[WS] Auth error: ", data.get("message", ""))
			login_ui.get_node("StatusLabel").text = "Auth failed: " + data.get("message", "")
		"matchmaking_queued":
			find_match_ui.get_node("SearchingLabel").text = "Searching..."
		"match_found":
			print("[WS] Match found: ", data.get("match_id", ""))
			find_match_ui.get_node("SearchingLabel").text = "Match found!"
		_:
			print("[WS] ", msg_type, ": ", msg.left(200))

# --- View management ---

func _show_view(view_name: String, animate: bool = true) -> void:
	_current_view = view_name

	var target_x: float = _pan_login
	match view_name:
		"login":
			target_x = _pan_login
		"home":
			target_x = _pan_home
		"find_match":
			target_x = _pan_find_match

	if _tween and _tween.is_valid():
		_tween.kill()

	if animate:
		_tween = create_tween()
		_tween.set_ease(Tween.EASE_IN_OUT)
		_tween.set_trans(Tween.TRANS_CUBIC)
		_tween.tween_property(video_bg, ^"position:x", target_x, PAN_DURATION)
		_tween.tween_callback(_update_ui_visibility.bind(view_name))
		_update_ui_visibility(view_name)
	else:
		video_bg.position.x = target_x
		_update_ui_visibility(view_name)

	view_changed.emit(view_name)

func _update_ui_visibility(view_name: String) -> void:
	login_ui.visible = (view_name == "login")
	home_ui.visible = (view_name == "home")
	find_match_ui.visible = (view_name == "find_match")

func _on_login_pressed() -> void:
	if _google_sign_in:
		login_ui.get_node("StatusLabel").text = "Signing in..."
		_google_sign_in.signIn()
	else:
		# Desktop fallback: skip auth, go directly to home
		_show_view("home")

func _on_find_match_pressed() -> void:
	_send_json({"type": "queue_matchmaking", "hero_slug_1": "iron-knight", "hero_slug_2": "arc-strider", "hero_slug_3": "flame-warlock"})
	_show_view("find_match")

func _on_logout_pressed() -> void:
	if _google_sign_in:
		_google_sign_in.signOut()
	if _ws:
		_ws.close()
		_ws = null
	_show_view("login")
	login_ui.get_node("StatusLabel").text = ""

func _on_back_pressed() -> void:
	_show_view("home")
