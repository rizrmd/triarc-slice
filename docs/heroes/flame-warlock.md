# Flame Warlock — Malachar

## Identity

- **Name:** Malachar
- **Role:** Glass Cannon
- **Alignment:** Chaotic
- **Elements:** Fire (+35), Wind (+15)
- **Weaknesses:** Ice (-35), Earth (-5)
- **Stats:** 2400 HP / 175 ATK / 90 DEF

## Lore

Once a brilliant arcane scholar at a prestigious academy, Malachar was obsessed with reaching the theoretical limit of fire magic. He believed fire wasn't just an element — it was a living force that wanted to be freed. His colleagues called it heresy. He called it truth.

He devised an experiment to channel raw chaos-wind as an accelerant through a fire sigil, hoping to create a self-sustaining flame. It worked — too well. The flame didn't just sustain itself, it found a host. Him. The fire burned through his mind, fusing with his thoughts. He didn't lose his intelligence — he lost his restraint. Every thought now ends in fire. Every solution is to burn.

He's not mindless. That's what makes him dangerous. He's lucid enough to strategize, articulate enough to mock his enemies, but fundamentally broken — his sanity flickers like a candle in the wind that feeds him. In rare quiet moments, he remembers who he was. He hates those moments.

His motivation is not power — he already has it. He wants silence. But the only way the fire goes quiet is when everything around him is already ash.

## Personality

Arrogant, destructive, consumed by flame. Speaks of burning, ash, and chaos. Views enemies as fuel. Respects nothing but raw power. Lucid enough to be cruel, broken enough to be unpredictable.

## Abilities

| Ability | Type | Cast Time | Cooldown | Target | Effect |
|---------|------|-----------|----------|--------|--------|
| **Fire Bolt** | skill | 800ms | 8000ms | primary | Damage, base_power 10 |
| **Ignite** | passive | — | — | same | 30% chance on damage dealt: apply DoT (3s, value 5) |
| **Inferno** | skill | 1200ms | 15000ms | all_enemies | Damage, base_power 20 |
| **Volatile End** | reaction | 500ms | — | all_enemies | On HP below 20%: damage bp 30. Once per match, hidden until triggered. |
| **Apocalypse Flame** | ultimate | 2000ms | — | all_enemies | Damage bp 60 + DoT (5s, value 15). Charges via damage_dealt, threshold 1000. |

### Fire Bolt
Malachar hurls a bolt of concentrated flame at his primary target. Fast cast, moderate cooldown — his bread and butter.
- *Thought: "Burn, {target}..."*

### Ignite
A 30% chance that any damage Malachar deals leaves a lingering burn on the target. Keeps pressure between skill cooldowns.
- *Thought: "{target} is burning!"*

### Inferno
Channels a wave of fire that hits all enemies. Longer cooldown, higher impact. Each target rolls Ignite separately.
- *Thought: "The flames hunger for ALL of you!"*

### Volatile End
When Malachar drops below 20% HP, he detonates in a burst of AoE fire damage. Fires once per match. Hidden from the UI until it triggers — a surprise punishment for killing him.
- *Thought: "If I fall... you ALL burn with me!"*

### Apocalypse Flame
Malachar's ultimate. Charges as he deals damage. When full, he channels for 2 seconds and incinerates all enemies with massive fire damage plus a lingering burn. The payoff for keeping him alive.
- *Thought: "EVERYTHING BURNS!"*

---

## Action Reactions

How Malachar reshapes every action card the player uses on him.

### Fire Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Fireball** | -20% | +15% | Ignite spreads to a second enemy | *"Yes... MORE fuel!"* |
| **Flame Lance** | -20% | +15% | DoT duration doubled | *"Pierce and BURN!"* |

### Ice Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Frostbolt** | +30% | -15% | Impact creates steam — small AoE (bp 5) around target | *"The cold clashes... but steam rises!"* |
| **Ice Nova** | +25% | -10% | 5% self-damage, but gains attack_buff for 3s from rage | *"You FREEZE my flames?! ...the rage builds."* |
| **Blizzard** | +30% | -20% | Wind component resonates — next skill has zero cooldown | *"The wind carries this cursed cold... but wind is MINE."* |

### Physical Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Shiv** | -30% | — | Blade ignites — applies mini-DoT (2s, value 3) | *"Even a spark can kill."* |
| **Charge** | — | — | Leaves fire trail — DoT on target (3s, value 8) | *"Charging with fire at my back!"* |
| **Cleave** | -10% | — | Flame cleave hits secondary target too at 50% power | *"My flame cuts wide!"* |
| **Execute** | +10% | +10% | If kill: grants temp skill "Soul Pyre" — attack_buff 5s | *"Burn to nothing!"* |
| **Garrote** | — | — | Converts stun effect to DoT — burns from within | *"I burn them from within."* |
| **Chain** | — | — | Chains heat up — applies burn DoT alongside slow | *"Chains of flame!"* |
| **Riposte** | — | — | Counter-attack deals fire damage instead of physical | *"Strike me and burn."* |
| **Taunt** | — | — | Taunted enemies who attack him take fire retaliation damage | *"Come! Burn yourselves on me!"* |
| **Mark Target** | -20% | — | Marked target takes +10% fire damage from all sources | *"Marked for incineration."* |
| **Intercept** | — | — | Shield releases fire AoE (bp 10) when broken | *"Block, then BURN."* |

