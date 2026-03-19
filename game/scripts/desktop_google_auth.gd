extends Node
## Desktop Google Sign-In via server-hosted sign-in page.
## Opens the browser to the server's /sign-in/desktop page which handles
## Google OAuth via JavaScript SDK, then redirects id_token back to localhost.
## Mirrors the Android GodotGoogleSignIn plugin signal API.

signal sign_in_success(id_token: String, email: String, display_name: String)
signal sign_in_failed(error: String)
signal sign_out_complete()

var _sign_in_url: String
var _tcp_server: TCPServer
var _redirect_port: int = 0
var _pending_peer: StreamPeerTCP
var _request_buf: String

func initialize(sign_in_url: String) -> void:
	_sign_in_url = sign_in_url

func signIn() -> void:
	_stop_server()

	_tcp_server = TCPServer.new()
	for port in range(10400, 10500):
		if _tcp_server.listen(port, "127.0.0.1") == OK:
			_redirect_port = port
			break
	if _redirect_port == 0:
		sign_in_failed.emit("Cannot open local port for sign-in redirect")
		return

	OS.shell_open(_sign_in_url + "?port=" + str(_redirect_port))
	set_process(true)

func signOut() -> void:
	_stop_server()
	sign_out_complete.emit()

func _ready() -> void:
	set_process(false)

func _process(_delta: float) -> void:
	if not _tcp_server:
		return
	if not _pending_peer and _tcp_server.is_connection_available():
		_pending_peer = _tcp_server.take_connection()
		_request_buf = ""
	if not _pending_peer:
		return
	_pending_peer.poll()
	if _pending_peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return
	var avail = _pending_peer.get_available_bytes()
	if avail <= 0:
		return
	var result = _pending_peer.get_data(avail)
	if result[0] != OK:
		return
	_request_buf += result[1].get_string_from_utf8()
	if "\r\n\r\n" not in _request_buf:
		return
	_handle_request(_request_buf)

func _handle_request(raw: String) -> void:
	var first_line = raw.split("\r\n")[0]
	var parts = first_line.split(" ")
	if parts.size() < 2:
		_pending_peer = null
		return
	var path = parts[1]
	# Ignore non-callback requests (e.g. /favicon.ico)
	if not path.begins_with("/callback?"):
		_send_response("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
		_pending_peer = null
		return

	var qs = path.split("?", true, 1)[1]
	var params = _parse_qs(qs)

	var id_token = params.get("id_token", "").uri_decode()
	var email = params.get("email", "").uri_decode()
	var display_name = params.get("display_name", "").uri_decode()

	if id_token.is_empty():
		_respond_html("Error", "No token received.")
		_stop_server()
		sign_in_failed.emit("No id_token in redirect")
		return

	_respond_html("Signed in!", "You can close this tab and return to VanGambit.")
	_stop_server()
	sign_in_success.emit(id_token, email, display_name)

# --- Helpers ---

func _parse_qs(qs: String) -> Dictionary:
	var out := {}
	for pair in qs.split("&"):
		var kv = pair.split("=", true, 1)
		if kv.size() == 2:
			out[kv[0]] = kv[1]
	return out

func _respond_html(title: String, body_text: String) -> void:
	var html = "<html><head><title>%s</title>" % title
	html += "<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;"
	html += "align-items:center;height:100vh;margin:0;background:#111;color:#fff;text-align:center;}"
	html += "</style></head><body><h2>%s</h2></body></html>" % body_text
	_send_response("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: %d\r\n\r\n%s" % [html.length(), html])

func _send_response(resp: String) -> void:
	if _pending_peer:
		_pending_peer.put_data(resp.to_utf8_buffer())

func _stop_server() -> void:
	set_process(false)
	_pending_peer = null
	_request_buf = ""
	if _tcp_server:
		_tcp_server.stop()
		_tcp_server = null
	_redirect_port = 0
