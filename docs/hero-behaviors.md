# Hero Behaviors & Abilities

## Overview

Heroes are not empty vessels — they are autonomous fighters with their own attacks, skills, passives, reactions, and ultimate abilities. The player's role is strategic: choose action cards, assign hero targets, and manage energy. Everything else — the fighting — is the heroes' job.

**Player controls:**
- Action cards (drag onto heroes)
- Hero targeting (assign primary & secondary targets per hero)

**Heroes control:**
- Auto-attacks on their target
- Passive effects (always active)
- Skills (cooldown-based, fire automatically)
- Reactions (trigger on game events)
- Ultimate (charges over time/events, fires when ready)

---

## Targeting System

- **Match start:** Each hero randomly selects a primary and secondary enemy target.
- **Player override:** The player can reassign any hero's primary or secondary target at any time.
- **Auto-retarget:** If a target dies, the hero randomly picks a new one from remaining enemies. Player can override again.
- **Target references in abilities:** Abilities use keywords like `primary`, `secondary`, `attacker`, `self`, `all_enemies`, `all_allies`, `lowest_hp_ally`, `random_enemy` to determine who they affect.

---

## Ability Types

### Auto-Attack
The hero's basic attack. Fires on a cooldown (typically 2-4 seconds) at their primary target. Damage scales with the hero's attack stat and element affinity. Each hero has a unique auto-attack that reflects their identity.

### Passive
Always-on effects that modify the hero's behavior or stats. No cooldown, no activation — they simply exist. Some passives trigger on specific events (e.g., "on damage dealt, apply burn") while others are constant modifiers (e.g., "+10% defense to adjacent allies").

### Skill
Active abilities on longer cooldowns (8-20 seconds) that fire automatically when the cooldown is ready. Skills are the hero's bread and butter — consistent, reliable, impactful. Heroes may have multiple skills.

### Reaction
Abilities that trigger in response to game events. They don't have a regular cooldown cycle — instead they watch for specific conditions:
- `on_damage_taken` — hero is hit
- `on_damage_dealt` — hero deals damage
- `on_kill` — hero kills an enemy
- `on_ally_damaged` — a teammate takes damage
- `on_ally_death` — a teammate dies
- `on_hp_below_pct` — hero's HP drops below a threshold
- `on_hp_above_pct` — hero's HP rises above a threshold
- `on_status_received` — a status effect is applied to the hero
- `on_cast_received` — player uses an action card on this hero
- `on_enemy_cast` — an enemy begins casting

Reactions may have a `chance` (probability of firing) and a `cooldown_ms` (minimum time between triggers). Some reactions are `once: true` — they fire exactly once per match.

### Ultimate
The hero's most powerful ability. Charges through a specific method:
- `damage_dealt` — charges as the hero deals damage
- `damage_taken` — charges as the hero takes hits
- `ally_damage_taken` — charges when allies are hurt
- `healing_done` — charges through healing
- `kills` — charges on kills
- `time` — charges passively over time
- `casts_received` — charges when the player uses action cards on this hero

When the charge threshold is reached, the ultimate fires automatically. Ultimates are match-defining moments.

---

## Visibility

Some abilities are hidden from the player's UI until specific conditions are met. This creates moments of discovery and surprise.

- `always` — visible from match start
- `charge_above_pct` — shown when ultimate charge exceeds a percentage
- `hp_below_pct` — revealed when hero's HP drops below threshold
- `hidden_until_triggered` — invisible until it fires for the first time

---

## Hero Thoughts

Every ability has a `thought` string — a short line shown in the UI when the ability activates. This makes the hero's autonomous behavior transparent and characterful. Thoughts use `{target}` as a placeholder for the target's name.

Examples:
- "Burning {target}..." (auto-attack)
- "EVERYTHING BURNS!" (ultimate)
- "If I fall... you ALL burn with me!" (hidden reaction)

---

## Effect System

Abilities produce effects. Each effect has a `kind` and parameters:

| Kind | Parameters | Description |
|------|-----------|-------------|
| `damage` | `base_power` | Deal damage to target (scales with attack + affinity) |
| `heal` | `base_power` | Restore HP to target (scales with attack + light affinity) |
| `shield` | `base_power` | Grant shield to target (scales with defense) |
| `apply_status` | `status`, `duration_ms`, `value` | Apply a status effect |
| `cleanse` | — | Remove negative statuses from target |
| `self_buff` | `stat`, `value`, `duration_ms` | Temporarily modify own stats |
| `drain` | `base_power`, `heal_pct` | Deal damage and heal self for a percentage |

