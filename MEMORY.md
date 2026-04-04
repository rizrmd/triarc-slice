# Pre-Targeting Marker System - Task History

## Context
Implementing a pre-targeting marker system for the Triarc Slice game where:
- Player clicks ally hero → clicks enemy to set target
- Marker must appear on enemy that is targeted
- **Marker only visible when ally hero is SELECTED**
- **Marker invisible when ally hero is DESELECTED**
- Multiple allies targeting same enemy → markers should stack/offset

## Current Implementation

### Files Modified
- `game/scripts/hero.gd` - Hero class with marker logic
- `game/scripts/gameplay.gd` - Gameplay controller

### Core Mechanics

**gameplay.gd:**
```gdscript
# Tracks which ally hero targets which enemy slot
var _hero_targets: Dictionary = {}  # hero_slot -> enemy_slot

func _set_hero_target(hero_slot: int, enemy_slot: int):
    _hero_targets[hero_slot] = enemy_slot
    _update_target_indicators()

func _update_target_indicators():
    # Hide all markers first
    for hero in enemy_heroes.values():
        hero.show_target_marker(false)
        hero.show_target_info(false)
        hero.hide_all_pooled_markers()
    
    # Only show marker if there is a SELECTED ally hero
    if _selected_hero == null or not is_instance_valid(_selected_hero):
        return
    
    var selected_slot = _selected_hero.slot_index
    
    # Show target ONLY for the selected ally hero
    if not _hero_targets.has(selected_slot):
        return
    
    var target_slot = _hero_targets[selected_slot]
    if enemy_heroes.has(target_slot):
        var target_enemy = enemy_heroes[target_slot]
        target_enemy.show_target_marker_with_offset(true, selected_slot, 0, _selected_hero.hero_name)

func _clear_selected_hero():
    if _selected_hero and is_instance_valid(_selected_hero):
        _selected_hero.set_selected(false)
    _selected_hero = null
    _update_target_indicators()  # This hides all markers when deselected
    _update_hero_detail_placeholder()
```

**hero.gd:**
```gdscript
var _marker_pool: Dictionary = {}  # source_slot -> Control node

func show_target_marker_with_offset(show: bool, source_slot: int, offset_index: int, ally_name: String):
    if not show:
        for key in _marker_pool.keys():
            _marker_pool[key].modulate.a = 0.0
        return
    
    if not _marker_pool.has(source_slot):
        _marker_pool[source_slot] = _create_indicator_for_pool()
    
    var indicator = _marker_pool[source_slot]
    var offset_x = (source_slot - 1) * 50
    var offset_y = -70 - (offset_index * 35)
    indicator.position = Vector2(-30 + offset_x, offset_y)
    indicator.modulate.a = 1.0

func _create_indicator_for_pool() -> Control:
    var indicator = Control.new()
    indicator.name = "PooledTargetIndicator"
    # Red circle with exclamation mark
    add_child(indicator)
    indicator.modulate.a = 0.0
    return indicator
```

## User Flow
1. Player clicks ally hero → hero becomes selected
2. Player clicks enemy → target is set, marker appears on enemy
3. Player deselects ally (clicks elsewhere) → marker becomes invisible
4. Player reselects same ally → marker reappears on previously set target

## Issues Encountered

### 1. CLIP_CHILDREN_OFF Error
- **Error:** `Cannot find member "CLIP_CHILDREN_OFF" in base "Control"`
- **Cause:** Godot 4 does not have `CLIP_CHILDREN_OFF` enum
- **Fix:** Remove the line entirely (default Control behavior allows children to render outside bounds)

### 2. Marker Not Visible
- **Symptom:** Modulate.a = 1.0 set correctly, position looks right, but marker not visible
- **Attempts:**
  1. Tried adding indicator to HeroesContainer (parent) - not visible
  2. Tried using global_position - not visible
  3. Tried adding to root viewport - not visible
  4. Tried TextureRect instead of ColorRect - not visible
  5. Tried child of hero with CLIP_CHILDREN_OFF - error (fixed)
- **Root Cause:** The marker visibility logic needed to be tied to ally selection state

### 3. Marker Always Showing
- **Symptom:** Markers persisted even when ally was deselected
- **Fix:** Call `_update_target_indicators()` in `_clear_selected_hero()` to hide markers

## Current State (2026-04-05)
- ✅ Code compiles and runs without errors
- ✅ Markers visible ONLY when corresponding ally hero is selected
- ✅ Markers invisible when ally hero is deselected
- ✅ Target persists when ally is deselected/reselected
- ✅ Multiple allies targeting same enemy shows multiple markers with offset

## Git Commit History
- `552b506` fix: marker visible only when ally hero is selected
- `b1b8fc8` feat: implement pre-targeting marker system for hero selection

## Commands to Run
```bash
# Test the game
cd D:\kerja\VanGambit\triarc-slice2\triarc-slice
./game.exe
```

## Related Files
- `game/scripts/hero.gd` - Main hero script
- `game/scripts/gameplay.gd` - Gameplay controller
- `game/scenes/gameplay.tscn` - Gameplay scene (contains HeroesContainer, EnemyHeroesContainer)
