# Hero Behaviors & Abilities

## Overview

Heroes are not empty vessels — they are autonomous fighters with their own attacks, skills, passives, reactions, and ultimate abilities. The player's role is strategic: choose action cards, assign hero targets, and manage energy. Everything else — the fighting — is the heroes' job.

**Player controls:**
- Action cards (drag onto heroes)
- Hero targeting (assign primary & secondary targets per hero)

**Heroes control:**
- Skills (cooldown-based, fire automatically)
- Passive effects (always active or trigger-based)
- Reactions (trigger on game events)
- Ultimate (charges over time/events, fires when ready)

---

## Targeting System

- **Match start:** Each hero randomly selects a primary and secondary enemy target.
- **Player override:** The player can reassign any hero's primary or secondary target at any time.
- **Auto-retarget:** If a target dies, the hero randomly picks a new one from remaining enemies. Player can override again.
- **Target references in abilities:** Abilities use keywords like `primary`, `secondary`, `attacker`, `self`, `all_enemies`, `all_allies`, `lowest_hp_ally`, `random_enemy` to determine who they affect.

---

## Ability Roles

Ability `role` describes how the player understands the ability in the UI and fantasy. Activation is handled separately.

### Skill
An active combat move: strike, blink, volley, field pulse, team buff. Skills may be auto-timed, periodic, or manual.

### Passive
An always-on or condition-linked behavior that shapes the hero's kit without feeling like a featured cast.

### Reaction
A response ability that watches combat events and fires when its activation conditions are met.

### Ultimate
The hero's defining high-impact move. Ultimates usually use charge-based activation, but the role is still separate from the activation mode.

---

## Activation Model

Every ability has an `activation` object. This is the source of truth for how it becomes available or fires.

### Activation Modes

- `auto_time` — regular cooldown skill; fires when its cadence is ready
- `auto_interval` — periodic pulse or repeated behavior independent of the normal skill cadence
- `reactive` — listens for an event and fires when conditions are met
- `manual` — exposed as a direct player-pressed hero skill button
- `action_linked` — tied to player action-card usage on, by, or around the hero
- `charge_release` — accumulates charge from events, then releases when threshold is met

### Activation Events

Not every mode needs an event. `manual`, `auto_time`, and `auto_interval` can rely on `mode` plus cadence. Event-driven modes use one of:

- `damage_taken`
- `damage_dealt`
- `attacked`
- `action_used`
- `action_received`
- `skill_used`
- `ally_damaged`
- `ally_died`
- `hp_threshold_crossed`
- `status_received`
- `time_elapsed`

### Source Filters

Source filters refine event meaning without exploding the enum list:

- `actor_scope`: `enemy | ally | self | any`
- `damage_sources`: `basic_attack | hero_skill | action_card | any`
- `action_scope`: `played_by_player | received_by_self | received_by_ally | any`
- `status_kinds`: specific statuses if the trigger only cares about some debuffs or buffs

This is how the schema distinguishes:

- "attacked by hero" -> `event: attacked` + `damage_sources: ["basic_attack"]`
- "attacked by spell" -> `event: attacked` + `damage_sources: ["hero_skill"]`
- "hit by action card" -> `event: action_received` or `event: attacked` + `damage_sources: ["action_card"]`

### Thresholds and Limits

- `threshold.kind`: `count | hp_pct | charge | none`
- `threshold.value`: count, percent, or charge amount
- `limit.cooldown_ms`: minimum delay between activations
- `limit.once_per_match`: fire only once in the match

`auto_time` and `auto_interval` both use `cadence_ms`, but they mean different things:

- `auto_time` is a standard cast cadence for featured skills
- `auto_interval` is a repeating tick or pulse that should feel ambient or persistent

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

Ability icon planning for the current hero docs lives in `docs/heroes/skill-icon-manifest.md`.

