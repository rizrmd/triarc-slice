extends Control

signal back_requested

@onready var button_container: VBoxContainer = $ButtonContainer
@onready var back_button: Button = $BackButton
@onready var vfx_container: Control = $VfxContainer

var _status_label: Label = null
var _debug_label: Label = null

const CHARGE_EFFECT := "res://data/action/charge/VFX/Card Action VFX - Charge.efkefc"
const ICE_NOVA_EFFECT := "res://data/action/ice-nova/VFX/Card Action VFX - Ice Nova.efkefc"
const TIME_SLIP_EFFECT := "res://data/action/time-slip/vfx/time-slip.efkefc"

func _ready() -> void:
	print("[VFX TEST] _ready() called!")
	
	# Create status label
	_status_label = Label.new()
	_status_label.name = "StatusLabel"
	_status_label.position = Vector2(50, 400)
	_status_label.size = Vector2(500, 100)
	_status_label.text = "Ready!"
	add_child(_status_label)
	
	# Create debug label
	_debug_label = Label.new()
	_debug_label.name = "DebugLabel"
	_debug_label.position = Vector2(50, 500)
	_debug_label.size = Vector2(800, 300)
	_debug_label.text = ""
	add_child(_debug_label)
	
	# Connect button signals
	var play_charge_btn = button_container.get_node("PlayChargeButton")
	var play_ice_nova_btn = button_container.get_node("PlayIceNovaButton")
	var play_time_slip_btn = button_container.get_node("PlayTimeSlipButton")
	
	back_button.pressed.connect(_on_back_pressed)
	play_charge_btn.pressed.connect(_on_play_charge)
	play_ice_nova_btn.pressed.connect(_on_play_ice_nova)
	play_time_slip_btn.pressed.connect(_on_play_time_slip)
	
	_debug("Buttons connected. Testing Effekseer...")
	_check_effekseer()
	
	_status_label.text = "Ready! Click a button."

func _check_effekseer() -> void:
	var has_emitter2d = ClassDB.class_exists("EffekseerEmitter2D")
	var has_emitter3d = ClassDB.class_exists("EffekseerEmitter3D")
	var has_effect = ClassDB.class_exists("EffekseerEffect")
	var can_instantiate = ClassDB.can_instantiate("EffekseerEmitter2D")
	
	_debug("EffekseerEmitter2D exists: %s" % has_emitter2d)
	_debug("EffekseerEmitter3D exists: %s" % has_emitter3d)
	_debug("EffekseerEffect exists: %s" % has_effect)
	_debug("Can instantiate EffekseerEmitter2D: %s" % can_instantiate)
	
	if not has_emitter2d:
		_status_label.text = "ERROR: Effekseer plugin not loaded!"
		_status_label.modulate = Color.RED

func _play_effect(effect_path: String, emitter_name: String, display_name: String) -> void:
	_debug("=== _play_effect called ===")
	_debug("Effect path: %s" % effect_path)
	
	_status_label.text = "Loading %s..." % display_name
	
	# Check file exists
	if not FileAccess.file_exists(effect_path):
		_status_label.text = "ERROR: File not found!"
		_debug("File not found: %s" % effect_path)
		return
	_debug("File exists: OK")
	
	# Load effect
	var effect_res = load(effect_path)
	if not effect_res:
		_status_label.text = "ERROR: Failed to load effect!"
		_debug("Failed to load effect resource")
		return
	_debug("Effect loaded: %s" % effect_res)
	
	# Check if can instantiate
	if not ClassDB.can_instantiate("EffekseerEmitter2D"):
		_status_label.text = "ERROR: Cannot instantiate emitter!"
		_debug("Cannot instantiate EffekseerEmitter2D")
		return
	_debug("Can instantiate: OK")
	
	# Create emitter
	var emitter = ClassDB.instantiate("EffekseerEmitter2D")
	if not emitter:
		_status_label.text = "ERROR: Failed to create emitter!"
		_debug("Failed to instantiate emitter")
		return
	_debug("Emitter created: %s" % emitter)
	
	emitter.name = emitter_name
	emitter.position = Vector2(540, 1400)  # Lower part of screen
	emitter.scale = Vector2(20.0, 20.0)  # 20x bigger
	emitter.effect = effect_res
	
	vfx_container.add_child(emitter)
	_debug("Emitter added to scene")
	
	# Play
	emitter.play()
	_debug("Emitter.play() called!")
	
	_status_label.text = "%s playing!" % display_name
	
	# Auto cleanup after 5 seconds
	var cleanup_timer = get_tree().create_timer(5.0)
	cleanup_timer.timeout.connect(func():
		if is_instance_valid(emitter):
			emitter.queue_free()
		_status_label.text = "Done! Click another button."
	)

func _debug(text: String) -> void:
	print("[VFX DEBUG] %s" % text)
	if _debug_label:
		_debug_label.text += text + "\n"

func _on_back_pressed() -> void:
	print("[VFX] Back button pressed")
	# Emit signal to parent (main.gd) to handle removal instead of changing scene
	back_requested.emit()

func _on_play_charge() -> void:
	print("[VFX] Play Charge button pressed")
	_play_effect(CHARGE_EFFECT, "ChargeEmitter", "CHARGE")

func _on_play_ice_nova() -> void:
	print("[VFX] Play Ice Nova button pressed")
	_play_effect(ICE_NOVA_EFFECT, "IceNovaEmitter", "ICE NOVA")

func _on_play_time_slip() -> void:
	print("[VFX] Play Time Slip button pressed")
	_play_effect(TIME_SLIP_EFFECT, "TimeSlipEmitter", "TIME SLIP")
