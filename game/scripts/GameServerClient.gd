extends RefCounted
class_name GameServerClient

const DEFAULT_SERVER_URL := "ws://127.0.0.1:8080"
const SESSION_PATH := "user://game_session.cfg"

var server_url: String = DEFAULT_SERVER_URL
var player_id: String = ""
var current_match_id: String = ""
var ws: WebSocketPeer = null
var connected: bool = false
var message_queue: Array = []
var _pending_callbacks: Dictionary = {}
var _request_id_counter: int = 0

signal connected_to_server(player_id: String)
signal disconnected_from_server()
signal match_state_updated(state: Dictionary)
signal match_found(match_id: String, team: int)
signal event_received(event_type: String, data: Dictionary)
signal error_received(code: String, message: String)

func configure(url: String) -> void:
	server_url = url.strip_edges()

func load_session() -> bool:
	var config := ConfigFile.new()
	var err := config.load(SESSION_PATH)
	if err != OK:
		return false
	
	player_id = str(config.get_value("session", "player_id", ""))
	server_url = str(config.get_value("session", "server_url", server_url))
	return not player_id.is_empty()

func save_session() -> void:
	var config := ConfigFile.new()
	config.set_value("session", "player_id", player_id)
	config.set_value("session", "server_url", server_url)
	config.save(SESSION_PATH)

func connect_to_server() -> bool:
	if connected:
		return true
	
	ws = WebSocketPeer.new()
	var err := ws.connect_to_url(server_url)
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
			if connected:
				connected = false
				disconnected_from_server.emit()
			var code = ws.get_close_code()
			var reason = ws.get_close_reason()
			print("WebSocket closed: %s - %s" % [code, reason])

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
		
		"state_update":
			match_state_updated.emit(msg.get("data", {}))
		
		"match_found":
			var match_id = str(msg.get("match_id", ""))
			var team = int(msg.get("team", 0))
			current_match_id = match_id
			match_found.emit(match_id, team)
		
		"event":
			var event_type = str(msg.get("event_type", ""))
			var data = msg.get("data", {})
			event_received.emit(event_type, data)
		
		"error":
			var code = str(msg.get("code", ""))
			var message = str(msg.get("message", ""))
			error_received.emit(code, message)
		
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

func register_profile(display_name: String) -> void:
	_send_message({
		"type": "upsert_profile",
		"display_name": display_name
	})

func queue_for_matchmaking(hero_slug_1: String, hero_slug_2: String, hero_slug_3: String) -> void:
	_send_message({
		"type": "queue_matchmaking",
		"hero_slug_1": hero_slug_1,
		"hero_slug_2": hero_slug_2,
		"hero_slug_3": hero_slug_3
	})

func leave_matchmaking() -> void:
	_send_message({
		"type": "leave_matchmaking"
	})

func select_caster(slot_index: int) -> void:
	if current_match_id.is_empty():
		push_error("Not in a match")
		return
	_send_message({
		"type": "select_caster",
		"match_id": current_match_id,
		"slot_index": slot_index
	})

func cast_action(hand_slot_index: int, target_slot: int) -> void:
	if current_match_id.is_empty():
		push_error("Not in a match")
		return
	_send_message({
		"type": "cast_action",
		"match_id": current_match_id,
		"hand_slot_index": hand_slot_index,
		"target_slot": target_slot
	})

func reroll_hand() -> void:
	if current_match_id.is_empty():
		push_error("Not in a match")
		return
	_send_message({
		"type": "reroll_hand",
		"match_id": current_match_id
	})

func request_state() -> void:
	if current_match_id.is_empty():
		push_error("Not in a match")
		return
	_send_message({
		"type": "get_state",
		"match_id": current_match_id
	})
