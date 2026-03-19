extends Control
## res://scripts/main.gd: Main screen with animap background and three UI states

signal view_changed(view_name: String)

# Node references
@onready var animap_player: AnimapPlayer = $AnimapClip/AnimapPlayer
@onready var login_ui: Control = $LoginUI
@onready var home_ui: Control = $HomeUI
@onready var find_match_ui: Control = $FindMatchUI
@onready var logo_animap: AnimapPlayer = $LoginUI/LogoContainer/LogoAnimap
@onready var sign_in_animap: AnimapPlayer = $LoginUI/SignInContainer/SignInAnimap

var _current_view: String = "login"

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

const MAIN_ANIMAP_SLUG := "main"
const VIEW_TO_ANIMAP_STATE := {
	"login": "login",
	"home": "home",
	"find_match": "find-match",
}

func _ready() -> void:
	# Connect button signals
	home_ui.get_node("FindMatchButton").pressed.connect(_on_find_match_pressed)
	home_ui.get_node("LogoutButton").pressed.connect(_on_logout_pressed)
	find_match_ui.get_node("BackButton").pressed.connect(_on_back_pressed)
	sign_in_animap.gui_input.connect(_on_sign_in_gui_input)

	animap_player.load_animap(MAIN_ANIMAP_SLUG)
	logo_animap.load_animap("vg-logo")
	sign_in_animap.load_animap("google-sign-in")

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
			
			# Update GameState
			GameState.player_id = _player_id
			GameState.display_name = _display_name
			GameState.id_token = _id_token
			GameState.ws = _ws
			
			_show_view("home")
		"auth_error":
			print("[WS] Auth error: ", data.get("message", ""))
			login_ui.get_node("StatusLabel").text = "Auth failed: " + data.get("message", "")
		"matchmaking_queued":
			find_match_ui.get_node("SearchingLabel").text = "Searching..."
		"match_found":
			print("[WS] Match found: ", data.get("match_id", ""))
			find_match_ui.get_node("SearchingLabel").text = "Match found!"
			
			# Store match info and transition to gameplay
			GameState.current_match_id = data.get("match_id", "")
			GameState.current_team = data.get("team", 1)
			
			await get_tree().create_timer(1.0).timeout
			get_tree().change_scene_to_file("res://scenes/gameplay.tscn")
		_:
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
	view_changed.emit(view_name)

func _update_ui_visibility(view_name: String) -> void:
	login_ui.visible = (view_name == "login")
	home_ui.visible = (view_name == "home")
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
	_google_sign_in.signIn()

func _on_find_match_pressed() -> void:
	# Go to hero selection screen instead of directly queuing
	get_tree().change_scene_to_file("res://scenes/hero_select.tscn")

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
