# Storm Ranger — Seryn

## Identity

- **Name:** Seryn
- **Role:** Striker
- **Alignment:** Neutral
- **Order:** Order of the Gale
- **Origin Clan:** Wind-reader clan
- **Elements:** Wind (+25), Light (+15), Ice (+5)
- **Weaknesses:** Earth (-25), Fire (-5)
- **Stats:** 2600 HP / 160 ATK / 110 DEF

## Lore

Seryn was raised in the wind-reader clan, high in the frozen passes where the air itself speaks to those who listen. Her clan taught patience as a weapon — read the wind, read the prey, and when the moment is perfect, strike once. One shot. One kill. Wasted arrows are wasted lives.

She was recruited into the Order of the Gale at sixteen, already the finest marksman her clan had produced in decades. The Order recognized her gift immediately: she didn't just track storm-born beasts, she predicted them. She could read a tempest's path hours before it struck, positioning herself at the exact point where prey would emerge. While others chased, Seryn waited — and was already there.

Her philosophy is the opposite of Kaelen's: *read the storm, strike once*. Patience is power. She freezes emotion, clears her mind, and sees the kill before it happens. Her ice affinity comes from this discipline — cold focus, cold precision. Her light affinity lets her see through storm and shadow. She never misses.

Now she stands as one of two candidates for the Order's next leader. Her rival is Kaelen, a lightning-runner from a different clan. She thinks he's reckless — fast but wasteful, burning through prey instead of studying them. He thinks she's slow. She knows she's not slow. She's already finished before he starts.

## Personality

Calm, precise, observant. Speaks only when it matters. Dry humor that cuts deeper than her arrows. Patient in a way that unnerves allies and terrifies enemies. Never rushes, never panics. The only thing that cracks her composure is Kaelen being right — which happens more often than she'll admit.

## Abilities

| Ability | Type | Cast Time | Cooldown | Target | Effect |
|---------|------|-----------|----------|--------|--------|
| **Volt Arrow** | skill | 800ms | 8000ms | primary | Damage, base_power 14. Charged shot — slower but hits harder than Kaelen. |
| **Hunter's Mark** | skill | 400ms | 10000ms | primary | Applies mark (5s). Marked targets take +15% damage from all sources. |
| **Gale Volley** | skill | 1200ms | 12000ms | all_enemies | Damage bp 12 + slow (3s). Rain of wind-charged arrows. |
| **Patience** | passive | — | — | self | The longer Seryn doesn't cast a skill, the more her next skill's power increases. Max +40% at 5s of waiting. Resets on cast. |
| **Storm Shelter** | reaction | 300ms | 9000ms | lowest_hp_ally | On ally damaged: grants shield (bp 10) to lowest HP ally. |
| **Skybreak Volley** | ultimate | 2000ms | — | all_enemies | Damage bp 55 + mark all enemies (4s). Charges via damage_dealt, threshold 900. |

### Volt Arrow
A single charged shot at her primary target. Slower cadence than Kaelen's Arc Slash, but each arrow hits harder. Quality over quantity.
- *Thought: "I see you, {target}."*

### Hunter's Mark
Marks a target, making them vulnerable to all damage. Sets up kills for herself and her allies. A hunter marks before she strikes.
- *Thought: "You were tracked the moment you moved."*

### Gale Volley
A rain of wind-charged arrows across all enemies. Each arrow carries a slow — prey that can't run is prey that's already dead.
- *Thought: "Nowhere to run."*

### Patience
The longer Seryn waits between skills, the harder her next one hits. Her kit rewards timing over spam. The perfect shot is worth more than ten hasty ones.
- *Thought: "Not yet..."* / *"Now."* (on empowered cast)

### Storm Shelter
When an ally takes damage, Seryn reacts by granting a shield to the most wounded teammate. She protects the pack — a hunter watches the whole field.
- *Thought: "Move. Now."*

### Skybreak Volley
Seryn's ultimate — the sky opens and arrows rain down on every enemy, marking them all. The hunt is over. Everyone is prey now.
- *Thought: "Nowhere left to hide."*
- *Visibility: always (charge bar shown)*

---

## Action Reactions

### Fire Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Fireball** | +10% | -10% | Fire clashes with her cold precision. But marked targets take bonus fire damage. | *"Crude. But it'll do."* |
| **Flame Lance** | +10% | -10% | DoT disrupts her clean-kill philosophy. Grants Patience stack faster to compensate. | *"Messy. Let the burn work while I wait."* |

### Ice Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Frostbolt** | -10% | +10% | Ice resonates with her discipline. Slow duration extended by 1s. | *"Cold focus. Perfect."* |
| **Ice Nova** | -10% | +10% | Slow on all targets — sets up her Gale Volley follow-up. Patience bonus preserved. | *"Freeze them. Then finish them."* |
| **Blizzard** | -15% | +15% | Full ice+wind resonance. Slow becomes root (2s) on marked targets. | *"The storm obeys."* |

### Physical Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Shiv** | — | — | Quick strike. Resets Patience passive (counts as fast action — no bonus). | *"Sometimes speed is the answer."* |
| **Charge** | +10% | — | Seryn doesn't charge. But impact applies Hunter's Mark to target. | *"Reckless. But now they're marked."* |
| **Cleave** | — | — | Secondary target also gets marked (2s) | *"Two targets. Noted."* |
| **Execute** | — | +15% | Patience empowers executions. If kill: Storm Shelter cooldown resets. | *"Clean kill."* |
| **Garrote** | — | — | Stun lets Patience stack — she's waiting anyway | *"Hold them. I'll wait for the shot."* |
| **Chain** | — | — | Chained target is auto-marked | *"Bound prey is marked prey."* |
| **Riposte** | — | — | Counter-attack applies Hunter's Mark to attacker | *"You revealed yourself."* |
| **Taunt** | — | — | While taunted, Patience stacks 50% faster — she's watching, waiting | *"Draw them in. I see everything."* |
| **Mark Target** | -25% | — | Double mark stack — target takes +25% damage instead of +15% | *"Tracked."* |
| **Intercept** | — | — | Shield on ally. If shield breaks, Seryn's next Volt Arrow is empowered +20%. | *"I saw that coming."* |

