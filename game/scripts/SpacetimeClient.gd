extends RefCounted
class_name SpacetimeClient

const DEFAULT_BASE_URL := "http://127.0.0.1:4000"
const DEFAULT_DATABASE := "vg-server-local"
const SESSION_PATH := "user://spacetimedb_session.cfg"

var base_url: String = DEFAULT_BASE_URL
var database_name: String = DEFAULT_DATABASE
var identity: String = ""
var token: String = ""

func configure(next_base_url: String, next_database_name: String) -> void:
	base_url = next_base_url.strip_edges().trim_suffix("/")
	database_name = next_database_name.strip_edges()

func load_session() -> bool:
	var config := ConfigFile.new()
	var err := config.load(SESSION_PATH)
	if err != OK:
		return false

	identity = str(config.get_value("session", "identity", ""))
	token = str(config.get_value("session", "token", ""))
	base_url = str(config.get_value("session", "base_url", base_url))
	database_name = str(config.get_value("session", "database_name", database_name))
	return not token.is_empty()

func save_session() -> void:
	var config := ConfigFile.new()
	config.set_value("session", "identity", identity)
	config.set_value("session", "token", token)
	config.set_value("session", "base_url", base_url)
	config.set_value("session", "database_name", database_name)
	config.save(SESSION_PATH)

func ensure_identity(owner: Node) -> Dictionary:
	if not token.is_empty():
		return {"ok": true, "identity": identity, "token": token}

	var response := await _request_json(
		owner,
		base_url + "/v1/identity",
		HTTPClient.METHOD_POST,
		[],
		""
	)
	if not response.ok:
		return response

	identity = str(response.body.get("identity", ""))
	token = str(response.body.get("token", ""))
	save_session()
	return {"ok": true, "identity": identity, "token": token}

func call_reducer(owner: Node, reducer_name: String, args: Array) -> Dictionary:
	var identity_result := await ensure_identity(owner)
	if not identity_result.ok:
		return identity_result

	var headers := [
		"Authorization: Bearer %s" % token,
		"Content-Type: application/json",
	]
	var payload := JSON.stringify(args)
	var response := await _request_text(
		owner,
		"%s/v1/database/%s/call/%s" % [base_url, database_name, reducer_name],
		HTTPClient.METHOD_POST,
		headers,
		payload
	)
	if not response.ok:
		return response

	var next_token := str(response.headers_map.get("spacetime-identity-token", ""))
	var next_identity := str(response.headers_map.get("spacetime-identity", ""))
	if not next_token.is_empty():
		token = next_token
	if not next_identity.is_empty():
		identity = next_identity
	save_session()
	return {"ok": true}

func sql(owner: Node, query: String) -> Dictionary:
	var identity_result := await ensure_identity(owner)
	if not identity_result.ok:
		return identity_result

	var headers := [
		"Authorization: Bearer %s" % token,
		"Content-Type: text/plain",
	]
	var response := await _request_json(
		owner,
		"%s/v1/database/%s/sql" % [base_url, database_name],
		HTTPClient.METHOD_POST,
		headers,
		query
	)
	if not response.ok:
		return response

	var next_token := str(response.headers_map.get("spacetime-identity-token", ""))
	var next_identity := str(response.headers_map.get("spacetime-identity", ""))
	if not next_token.is_empty():
		token = next_token
	if not next_identity.is_empty():
		identity = next_identity
	save_session()

	var rows: Array = []
	for result_set in response.body:
		rows.append_array(_rows_to_dicts(result_set))
	return {"ok": true, "rows": rows}

func _request_json(owner: Node, url: String, method: int, headers: Array, body: String) -> Dictionary:
	var response := await _request_text(owner, url, method, headers, body)
	if not response.ok:
		return response

	var parsed = JSON.parse_string(response.text)
	if parsed == null:
		return {
			"ok": false,
			"error": "Invalid JSON response from server",
			"status_code": response.status_code,
		}
	return {
		"ok": true,
		"status_code": response.status_code,
		"body": parsed,
		"headers_map": response.headers_map,
	}

func _request_text(owner: Node, url: String, method: int, headers: Array, body: String) -> Dictionary:
	var request := HTTPRequest.new()
	owner.add_child(request)

	var err := request.request(url, headers, method, body)
	if err != OK:
		request.queue_free()
		return {"ok": false, "error": "HTTP request failed to start: %s" % err}

	var result = await request.request_completed
	request.queue_free()

	var result_code: int = result[0]
	var response_code: int = result[1]
	var response_headers: PackedStringArray = result[2]
	var response_body: PackedByteArray = result[3]
	var text := response_body.get_string_from_utf8()
	var headers_map := _headers_to_map(response_headers)

	if result_code != HTTPRequest.RESULT_SUCCESS:
		return {
			"ok": false,
			"error": "HTTP transport failed: %s" % result_code,
			"status_code": response_code,
			"text": text,
			"headers_map": headers_map,
		}

	if response_code < 200 or response_code >= 300:
		return {
			"ok": false,
			"error": text if not text.is_empty() else "HTTP %s" % response_code,
			"status_code": response_code,
			"text": text,
			"headers_map": headers_map,
		}

	return {
		"ok": true,
		"status_code": response_code,
		"text": text,
		"headers_map": headers_map,
	}

func _headers_to_map(response_headers: PackedStringArray) -> Dictionary:
	var headers_map := {}
	for header_line in response_headers:
		var parts := header_line.split(":", false, 1)
		if parts.size() != 2:
			continue
		headers_map[parts[0].strip_edges().to_lower()] = parts[1].strip_edges()
	return headers_map

func _rows_to_dicts(result_set: Dictionary) -> Array:
	var schema_elements: Array = result_set.get("schema", {}).get("elements", [])
	var names: Array[String] = []
	for element in schema_elements:
		var maybe_name = element.get("name", {}).get("some", "")
		names.append(str(maybe_name))

	var dict_rows: Array = []
	for row in result_set.get("rows", []):
		var row_dict := {}
		for index in range(min(names.size(), row.size())):
			row_dict[names[index]] = _unwrap_value(row[index])
		dict_rows.append(row_dict)
	return dict_rows

func _unwrap_value(value):
	if value is Array:
		if value.size() == 1:
			return _unwrap_value(value[0])
		var output := []
		for item in value:
			output.append(_unwrap_value(item))
		return output
	if value is Dictionary:
		if value.has("some"):
			return _unwrap_value(value["some"])
		if value.has("none"):
			return null
	return value
