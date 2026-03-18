# VanGambit

## Dimension: 2D

## Input Actions

| Action | Keys |
|--------|------|
| touch | Touch screen |

## Scenes

### Loading
- **File:** res://scenes/loading.tscn
- **Root type:** Control
- **Children:** ColorRect (background), VideoStreamPlayer (logo video)

### Main
- **File:** res://scenes/main.tscn
- **Root type:** Control
- **Children:** VideoStreamPlayer (background video, 1920x1920), Control (LoginUI), Control (HomeUI), Control (FindMatchUI)

## Scripts

### LoadingScreen
- **File:** res://scripts/loading_screen.gd
- **Extends:** Control
- **Attaches to:** Loading:Loading
- **Signals received:** VideoStreamPlayer.finished -> _on_video_finished

### Main
- **File:** res://scripts/main.gd
- **Extends:** Control
- **Attaches to:** Main:Main
- **Signals emitted:** view_changed(view_name)

## Signal Map

- Loading:VideoStreamPlayer.finished -> LoadingScreen._on_video_finished
- Main:LoginUI/LoginButton.pressed -> Main._on_login_pressed
- Main:HomeUI/FindMatchButton.pressed -> Main._on_find_match_pressed
- Main:HomeUI/LogoutButton.pressed -> Main._on_logout_pressed
- Main:FindMatchUI/BackButton.pressed -> Main._on_back_pressed

## Asset Hints

- Logo video (assets/ui/logo.ogv — splash screen animation)
- Main background video (assets/ui/main.ogv — 1:1 square, panning background for all views)
