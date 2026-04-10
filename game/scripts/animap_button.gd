extends Control
class_name AnimapButton
## Reusable animap-based button with click detection
## Usage: Add as child of a container, call load_animap(slug)

signal pressed()

@onready var animap_player: AnimapPlayer = $AnimapPlayer
@onready var mouse_capture: Control = $MouseCapture

var _animap_slug: String = ""
var _click_disabled: bool = false

func _ready() -> void:
	mouse_capture.gui_input.connect(_on_mouse_capture_gui_input)
	animap_player.gui_input.connect(_on_animap_player_gui_input)

## Load animap by slug (e.g., "google-sign-in")
func load_animap(slug: String) -> void:
	_animap_slug = slug
	animap_player.load_animap(slug)

## Set the fit mode for the animap ("contain", "cover", "stretch")
func set_fit_mode(mode: String) -> void:
	animap_player.fit_mode = mode

## Disable click action (for testing hover without triggering action)
func set_click_disabled(disabled: bool) -> void:
	_click_disabled = disabled

## Get the underlying AnimapPlayer for external state control
func get_animap_player() -> AnimapPlayer:
	return animap_player

func _on_mouse_capture_gui_input(event: InputEvent) -> void:
	# Forward all mouse events to animap player's gui_input signal
	animap_player.emit_signal("gui_input", event)
	accept_event()

func _on_animap_player_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			animap_player.set_state("clicked")
		else:
			animap_player.set_state("default")
			if not _click_disabled:
				pressed.emit()
		animap_player.accept_event()
