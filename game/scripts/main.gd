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

# Home UI Animap Players
@onready var play_button_animap: AnimapPlayer = $HomeUI/PlayButtonContainer/PlayButtonAnimap
@onready var training_button_animap: AnimapPlayer = $HomeUI/TrainingButtonContainer/TrainingButtonAnimap
@onready var deck_button_animap: AnimapPlayer = $HomeUI/DeckButtonContainer/DeckButtonAnimap
@onready var currency_gems_animap: AnimapPlayer = $HomeUI/CurrencyGemsContainer/CurrencyGemsAnimap
@onready var currency_gold_animap: AnimapPlayer = $HomeUI/CurrencyGoldContainer/CurrencyGoldAnimap
@onready var player_avatar_animap: AnimapPlayer = $HomeUI/PlayerAvatarContainer/PlayerAvatarAnimap
@onready var player_name_animap: AnimapPlayer = $HomeUI/PlayerNameContainer/PlayerNameAnimap
@onready var settings_button_animap: AnimapPlayer = $HomeUI/SettingsButtonContainer/SettingsButtonAnimap
@onready var shop_button_animap: AnimapPlayer = $HomeUI/ShopButtonContainer/ShopButtonAnimap

@onready var fade_rect: ColorRect = $FadeRect
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
	# Connect Home UI animap button signals via gui_input
	play_button_animap.gui_input.connect(_on_play_button_gui_input)
	training_button_animap.gui_input.connect(_on_training_button_gui_input)
	deck_button_animap.gui_input.connect(_on_deck_button_gui_input)
	settings_button_animap.gui_input.connect(_on_settings_button_gui_input)
	shop_button_animap.gui_input.connect(_on_shop_button_gui_input)
	
	hero_select_ui.back_requested.connect(func(): _show_view("home"))
	hero_select_ui.find_match_requested.connect(func(): _show_view("find_match"))
	find_match_ui.get_node("BackButton").pressed.connect(_on_back_pressed)
	sign_in_animap.gui_input.connect(_on_sign_in_gui_input)

	animap_player.load_animap(MAIN_ANIMAP_SLUG)
	logo_animap.fit_mode = "contain"
	logo_animap.load_animap("vg-logo")
	sign_in_animap.fit_mode = "contain"
	sign_in_animap.load_animap("google-sign-in")

	# Setup Home UI animaps (will be positioned by _apply_home_layout)
	play_button_animap.fit_mode = "contain"
	training_button_animap.fit_mode = "contain"
	deck_button_animap.fit_mode = "contain"
	currency_gems_animap.fit_mode = "contain"
	currency_gold_animap.fit_mode = "contain"
	player_avatar_animap.fit_mode = "contain"
	player_name_animap.fit_mode = "contain"
	settings_button_animap.fit_mode = "contain"
	shop_button_animap.fit_mode = "contain"

	_apply_login_layout()

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
			get_tree().change_scene_to_file("res://scenes/gameplay.tscn")
		_:
			print("[WS] ", msg_type, ": ", msg.left(200))

# --- View management ---

func _show_view(view_name: String, _animate: bool = true) -> void:
	_current_view = view_name
	_update_ui_visibility(view_name)
	
	# Apply layout from game-layout.json based on current view
	match view_name:
		"login":
			_apply_login_layout()
		"home":
			_apply_home_layout()
		"hero_select":
			_apply_hero_select_layout()
		"find_match":
			_apply_find_match_layout()
	
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

func _on_back_pressed() -> void:
	_show_view("hero_select")

func _apply_login_layout() -> void:
	var boxes = GameState.get_scene_boxes("login")
	if boxes.is_empty():
		push_warning("[Main] No login layout boxes found")
		return
	var vp_size = get_viewport().get_visible_rect().size

	if boxes.has("logo"):
		var r = GameState.resolve_box(boxes["logo"], vp_size)
		var logo_container: Control = login_ui.get_node("LogoContainer")
		logo_container.position = Vector2(r["x"], r["y"])
		logo_container.size = Vector2(r["width"], r["height"])

	if boxes.has("sign_in_button"):
		var r = GameState.resolve_box(boxes["sign_in_button"], vp_size)
		var sign_in_container: Control = login_ui.get_node("SignInContainer")
		sign_in_container.position = Vector2(r["x"], r["y"])
		sign_in_container.size = Vector2(r["width"], r["height"])

	if boxes.has("status_label"):
		var r = GameState.resolve_box(boxes["status_label"], vp_size)
		var status_label: Label = login_ui.get_node("StatusLabel")
		status_label.position = Vector2(r["x"], r["y"])
		status_label.size = Vector2(r["width"], r["height"])