### Shadow Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Cursed Dart** | — | — | Dart applies Hunter's Mark alongside curse | *"Cursed and marked. No escape."* |
| **Shadowstep** | -10% | — | Repositions — next skill gains +15% power (new angle, better shot) | *"New angle."* |
| **Leech Blade** | — | — | Drain marks the target — life taken reveals them | *"Your blood leaves a trail."* |
| **Smoke Bomb** | — | — | Enemies in smoke are auto-marked when they exit (revealed) | *"Hide. I'll be waiting when you come out."* |
| **Poison Strike** | — | — | Poison marks target — DoT ticks refresh mark duration | *"Poison trails are easy to follow."* |
| **Toxic Coating** | — | — | Attacks apply mini-mark (2s) — every hit reveals | *"Every wound tells me where you are."* |

### Earth/Defense Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Fortify** | +15% | — | Shield is normal but Patience stacks faster while shielded — safe to wait | *"Cover. Good. I'll take my time."* |
| **Shield Wall** | +15% | — | Defense buff. While active, Volt Arrow pierces shields on marked targets. | *"Behind a wall? Doesn't matter. You're marked."* |
| **Stand Firm** | +10% | — | Patience builds at double rate. Stand still, watch, and destroy. | *"I prefer lighter boots. But this works."* |

### Light Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Holy** | -10% | +10% | Light resonance. Reveals hidden enemies and extends mark duration by 2s. | *"The light finds them."* |
| **Mana Weave** | — | — | Heal + resets Storm Shelter cooldown. Protector role enhanced. | *"Restored. Watching again."* |
| **Rally Cry** | — | — | Attack buff stacks with Patience bonus (multiplicative, not additive) | *"Sharper eyes. Deadlier shots."* |
| **Mirror Shield** | — | — | Reflected damage marks the attacker | *"Attack me? Now I see you."* |
| **Arcane Blast** | — | +10% | Marked targets take +20% from arcane blast (light synergy) | *"Light and precision. My language."* |

### Wind/Hybrid Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Chain Spark** | -20% | +10% | Spark marks all targets it hits | *"Storms make good bloodhounds."* |
| **Time Slip** | -15% | — | Resets Storm Shelter and Hunter's Mark cooldowns. Patience fully stacked. | *"We move before they think."* |

---

## Alliance & Synergies

**Alignment: Neutral** — Seryn serves the hunt, not morality. Can ally with both rightful and chaotic heroes.

### Compatible Allies

| Ally | Synergy Name | Effect |
|------|-------------|--------|
| **Kaelen (Arc Strider)** | Gale Rivalry | Both gain +10% damage when the other scores a kill. Competing pushes both harder. |
| **Gunslinger** | Crosswind Killzone | Both benefit from marks — Gunslinger deals +10% to marked targets |
| **Dawn Priest** | Guiding Beacon | Priest sustain lets Seryn stay alive to stack Patience. Priest heals on Seryn grant bonus mark duration. |
| **Wind Monk** | Open Sky Hunt | Monk's control of spacing creates ideal pursuit windows. Seryn's marks benefit Monk's targeted strikes. |
| **Frost Queen** | Frozen Pursuit | Frost Queen's slows stack with Seryn's — slowed + marked targets are helpless |
| **Iron Knight** | Shield and Shoot | Iron Knight draws fire, Seryn marks and kills from behind the wall |

### Incompatible Heroes

| Ally | Penalty Name | Effect |
|------|-------------|--------|
| **Earth Warden** | Clipped Wings | Earth aura slows Seryn's skill cooldowns by 10%. Her wind arrows lose 10% power in earth-heavy air. |
| **Tyrant Overlord** | Forced March | His commanding pace disrupts her patience rhythm — Patience passive caps at +20% instead of +40%. |
| **Flame Warlock** | Heat Distortion | Chaotic fire warps her sightlines — Hunter's Mark duration reduced by 2s. Malachar's fire burns away her cold focus. |

### Lore Relationships

- **Kaelen (Arc Strider)** — Her rival in the Order of the Gale. She respects his speed but thinks it'll get him killed. He thinks she overthinks. Underneath the rivalry, she'd take an arrow for him — and hate herself for it.
- **Gunslinger** — Friendly professional respect. Both are ranged killers. She's precise, he's flashy. She wins accuracy competitions. He wins speed draws. They argue about which matters more.
- **Wind Monk** — She learned more from watching him move than from years of formal training. His patience mirrors hers, though his is spiritual where hers is tactical.
- **Dawn Priest** — Trusts the Priest's judgment. Light guides her arrows. A rare ally she doesn't feel the need to compete with.
- **Flame Warlock (Malachar)** — His chaos offends her discipline. Fire distorts wind, ruins tracking, burns away the cold clarity she needs. She would hunt him if given the contract.
- **Earth Warden** — Respects the Warden's strength but hates fighting alongside stone. Earth grounds her wind, clips her mobility. Useful cover, frustrating ally.

## Counters

- **Weak against:** Earth-heavy teams ground her mobility. Aggressive dive heroes (Arc Strider, Night Venom) who close distance before she can stack Patience. Fire disrupts her precision.
- **Strong against:** Slow, immobile teams that can't escape her marks. Stealth-reliant heroes are revealed by her mark system. Teams without cleanse can't remove her marks, leaving them permanently vulnerable.
