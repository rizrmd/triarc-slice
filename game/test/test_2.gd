extends SceneTree
## Test harness for Task 2: Main Screen with Panning Video Background

var _frame: int = 0
var _main: Control = null
var _video: VideoStreamPlayer = null

func _initialize() -> void:
	print("Test 2: Main Screen with Panning Video Background")
	var scene: PackedScene = load("res://scenes/main.tscn")
	_main = scene.instantiate()
	root.add_child(_main)
	_video = _main.get_node("VideoClip/VideoBackground")

func _process(delta: float) -> bool:
	_frame += 1

	match _frame:
		30:
			# After 30 frames, verify Login view is active
			var login_ui: Control = _main.get_node("LoginUI")
			var home_ui: Control = _main.get_node("HomeUI")
			var fm_ui: Control = _main.get_node("FindMatchUI")
			if login_ui.visible:
				print("ASSERT PASS: Login UI is visible on start")
			else:
				print("ASSERT FAIL: Login UI should be visible on start")
			if not home_ui.visible:
				print("ASSERT PASS: Home UI is hidden on start")
			else:
				print("ASSERT FAIL: Home UI should be hidden on start")
			if not fm_ui.visible:
				print("ASSERT PASS: FindMatch UI is hidden on start")
			else:
				print("ASSERT FAIL: FindMatch UI should be hidden on start")
			# Check video pan position (Login = left = x=0)
			var vx: float = _video.position.x
			if abs(vx - 0.0) < 1.0:
				print("ASSERT PASS: Video panned to left (Login) x=" + str(vx))
			else:
				print("ASSERT FAIL: Video should be at x=0 for Login, got x=" + str(vx))

		60:
			# Simulate pressing Login button -> transition to Home
			print("Action: Pressing Login button")
			var login_btn: Button = _main.get_node("LoginUI/LoginButton")
			login_btn.pressed.emit()

		120:
			# After transition, verify Home view
			var home_ui: Control = _main.get_node("HomeUI")
			if home_ui.visible:
				print("ASSERT PASS: Home UI is visible after login")
			else:
				print("ASSERT FAIL: Home UI should be visible after login")
			var vx: float = _video.position.x
			if abs(vx - (-420.0)) < 1.0:
				print("ASSERT PASS: Video panned to center (Home) x=" + str(vx))
			else:
				print("ASSERT FAIL: Video should be at x=-420 for Home, got x=" + str(vx))

		150:
			# Simulate pressing Find Match button
			print("Action: Pressing Find Match button")
			var fm_btn: Button = _main.get_node("HomeUI/FindMatchButton")
			fm_btn.pressed.emit()

		210:
			# Verify Find Match view
			var fm_ui: Control = _main.get_node("FindMatchUI")
			if fm_ui.visible:
				print("ASSERT PASS: FindMatch UI is visible")
			else:
				print("ASSERT FAIL: FindMatch UI should be visible")
			var vx: float = _video.position.x
			if abs(vx - (-840.0)) < 1.0:
				print("ASSERT PASS: Video panned to right (FindMatch) x=" + str(vx))
			else:
				print("ASSERT FAIL: Video should be at x=-840 for FindMatch, got x=" + str(vx))

		240:
			# Press Back button -> Home
			print("Action: Pressing Back button")
			var back_btn: Button = _main.get_node("FindMatchUI/BackButton")
			back_btn.pressed.emit()

		300:
			# Verify back at Home
			var home_ui: Control = _main.get_node("HomeUI")
			if home_ui.visible:
				print("ASSERT PASS: Home UI visible after Back")
			else:
				print("ASSERT FAIL: Home UI should be visible after Back")
			var vx: float = _video.position.x
			if abs(vx - (-420.0)) < 1.0:
				print("ASSERT PASS: Video panned back to center (Home) x=" + str(vx))
			else:
				print("ASSERT FAIL: Video should be at x=-420 for Home, got x=" + str(vx))

		330:
			# Press Logout -> Login
			print("Action: Pressing Logout button")
			var logout_btn: Button = _main.get_node("HomeUI/LogoutButton")
			logout_btn.pressed.emit()

		390:
			# Verify back at Login
			var login_ui: Control = _main.get_node("LoginUI")
			if login_ui.visible:
				print("ASSERT PASS: Login UI visible after Logout")
			else:
				print("ASSERT FAIL: Login UI should be visible after Logout")
			var vx: float = _video.position.x
			if abs(vx - 0.0) < 1.0:
				print("ASSERT PASS: Video panned back to left (Login) x=" + str(vx))
			else:
				print("ASSERT FAIL: Video should be at x=0 for Login, got x=" + str(vx))

			# Check video is playing
			if _video.is_playing():
				print("ASSERT PASS: Video is playing continuously")
			else:
				print("ASSERT FAIL: Video should be playing continuously")

			print("Test 2 complete.")

	return false