func _apply_home_layout() -> void:
	var boxes = GameState.get_scene_boxes("home")
	if boxes.is_empty():
		push_warning("[Main] No home layout boxes found")
		return
	var vp_size = get_viewport().get_visible_rect().size

	# Player Name Label (from profile-button animap)
	if boxes.has("player_name"):
		var r = GameState.resolve_box(boxes["player_name"], vp_size)
		var container: Control = home_ui.get_node("PlayerNameContainer")
		container.position = Vector2(r["x"], r["y"])
		container.size = Vector2(r["width"], r["height"])
		var animap_slug = boxes["player_name"].get("animapSlug", "profile-button")
		player_name_animap.load_animap(animap_slug)

	# Play Button (find-match-button)
	if boxes.has("play_button"):
		var r = GameState.resolve_box(boxes["play_button"], vp_size)
		var container: Control = home_ui.get_node("PlayButtonContainer")
		container.position = Vector2(r["x"], r["y"])
		container.size = Vector2(r["width"], r["height"])
		var animap_slug = boxes["play_button"].get("animapSlug", "find-match-button")
		play_button_animap.load_animap(animap_slug)

	# Training Button (training-button)
	if boxes.has("training_button"):
		var r = GameState.resolve_box(boxes["training_button"], vp_size)
		var container: Control = home_ui.get_node("TrainingButtonContainer")
		container.position = Vector2(r["x"], r["y"])
		container.size = Vector2(r["width"], r["height"])
		var animap_slug = boxes["training_button"].get("animapSlug", "training-button")
		training_button_animap.load_animap(animap_slug)

	# Deck Button (logout-button)
	if boxes.has("deck_button"):
		var r = GameState.resolve_box(boxes["deck_button"], vp_size)
		var container: Control = home_ui.get_node("DeckButtonContainer")
		container.position = Vector2(r["x"], r["y"])
		container.size = Vector2(r["width"], r["height"])
		var animap_slug = boxes["deck_button"].get("animapSlug", "logout-button")
		deck_button_animap.load_animap(animap_slug)

	# Currency Gems (training-button)
	if boxes.has("currency_gems"):
		var r = GameState.resolve_box(boxes["currency_gems"], vp_size)
		var container: Control = home_ui.get_node("CurrencyGemsContainer")
		container.position = Vector2(r["x"], r["y"])
		container.size = Vector2(r["width"], r["height"])
		var animap_slug = boxes["currency_gems"].get("animapSlug", "training-button")
		currency_gems_animap.load_animap(animap_slug)

	# Currency Gold (cards-button)
	if boxes.has("currency_gold"):
		var r = GameState.resolve_box(boxes["currency_gold"], vp_size)
		var container: Control = home_ui.get_node("CurrencyGoldContainer")
		container.position = Vector2(r["x"], r["y"])
		container.size = Vector2(r["width"], r["height"])
		var animap_slug = boxes["currency_gold"].get("animapSlug", "cards-button")
		currency_gold_animap.load_animap(animap_slug)

	# Player Avatar (heroes-button)
	if boxes.has("player_avatar"):
		var r = GameState.resolve_box(boxes["player_avatar"], vp_size)
		var container: Control = home_ui.get_node("PlayerAvatarContainer")
		container.position = Vector2(r["x"], r["y"])
		container.size = Vector2(r["width"], r["height"])
		var animap_slug = boxes["player_avatar"].get("animapSlug", "heroes-button")
		player_avatar_animap.load_animap(animap_slug)

	# Settings Button (setting-button)
	if boxes.has("settings_button"):
		var r = GameState.resolve_box(boxes["settings_button"], vp_size)
		var container: Control = home_ui.get_node("SettingsButtonContainer")
		container.position = Vector2(r["x"], r["y"])
		container.size = Vector2(r["width"], r["height"])
		var animap_slug = boxes["settings_button"].get("animapSlug", "setting-button")
		settings_button_animap.load_animap(animap_slug)

	# Shop Button (power-button)
	if boxes.has("shop_button"):
		var r = GameState.resolve_box(boxes["shop_button"], vp_size)
		var container: Control = home_ui.get_node("ShopButtonContainer")
		container.position = Vector2(r["x"], r["y"])
		container.size = Vector2(r["width"], r["height"])
		var animap_slug = boxes["shop_button"].get("animapSlug", "power-button")
		shop_button_animap.load_animap(animap_slug)

# --- Home UI Animap Button Handlers ---

