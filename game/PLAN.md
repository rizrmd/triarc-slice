# Game Plan: VanGambit

## Game Description

Android mobile game (portrait 1080x1920, 9:16). After the loading/splash screen (logo video), the game transitions to a single-screen app with three logical views — Login, Home, and Find Match — all sharing one scene. A background video (assets/ui/main.ogv, 1:1 square aspect) plays at full viewport height, with the camera panning horizontally across it to reveal different sections:

- **Login:** Video panned to left-most position. Login UI overlaid.
- **Home:** Video panned to center. Main menu UI overlaid.
- **Find Match:** Video panned to right-most position. Matchmaking UI overlaid.

Transitions between views animate the video pan smoothly. The video is wider than the viewport (square video in portrait viewport), so panning reveals different portions.

## 1. Loading Screen & Project Setup
- **Depends on:** (none)
- **Status:** done
- **Targets:** project.godot, scenes/loading.tscn, scenes/main.tscn, scripts/loading_screen.gd, scripts/main.gd
- **Goal:** Set up the Godot project configured for Android mobile (portrait 1080x1920) and implement the Loading/Splash screen that plays the logo video and transitions to the main scene.
- **Requirements:**
  - Project viewport: 1080x1920 portrait, stretch mode "canvas_items", aspect "keep"
  - Loading scene: black ColorRect background, VideoStreamPlayer playing logo.ogv
  - When video finishes, auto-transition to main scene
- **Verify:** Loading screen shows logo video. After video ends, transitions to main scene.

## 2. Main Screen with Panning Video Background
- **Depends on:** 1
- **Status:** done
- **Targets:** scenes/main.tscn, scripts/main.gd
- **Goal:** Replace the placeholder main scene with the single-screen app that has a panning video background and three UI states (Login, Home, Find Match).
- **Requirements:**
  - VideoStreamPlayer plays assets/ui/main.ogv looping, at full viewport height (1920px). Since the video is 1:1 (square), it renders at 1920x1920 within the 1080x1920 viewport — wider than the screen.
  - Three logical view positions map to horizontal pan offsets on the video:
    - Login: video positioned so left edge is visible (left-most pan)
    - Home: video centered horizontally (middle pan)
    - Find Match: video positioned so right edge is visible (right-most pan)
  - Smooth animated horizontal panning (Tween) when transitioning between views (~0.5s ease-in-out)
  - Login view: placeholder UI elements (title, "Login" button that transitions to Home)
  - Home view: placeholder UI elements (title, "Find Match" button that transitions to Find Match, "Logout" button that transitions back to Login)
  - Find Match view: placeholder UI elements (title, "Searching..." label, "Back" button that transitions to Home)
  - The video plays continuously behind all views — only the pan offset and overlay UI change
  - Start on Login view when scene loads
- **Verify:** Video background plays fullscreen height. Login screen shows with video panned left. Tapping Login pans video to center showing Home. Tapping Find Match pans video to right. Back button pans back. Transitions are smooth.

## 3. Presentation Video
- **Depends on:** 2
- **Status:** pending
- **Targets:** test/presentation.gd, screenshots/presentation/gameplay.mp4
- **Goal:** Create a ~30-second cinematic video showcasing the completed game.
- **Requirements:**
  - Write test/presentation.gd — a SceneTree script (extends SceneTree)
  - Showcase the loading screen video, then the main screen panning between Login, Home, and Find Match
  - ~900 frames at 30 FPS (30 seconds)
  - Use Video Capture from godot-capture (AVI via --write-movie, convert to MP4 with ffmpeg)
  - Output: screenshots/presentation/gameplay.mp4
  - 2D games: camera pans and smooth scrolling, tight viewport framing
- **Verify:** A smooth MP4 video showing polished gameplay with no visual glitches.