```json
{
  "abilities": [
    {
      "id": "string",
      "name": "Display Name",
      "role": "skill | passive | reaction | ultimate",
      "description": "Flavor text shown to player.",
      "element": "fire | ice | earth | wind | light | shadow",
      "target": "primary | secondary | self | attacker | all_enemies | all_allies | lowest_hp_ally | random_enemy",
      "activation": {
        "mode": "auto_time | auto_interval | reactive | manual | action_linked | charge_release",
        "event": "damage_taken | attacked | action_received | skill_used | ...",
        "cadence_ms": 3000,
        "source_filters": {
          "actor_scope": "enemy | ally | self | any",
          "damage_sources": ["basic_attack | hero_skill | action_card | any"],
          "action_scope": "played_by_player | received_by_self | received_by_ally | any"
        },
        "threshold": {
          "kind": "count | hp_pct | charge | none",
          "value": 20
        },
        "limit": {
          "cooldown_ms": 3000,
          "once_per_match": false
        }
      },
      "chance": 0.25,
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

Canonical rule: `activation` is the only activation API. Legacy top-level fields such as `trigger`, `trigger_value`, `cooldown_ms`, `once`, and `charge` should not be used in new hero definitions.

---

## Action Reactions

Each hero reacts uniquely to every action card in the game. When a player uses an action card on a hero, the hero's personality and element reshape how that action works. Reactions can modify:

- **Cast time** — faster or slower depending on affinity
- **Power** — amplified or weakened
- **Bonus effects** — additional DoTs, AoE splashes, element shifts, temporary skills
- **Thought** — a character-specific line shown in the UI

This means the same action card plays differently on every hero. A Fireball cast through Flame Warlock is faster and spreads ignite. The same Fireball cast through Frost Queen is slower and weaker, but might create steam.

Action reactions are defined per-hero in their individual doc files under `docs/heroes/`.

---

## Alliance System

Not all heroes will fight alongside each other. Heroes have alignments — some are rightful (noble, disciplined, light-aligned), others are chaotic (dark, destructive, self-serving), and some are neutral (mercenaries, loners).

Heroes with conflicting alignments have no synergy bonuses and may even suffer penalties when teamed together. Heroes with compatible alignments unlock synergy effects — passive bonuses, combo abilities, or amplified skills that only activate when specific allies are present.

Alliance compatibility is documented per-hero.

---

## Synergy System

Synergies are mechanical bonuses that activate when compatible heroes are on the same team. They arise from the heroes' lore, element interactions, and ability design. Examples:

- A fire mage's DoTs tick faster when a wind-aligned ally uses wind skills
- An assassin's poison detonates for burst damage when a fire ally damages the same target
- A death mage gains charge when allies kill enemies nearby

Synergies are documented per-hero, describing which allies amplify their kit and which enemies counter them.

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

### 1. Flame Warlock — Malachar
See [heroes/flame-warlock.md](heroes/flame-warlock.md)

### 2. Iron Knight
See [heroes/iron-knight.md](heroes/iron-knight.md)

### 3. Frost Queen
See [heroes/frost-queen.md](heroes/frost-queen.md)

### 4. Demon Empress
See [heroes/demon-empress.md](heroes/demon-empress.md)

### 5. Earth Warden
See [heroes/earth-warden.md](heroes/earth-warden.md)

### 6. Gunslinger
See [heroes/gunslinger.md](heroes/gunslinger.md)

### 7. Necromancer
See [heroes/necromancer.md](heroes/necromancer.md)

### 8. Night Venom
See [heroes/night-venom.md](heroes/night-venom.md)

### 9. Princess Emberheart
See [heroes/princess-emberheart.md](heroes/princess-emberheart.md)

### 10. Spellblade Empress
See [heroes/spellblade-empress.md](heroes/spellblade-empress.md)

### 11. Arcane Paladin
See [heroes/arcane-paladin.md](heroes/arcane-paladin.md)

### 12. Blood Alchemist
See [heroes/blood-alchemist.md](heroes/blood-alchemist.md)

### 13. Wind Monk
See [heroes/wind-monk.md](heroes/wind-monk.md)

### 14. Tyrant Overlord
See [heroes/tyrant-overlord.md](heroes/tyrant-overlord.md)

### 15. Storm Ranger
See [heroes/storm-ranger.md](heroes/storm-ranger.md)

### 16. Dawn Priest
See [heroes/dawn-priest.md](heroes/dawn-priest.md)

### 17. Arc Strider
See [heroes/arc-strider.md](heroes/arc-strider.md)