func _on_play_button_gui_input(event: InputEvent) -> void:
	_handle_animap_button_input(event, play_button_animap, "_on_play_button_action")

func _on_training_button_gui_input(event: InputEvent) -> void:
	_handle_animap_button_input(event, training_button_animap, "_on_training_button_action")

func _on_deck_button_gui_input(event: InputEvent) -> void:
	_handle_animap_button_input(event, deck_button_animap, "_on_deck_button_action")

func _on_settings_button_gui_input(event: InputEvent) -> void:
	_handle_animap_button_input(event, settings_button_animap, "_on_settings_button_action")

func _on_shop_button_gui_input(event: InputEvent) -> void:
	_handle_animap_button_input(event, shop_button_animap, "_on_shop_button_action")

func _handle_animap_button_input(event: InputEvent, animap: AnimapPlayer, action_method: String) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			# Mouse down - animate to clicked state
			if animap.has_state("clicked"):
				animap.set_state("clicked")
		else:
			# Mouse up - animate back and execute action
			if animap.has_state("clicked"):
				animap.set_state("default")
			# Execute the button's action
			call(action_method)
		animap.accept_event()
	elif event is InputEventMouseMotion:
		# Hover effects
		var is_hovering = animap.get_global_rect().has_point(animap.get_global_mouse_position())
		if is_hovering:
			if animap.has_state("hover") and animap.get_state() != "clicked":
				animap.set_state("hover")
		else:
			if animap.has_state("hover") and animap.get_state() == "hover":
				animap.set_state("default")

# --- Button Action Methods ---

func _on_play_button_action() -> void:
	print("[Main] Play button pressed")
	_on_find_match_pressed()

func _on_training_button_action() -> void:
	print("[Main] Training button pressed")
	_on_training_pressed()

func _on_deck_button_action() -> void:
	print("[Main] Deck button pressed")
	# Opens hero selection for now
	_on_find_match_pressed()

func _on_settings_button_action() -> void:
	print("[Main] Settings button pressed")
	_show_settings_popup()

func _on_shop_button_action() -> void:
	print("[Main] Shop button pressed")
	_show_shop_popup()

# --- Placeholder Popup Functions ---

var _settings_popup: PanelContainer = null
var _shop_popup: PanelContainer = null

func _show_settings_popup() -> void:
	print("[Main] Settings button pressed")
	# Create settings popup if not exists
	if _settings_popup == null:
		_settings_popup = _create_placeholder_popup("Settings", "Settings coming soon!")
	if _settings_popup:
		_toggle_popup(_settings_popup)

func _show_shop_popup() -> void:
	print("[Main] Shop button pressed")
	# Create shop popup if not exists
	if _shop_popup == null:
		_shop_popup = _create_placeholder_popup("Shop", "Shop coming soon!")
	if _shop_popup:
		_toggle_popup(_shop_popup)

func _create_placeholder_popup(title: String, message: String) -> PanelContainer:
	var popup = PanelContainer.new()
	popup.set_anchors_preset(Control.PRESET_CENTER)
	popup.size = Vector2(400, 300)
	
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.1, 0.1, 0.2, 0.95)
	style.set_corner_radius_all(8)
	style.set_border_width_all(2)
	style.border_color = Color(0.3, 0.3, 0.5)
	popup.add_theme_stylebox_override("panel", style)
	
	var vbox = VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	popup.add_child(vbox)
	
	var title_label = Label.new()
	title_label.text = title
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 32)
	vbox.add_child(title_label)
	
	var msg_label = Label.new()
	msg_label.text = message
	msg_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	msg_label.add_theme_font_size_override("font_size", 24)
	vbox.add_child(msg_label)
	
	var close_btn = Button.new()
	close_btn.text = "Close"
	close_btn.pressed.connect(func(): _close_popup(popup))
	vbox.add_child(close_btn)
	
	home_ui.add_child(popup)
	return popup

func _toggle_popup(popup: PanelContainer) -> void:
	if popup == null:
		return
	# Close other popup if open
	if popup == _settings_popup and _shop_popup != null:
		_shop_popup.visible = false
	elif popup == _shop_popup and _settings_popup != null:
		_settings_popup.visible = false
	
	popup.visible = not popup.visible

func _close_popup(popup: PanelContainer) -> void:
	if popup:
		popup.visible = false

func _apply_hero_select_layout() -> void:
	# Hero select scene manages its own layout via HeroSelectUI
	pass

func _apply_find_match_layout() -> void:
	# Find match UI manages its own layout
	pass

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