**Status types:** `stun`, `dot`, `hot`, `attack_buff`, `defense_buff`, `shield_buff`, `slow`, `silence`, `mark`

---

## Data Schema

Each hero gets an `abilities.json` file at `data/hero/{slug}/abilities.json`:

```json
{
  "abilities": [
    {
      "id": "string",
      "name": "Display Name",
      "type": "auto_attack | passive | skill | reaction | ultimate",
      "description": "Flavor text shown to player.",
      "element": "fire | ice | earth | wind | light | shadow",
      "cooldown_ms": 3000,
      "target": "primary | secondary | self | attacker | all_enemies | all_allies | lowest_hp_ally | random_enemy",
      "trigger": "on_damage_dealt | on_damage_taken | on_kill | ...",
      "trigger_value": 20,
      "chance": 0.25,
      "once": false,
      "charge": {
        "method": "damage_dealt | damage_taken | time | kills | ...",
        "threshold": 1000
      },
      "visibility": {
        "condition": "always | charge_above_pct | hp_below_pct | hidden_until_triggered",
        "value": 50
      },
      "effects": [
        {
          "kind": "damage",
          "base_power": 10
        }
      ],
      "thought": "Text with {target} placeholder"
    }
  ]
}
```

---

## Synergy System

Heroes are designed to complement each other. Synergies are emergent — they arise from how abilities interact, not from hardcoded bonuses. Examples:

- A tank's passive that draws enemy fire pairs with a damage dealer who punishes distracted enemies
- A healer's reaction to ally damage pairs with a bruiser who thrives at low HP
- A debuffer's DoT pairs with an assassin who deals bonus damage to debuffed targets

Synergies are documented per-hero below, describing which allies amplify their kit and which enemies counter them.

---

## Hero Roster

Heroes are discussed and designed one at a time. Each entry includes:
- **Identity** — role, fantasy, personality
- **Lore** — expanded backstory and motivation
- **Abilities** — full ability kit
- **Synergies** — who they pair well with, who counters them

| # | Hero | Element | Role | HP | ATK | DEF |
|---|------|---------|------|-----|-----|-----|
| 1 | Flame Warlock | Fire/Wind | Glass Cannon | 2400 | 175 | 90 |
| 2 | Iron Knight | Earth/Ice/Light | Heavy Tank | 3500 | 130 | 180 |
| 3 | Frost Queen | Ice/Wind | Control Mage | 2800 | 155 | 125 |
| 4 | Demon Empress | Shadow/Fire | Bruiser | 3100 | 160 | 125 |
| 5 | Earth Warden | Earth | Anchor Tank | 3600 | 120 | 170 |
| 6 | Gunslinger | Fire/Wind | Burst DPS | 2500 | 165 | 105 |
| 7 | Necromancer | Shadow/Ice | Death Mage | 2300 | 160 | 100 |
| 8 | Night Venom | Shadow/Earth | Assassin | 2500 | 170 | 95 |
| 9 | Princess Emberheart | Fire/Light | Fighter | 2900 | 150 | 120 |
| 10 | Spellblade Empress | Light/Multi | Battle Mage | 3000 | 145 | 135 |
| 11 | Arcane Paladin | Light/Shadow | Juggernaut | 3200 | 145 | 145 |
| 12 | Blood Alchemist | Shadow/Earth | Sustain Mage | 2900 | 145 | 110 |
| 13 | Wind Monk | Wind/Light | Evasive Fighter | 2700 | 140 | 120 |
| 14 | Tyrant Overlord | Shadow/Fire/Earth | Warlord | 3800 | 165 | 150 |
| 15 | Storm Ranger | Wind/Light | Striker | 2600 | 160 | 110 |
| 16 | Dawn Priest | Light/Fire | Healer | 2800 | 100 | 130 |
| 17 | Arc Strider | Wind/Fire | Skirmisher | 2700 | 155 | 115 |

---

### 1. Flame Warlock
*To be designed*

### 2. Iron Knight
*To be designed*

### 3. Frost Queen
*To be designed*

### 4. Demon Empress
*To be designed*

### 5. Earth Warden
*To be designed*

### 6. Gunslinger
*To be designed*

### 7. Necromancer
*To be designed*

### 8. Night Venom
*To be designed*

### 9. Princess Emberheart
*To be designed*

### 10. Spellblade Empress
*To be designed*

### 11. Arcane Paladin
*To be designed*

### 12. Blood Alchemist
*To be designed*

### 13. Wind Monk
*To be designed*

### 14. Tyrant Overlord
*To be designed*

### 15. Storm Ranger
*To be designed*

### 16. Dawn Priest
*To be designed*

### 17. Arc Strider
*To be designed*
