# Memory

## Task 1: Loading Screen
- Loading scene uses VideoStreamPlayer with logo.ogv, transitions to main scene on finished signal.

## Task 2: Main Screen with Panning Video Background
- OGV video files don't generate .import files in Godot — they load directly as VideoStreamTheora via `load()`.
- VideoStreamPlayer with `expand = true` fills its Control rect size. Set `size = Vector2(1920, 1920)` for the square video.
- Panning technique: parent Control with `clip_contents = true` clips the oversized video. Tween the VideoStreamPlayer's `position.x` to pan horizontally.
- Pan offsets for 1080x1920 viewport with 1920x1920 video: Login=0, Home=-420, FindMatch=-840 (extra width = 840px).
- `create_tween()` with `EASE_IN_OUT` + `TRANS_CUBIC` gives smooth panning feel at 0.5s duration.
- Button signals connected in `_ready()` via `get_node("ButtonName").pressed.connect(handler)`.
