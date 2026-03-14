extends RefCounted
class_name GameServerClient

const DEFAULT_SERVER_URL := "wss://sg.vangambit.com"
const CLIENT_CONFIG_PATH := "res://data/client-config.cfg"
const SESSION_PATH_PATTERN := "user://game_session_%d.cfg"

var server_url: String = DEFAULT_SERVER_URL
var player_id: String = ""
var current_match_id: String = ""
var current_team: int = 0
var display_name: String = ""
var session_slot: int = 1
var session_path: String = ""
var ws: WebSocketPeer = null
var connected: bool = false
var message_queue: Array = []

signal connected_to_server(player_id: String)
signal disconnected_from_server()
signal profile_updated(profile: Dictionary)
signal matchmaking_queued()
signal matchmaking_left()
signal match_state_updated(match_data: Dictionary, players: Array, team_states: Array, heroes: Array, hand: Array, statuses: Array, casts: Array)
signal match_found(match_id: String, team: int)
signal event_received(event_type: String, data: Dictionary)
signal error_received(code: String, message: String)
signal match_history_received(matches: Array)
signal leaderboard_received(entries: Array)
signal player_stats_received(stats: Dictionary)

func _init() -> void:
	load_client_config()
	configure_session_slot(1)

func configure_session_slot(slot: int) -> void:
	session_slot = max(slot, 1)
	session_path = SESSION_PATH_PATTERN % session_slot

func load_client_config() -> void:
	var config := ConfigFile.new()
	var err := config.load(CLIENT_CONFIG_PATH)
	if err != OK:
		server_url = DEFAULT_SERVER_URL
		return
	server_url = str(config.get_value("network", "server_url", DEFAULT_SERVER_URL)).strip_edges()
	if server_url.is_empty():
		server_url = DEFAULT_SERVER_URL

func load_session() -> bool:
	var config := ConfigFile.new()
	var err := config.load(session_path)
	if err != OK:
		return false
	
	player_id = str(config.get_value("session", "player_id", ""))
	display_name = str(config.get_value("session", "display_name", ""))
	return not player_id.is_empty()

func save_session() -> void:
	var config := ConfigFile.new()
	config.set_value("session", "player_id", player_id)
	config.set_value("session", "display_name", display_name)
	config.save(session_path)

func connect_to_server() -> bool:
	if connected:
		return true
	
	ws = WebSocketPeer.new()
	# Append /ws path if not already present
	var ws_url := server_url
	if not ws_url.ends_with("/ws"):
		ws_url = ws_url.rstrip("/") + "/ws"
	
	var err := ws.connect_to_url(ws_url)
	if err != OK:
		push_error("Failed to connect to WebSocket server: %s" % err)
		return false
	
	return true

func disconnect_from_server() -> void:
	if ws:
		ws.close()
	ws = null
	connected = false
	player_id = ""
	current_match_id = ""
	current_team = 0
	disconnected_from_server.emit()

func process() -> void:
	if not ws:
		return
	
	ws.poll()
	var state = ws.get_ready_state()
	
	match state:
		WebSocketPeer.STATE_CONNECTING:
			pass
		WebSocketPeer.STATE_OPEN:
			if not connected:
				connected = true
				print("Connected to game server")
			
			# Receive messages
			while ws.get_available_packet_count() > 0:
				var packet = ws.get_packet()
				var text = packet.get_string_from_utf8()
				_handle_message(text)
			
			# Send queued messages
			while not message_queue.is_empty():
				var msg = message_queue.pop_front()
				_send_raw(msg)
		
		WebSocketPeer.STATE_CLOSING, WebSocketPeer.STATE_CLOSED:
			var code = ws.get_close_code()
			var reason = ws.get_close_reason()
			print("WebSocket closed: %s - %s" % [code, reason])
			ws = null
			if connected:
				connected = false
				disconnected_from_server.emit()

