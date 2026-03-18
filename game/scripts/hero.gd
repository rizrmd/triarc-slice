extends Control
## Hero - Displays a hero with layered sprites, HP bar, and status effects

@onready var bg_sprite: Sprite2D = $BGSprite
@onready var shadow_sprite: Sprite2D = $ShadowSprite
@onready var char_sprite: Sprite2D = $CharSprite
@onready var hp_bar: ProgressBar = $HPBar
@onready var cast_bar: ProgressBar = $CastBar
@onready var status_container: HBoxContainer = $StatusContainer
@onready var floating_text_origin: Marker2D = $FloatingTextOrigin

var hero_instance_id: String = ""
var hero_slug: String = ""
var hero_name: String = ""
var team: int = 0
var slot_index: int = 0
var max_hp: int = 100
var current_hp: int = 100
var is_alive: bool = true
var is_enemy: bool = false

var _tween_hp: Tween = null

func _ready():
	_cast_bar.visible = false
	_update_hp_display()

func setup(data: Dictionary, is_enemy_team: bool = false):
	hero_instance_id = data.get("hero_instance_id", "")
	hero_slug = data.get("hero_slug", "")
	team = data.get("team", 0)
	slot_index = data.get("slot_index", 0)
	is_enemy = is_enemy_team
	
	var hero_def = GameState.get_hero_def(hero_slug)
	hero_name = hero_def.get("name", hero_slug)
	max_hp = hero_def.get("max_hp", 1000)
	
	# Load sprites
	_load_sprites()
	
	# Set tint
	var tint = hero_def.get("tint", Color.WHITE)
	char_sprite.modulate = tint
	
	# Initial HP
	current_hp = data.get("hp_current", max_hp)
	max_hp = data.get("hp_max", max_hp)
	is_alive = data.get("alive", true)
	_update_hp_display()
	
	if not is_alive:
		_set_dead_visuals()

func _load_sprites():
	# Load hero images from data folder
	var base_path = "res://data/hero/%s/img/" % hero_slug
	
	# Background
	var bg_path = base_path + "char-bg.webp"
	if ResourceLoader.exists(bg_path):
		bg_sprite.texture = load(bg_path)
	
	# Shadow (pose)
	var shadow_path = base_path + "pose-shadow.webp"
	if ResourceLoader.exists(shadow_path):
		shadow_sprite.texture = load(shadow_path)
	
	# Character (pose)
	var char_path = base_path + "pose-char-fg.webp"
	if ResourceLoader.exists(char_path):
		char_sprite.texture = load(char_path)

func update_state(data: Dictionary):
	var new_hp = data.get("hp_current", current_hp)
	var new_alive = data.get("alive", is_alive)
	
	if new_hp != current_hp:
		var delta = new_hp - current_hp
		if delta != 0:
			_show_floating_text(delta)
		_tween_hp_change(new_hp)
	
	if not new_alive and is_alive:
		_set_dead_visuals()
	
	is_alive = new_alive
	
	# Update busy state (casting)
	var busy_until = data.get("busy_until", 0)
	var now = Time.get_ticks_msec()
	if busy_until > now:
		_show_casting(busy_until - now)

func _tween_hp_change(new_hp: int):
	if _tween_hp and _tween_hp.is_valid():
		_tween_hp.kill()
	
	_tween_hp = create_tween()
	_tween_hp.set_ease(Tween.EASE_OUT)
	_tween_hp.set_trans(Tween.TRANS_CUBIC)
	_tween_hp.tween_method(_set_hp_value, current_hp, new_hp, 0.3)
	current_hp = new_hp

func _set_hp_value(value: int):
	current_hp = value
	_update_hp_display()

func _update_hp_display():
	hp_bar.max_value = max_hp
	hp_bar.value = current_hp
	
	# Color based on HP percentage
	var pct = float(current_hp) / max_hp
	if pct > 0.6:
		hp_bar.modulate = Color.GREEN
	elif pct > 0.3:
		hp_bar.modulate = Color.YELLOW
	else:
		hp_bar.modulate = Color.RED

func _set_dead_visuals():
	char_sprite.modulate = Color(0.3, 0.3, 0.3, 0.5)
	bg_sprite.modulate = Color(0.3, 0.3, 0.3, 0.5)
	shadow_sprite.visible = false

func _show_floating_text(amount: int):
	var text = FloatingText.new()
	text.position = floating_text_origin.position
	add_child(text)
	
	if amount > 0:
		text.show_heal(amount)
	else:
		text.show_damage(abs(amount))

func _show_casting(duration_ms: int):
	_cast_bar.visible = true
	_cast_bar.max_value = duration_ms
	_cast_bar.value = duration_ms
	
	var tween = create_tween()
	tween.tween_property(_cast_bar, "value", 0, duration_ms / 1000.0)
	tween.tween_callback(func(): _cast_bar.visible = false)

func show_cast_indicator(progress: float):
	"""Show casting progress from 0 to 1"""
	_cast_bar.visible = true
	_cast_bar.max_value = 1.0
	_cast_bar.value = progress

func hide_cast_indicator():
	_cast_bar.visible = false

func add_status_icon(status_kind: String):
	# TODO: Add status effect icons (stun, shield, buff, etc.)
	var icon = ColorRect.new()
	icon.custom_minimum_size = Vector2(24, 24)
	icon.color = _get_status_color(status_kind)
	status_container.add_child(icon)

func clear_status_icons():
	for child in status_container.get_children():
		child.queue_free()

func _get_status_color(kind: String) -> Color:
	match kind:
		"stun": return Color.PURPLE
		"shield": return Color.BLUE
		"attack_buff": return Color.ORANGE
		"defense_buff": return Color.GREEN
		"dot": return Color.RED
		"hot": return Color.CYAN
		_: return Color.WHITE

func get_slot_index() -> int:
	return slot_index

func is_dead() -> bool:
	return not is_alive

class FloatingText:
	extends Label
	
	func _init():
		horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		modulate = Color.WHITE
	
	func show_damage(amount: int):
		text = "-%d" % amount
		modulate = Color.RED
		_animate()
	
	func show_heal(amount: int):
		text = "+%d" % amount
		modulate = Color.GREEN
		_animate()
	
	func _animate():
		var tween = create_tween()
		tween.parallel().tween_property(self, "position:y", position.y - 100, 1.0)
		tween.parallel().tween_property(self, "modulate:a", 0.0, 1.0)
		tween.tween_callback(queue_free)