### Shadow Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Cursed Dart** | — | — | Dart becomes fire+shadow hybrid damage | *"Even curses burn."* |
| **Shadowstep** | -10% | — | Leaves fire at departure point — AoE (bp 5) | *"Even my shadow burns."* |
| **Leech Blade** | — | — | Heals less but applies burn DoT to target | *"Your life feeds my flame."* |
| **Smoke Bomb** | -10% | — | Smoke ignites — fire cloud, applies DoT instead of evasion debuff | *"Smoke? No. Fire cloud."* |
| **Poison Strike** | — | — | Poison ignites — DoT ticks deal fire+shadow hybrid | *"Poison and fire... a slow death."* |
| **Toxic Coating** | — | — | Coating ignites — attacks deal fire+earth hybrid, apply burn | *"Toxin meets flame. Beautiful."* |

### Earth/Defense Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Fortify** | +15% | -10% | Shield gains fire thorns — attackers take fire damage | *"Grounded... but burning."* |
| **Shield Wall** | +15% | -10% | Defense buff + fire thorns on attackers | *"A wall? Make it a wall of FLAME."* |
| **Stand Firm** | +10% | — | While active, radiates heat — nearby enemies take small DoT | *"I stand in my own inferno."* |

### Light Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Holy** | +20% | -10% | 3% self-damage but gains ultimate charge | *"The light... it burns ME too."* |
| **Mana Weave** | +15% | -10% | Excess healing converts to temporary attack_buff | *"Healing? ...channel it into fire."* |
| **Rally Cry** | +10% | — | Gets attack_buff (stronger) but no defense_buff | *"I don't need morale. I need FIRE."* |
| **Mirror Shield** | +15% | — | Reflected damage is always fire element | *"A mirror of flame..."* |
| **Arcane Blast** | +10% | — | Below 50% HP: power +20% from desperation | *"Arcane fury... amplified by chaos!"* |

### Wind/Hybrid Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Chain Spark** | -15% | +10% | Element shifts to fire+wind | *"Wind and spark... my elements!"* |
| **Time Slip** | -10% | — | Resets skill cooldowns by 3s | *"Time bends... the fire SURGES."* |

---

## Alliance & Synergies

**Alignment: Chaotic** — Malachar will not ally with rightful heroes.

### Compatible Allies

| Ally | Synergy Name | Effect |
|------|-------------|--------|
| **Demon Empress** | Hellfire Convergence | DoTs from either hero stack faster when both are on the team |
| **Necromancer** | Soul Pyre | Malachar's kills grant Necromancer bonus ability charge |
| **Night Venom** | Venom Ignition | Malachar's fire detonates Night Venom's poison DoTs for burst damage |
| **Blood Alchemist** | Cauterize | Blood Alchemist's drains on burning targets heal more |
| **Tyrant Overlord** | Scorched Earth | Both damage same target within 2s: defense shred on target |
| **Gunslinger** | Powder Keg | Gunslinger's wind-element attacks spread Malachar's Ignite to new targets |

### Incompatible (Rightful Heroes)

Teaming Malachar with rightful heroes causes unique penalties for both:

| Ally | Penalty Name | Effect |
|------|-------------|--------|
| **Dawn Priest** | Purging Light | Dawn Priest's heals on Malachar are 30% weaker. Dawn Priest's light passively cleanses Malachar's Ignite DoTs from all heroes — ally and enemy alike. |
| **Iron Knight** | Cooking in the Shell | Malachar's fire heats Iron Knight's armor — deals friendly-fire DoT to Iron Knight. Iron Knight's defense aura doesn't apply to Malachar. |
| **Arcane Paladin** | Arcane Suppression | Paladin's disciplined arcane field slows Malachar's ultimate charge rate by 20%. Malachar's chaos disrupts Paladin's light/shadow balance, increasing Paladin's cast times by 10%. |
| **Princess Emberheart** | Divided Flame | Both fire wielders clash — each loses 10% fire power. Fire action cards used on either hero have their bonuses nullified. |
| **Spellblade Empress** | Elemental Dissonance | Her multi-element harmony clashes with his pure chaos. Both get +10% cast time on all skills. Her elemental convergence passive is weakened. |
| **Wind Monk** | Corrupted Wind | Monk's wind skills extinguish Malachar's DoTs instead of fanning them. Malachar's fire disrupts Monk's flow, reducing Monk's evasion. |

### Lore Relationships

- **Frost Queen** — His natural nemesis. Her cold is the only thing that silences the fire in his head. He fears her and despises that fear.
- **Princess Emberheart** — Proof that fire can be wielded with control. He finds her discipline insulting. She sees him as a cautionary tale.
- **Wind Monk** — The wind feeds Malachar's flame, but the Monk views him as a corruption of wind's true nature.
- **Dawn Priest** — Could potentially purify him. He avoids the light.
- **Necromancer** — A kindred spirit in madness. The Necromancer understands obsession — they trade in death as Malachar trades in fire.
- **Demon Empress** — She respects his raw power. He respects her dominion over hellfire. Neither trusts the other.

## Counters

- **Weak against:** Ice-heavy teams (Frost Queen especially) shut him down. Her abilities reduce his DoT duration. His low HP and defense mean any focused burst kills him before his damage ramps.
- **Strong against:** Low-defense teams that can't survive sustained fire pressure. Poison-based enemies are vulnerable to his fire detonating their DoTs.