func _handle_message(text: String) -> void:
	var json = JSON.new()
	if json.parse(text) != OK:
		push_error("Failed to parse server message: %s" % text)
		return
	
	var msg = json.data
	if not msg is Dictionary:
		push_error("Invalid message format")
		return
	
	var msg_type = str(msg.get("type", ""))
	
	match msg_type:
		"connected":
			player_id = str(msg.get("player_id", ""))
			save_session()
			connected_to_server.emit(player_id)
		
		"profile_updated":
			var profile = msg.get("profile", {})
			display_name = str(profile.get("display_name", ""))
			save_session()
			profile_updated.emit(profile)
		
		"matchmaking_queued":
			matchmaking_queued.emit()
		
		"matchmaking_left":
			matchmaking_left.emit()
		
		"state_update":
			# Server sends flat structure, not nested under "data"
			var match_data = msg.get("match", {})
			var players = msg.get("players", [])
			var team_states = msg.get("team_states", [])
			var heroes = msg.get("heroes", [])
			var hand = msg.get("hand", [])
			var statuses = msg.get("statuses", [])
			var casts = msg.get("casts", [])
			match_state_updated.emit(match_data, players, team_states, heroes, hand, statuses, casts)
		
		"match_found":
			var match_id = str(msg.get("match_id", ""))
			var team = int(msg.get("team", 0))
			current_match_id = match_id
			current_team = team
			match_found.emit(match_id, team)
		
		"event":
			var event_type = str(msg.get("event_type", ""))
			var data = msg.get("data", {})
			event_received.emit(event_type, data)
		
		"error":
			var code = str(msg.get("code", ""))
			var message = str(msg.get("message", ""))
			error_received.emit(code, message)
		
		"match_history":
			var matches = msg.get("matches", [])
			match_history_received.emit(matches)
		
		"leaderboard":
			var entries = msg.get("entries", [])
			leaderboard_received.emit(entries)
		
		"player_stats":
			var stats = msg.get("stats", {})
			player_stats_received.emit(stats)
		
		_:
			print("Unknown message type: %s" % msg_type)

func _send_raw(text: String) -> void:
	if ws and connected:
		ws.send_text(text)
	else:
		message_queue.append(text)

func _send_message(msg: Dictionary) -> void:
	var json_text = JSON.stringify(msg)
	_send_raw(json_text)

# ============================================================================
# API Methods
# ============================================================================

func register_profile(name: String) -> void:
	_send_message({
		"type": "upsert_profile",
		"display_name": name
	})

func queue_for_matchmaking(hero_slug_1: String, hero_slug_2: String, hero_slug_3: String) -> void:
	_send_message({
		"type": "queue_matchmaking",
		"hero_slug_1": hero_slug_1,
		"hero_slug_2": hero_slug_2,
		"hero_slug_3": hero_slug_3
	})

func leave_matchmaking() -> void:
	# The current server removes a player from matchmaking on disconnect.
	disconnect_from_server()
	matchmaking_left.emit()

func cast_action(caster_slot: int, hand_slot_index: int, target_slot: int = 0, target_side: String = "", target_override_rule: String = "") -> void:
	if current_match_id.is_empty():
		push_error("Not in a match")
		return
	var payload := {
		"type": "cast_action",
		"match_id": current_match_id,
		"caster_slot": caster_slot,
		"hand_slot_index": hand_slot_index
	}
	if target_slot > 0:
		payload["target_slot"] = target_slot
	if not target_side.is_empty():
		payload["target_side"] = target_side
	if not target_override_rule.is_empty():
		payload["target_override_rule"] = target_override_rule
	_send_message(payload)

func reroll_hand() -> void:
	if current_match_id.is_empty():
		push_error("Not in a match")
		return
	_send_message({
		"type": "reroll_hand",
		"match_id": current_match_id
	})

func request_state() -> void:
	# State updates are pushed automatically by the server
	# after cast actions and periodically
	pass

func get_match_history(limit: int = 10, offset: int = 0) -> void:
	_send_message({
		"type": "get_match_history",
		"limit": limit,
		"offset": offset
	})

func get_leaderboard(limit: int = 10) -> void:
	_send_message({
		"type": "get_leaderboard",
		"limit": limit
	})

func get_player_stats(target_player_id: String) -> void:
	_send_message({
		"type": "get_player_stats",
		"target_player_id": target_player_id
	})
