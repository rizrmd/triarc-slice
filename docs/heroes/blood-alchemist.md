# Blood Alchemist — Cael

## Identity

- **Name:** Cael
- **Role:** Sustain Mage
- **Alignment:** Chaotic
- **Title:** Lord Cael of House Vyrath
- **Elements:** Shadow (+30), Earth (+10)
- **Weaknesses:** Light (-20), Fire (-10)
- **Stats:** 2900 HP / 145 ATK / 110 DEF

## Lore

Nobody knows how long Lord Cael has lived in the eastern quarter of the capital. The deed to his estate predates the current dynasty's records. His family name — Vyrath — appears in ledgers going back centuries, always as patrons of the alchemical arts, always as generous donors to the city's hospitals and research halls. Always one Lord Cael or another. The family resemblance is remarkable. Uncanny, even. Best not to think about it.

He is pale, immaculately dressed, and never seen before dusk. His servants rotate frequently — they leave his employ looking tired, anemic, and strangely unable to remember the details of their service. He hosts salons for the city's intellectual elite where he discusses transmutation theory with a fluency that suggests either extraordinary education or firsthand experience with processes that predate modern alchemy by centuries. He is charming in the way that old money is charming: effortlessly, and with the quiet understanding that everyone in the room exists at his convenience.

He is a vampire. He has been a vampire for longer than he cares to count. The word offends him — it conjures images of feral creatures in crypts, biting throats in alleyways. Cael does not bite. He *transmutes*. Blood is the most complex alchemical substance in nature: it carries life, memory, vitality, elemental resonance. Drawing it from a living body and refining it into power is not predation. It is art. It is science. The fact that the donor dies is a side effect, not the purpose. He is genuinely offended by the distinction's failure to land.

His arrangement worked for centuries. Discrete feedings. Rotating staff. A public persona of aristocratic eccentricity. Then the war came.

At first, the war was an inconvenience — armies marching through trade routes, supply disruptions, tiresome martial law. Then Cael realized what a war actually is: a landscape of open wounds. Battlefields carpeted with bleeding soldiers. Field hospitals overflowing with the dying. An entire civilization hemorrhaging, and nobody counting the blood loss. For a vampire who had spent centuries rationing, this was abundance beyond imagination.

He didn't join the Tyrant Overlord out of loyalty or ideology. He joined because Severan's conquests produce a limitless supply of what Cael needs, and Severan doesn't care *what* Cael is — only that his blood transmutation keeps the army's wounded fighting longer than they should. To the soldiers, Lord Cael is the eccentric alchemist-healer who visits the field hospitals at night. To Severan, he's a logistical asset. To Cael, the entire war is a banquet, and he intends to eat until there's nothing left.

The other chaotic heroes tolerate him with varying degrees of comfort. Malachar's fire makes Cael's skin crawl — literally — but burning targets bleed freely, and freely bleeding targets are easier to drain. Night Venom's poisons thin the blood, making extraction more efficient. The Demon Empress's debuffs weaken targets' resistance to his transmutation. They don't need to like each other. They need to be useful to each other. Cael finds this arrangement perfectly civilized.

## Personality

Aristocratic, clinical, refined. Cael speaks about blood the way a sommelier discusses wine — noting vintage, complexity, and finish. He is deeply knowledgeable about anatomy, alchemy, and the elemental composition of living systems, and he shares this knowledge freely, whether or not anyone asked. He is polite in the way that predators are polite: because rudeness is effort, and the outcome is the same regardless.

He does not consider himself evil. Evil implies intent to harm. Cael intends to feed. That harm results is regrettable but irrelevant — a lion does not consider itself evil for hunting. The difference is that Cael is articulate enough to explain this philosophy and educated enough to make it sound reasonable. Whether that makes him more or less monstrous is a question he finds tedious.

His only genuine emotion is irritation — at imprecision, at vulgarity, at anyone who calls what he does "blood magic" instead of "transmutation." And, buried beneath centuries of refinement: hunger. Always hunger. The war helps.

## Abilities

| Ability | Type | Cast Time | Cooldown | Target | Effect |
|---------|------|-----------|----------|--------|--------|
| **Sanguine Lance** | skill | 800ms | 8000ms | primary | Damage bp 12 + drain (heals self for 30% of damage dealt) |
| **Crimson Siphon** | skill | 1000ms | 12000ms | primary | Drain bp 18, heals self for 50%. If target is debuffed: drain heals 65% instead. |
| **Hemorrhage** | skill | 1200ms | 14000ms | all_enemies | Damage bp 10 + bleed DoT (4s, value 5). Each bleed tick heals Cael for 20% of damage. |
| **Vital Transmutation** | passive | — | — | self | Cael's healing from drains is 15% more effective on targets below 50% HP. Excess healing (above max HP) converts to a shield (up to 15% of max HP). |
| **Coagulate** | reaction | 400ms | 10000ms | self | On HP below 40%: instant self-heal (bp 15) by consuming stored blood shield. If no shield: heals for 50% of value instead. Hidden until first trigger. |
| **Exsanguinate** | ultimate | 1800ms | — | all_enemies | Drain bp 50 from all enemies. Heals Cael for 40% of total damage dealt. All enemies receive bleed DoT (5s, value 8). Charges via healing_done, threshold 1000. |

### Sanguine Lance
A needle of shadow-infused blood hurled at the primary target. The damage is modest, but every drop returns to Cael. His bread and butter — constant, sustainable feeding.
- *Thought: "A minor reaction."*

### Crimson Siphon
Cael reaches into a target's circulatory system and *pulls*. The deepest drain in his kit — and dramatically more effective against targets already weakened by allies. This is why his synergies revolve around debuffs: a weakened body can't resist the siphon.
- *Thought: "Your vitality. My vitality. Transmutation."*

### Hemorrhage
Every enemy bleeds. Every bleed heals Cael. Sustained, distributed feeding across the entire battlefield — the closest Cael comes to indulgence. Each tick is a sip, not a gulp. Refinement, even in AoE.
- *Thought: "Bleed freely. I insist."*

### Vital Transmutation
Cael's passive makes him harder to kill the longer a fight goes. Weakened enemies feed him more. Excess health becomes a blood shield — a reservoir for later. He is a war of attrition incarnate: the longer you fight him, the stronger he gets and the weaker you become.
- *Thought: "The transmutation sustains."*

### Coagulate
When badly wounded, Cael burns his stored blood shield for an emergency self-heal. If the shield is gone, he still heals, but less. A survival mechanism — the vampire's refusal to die. Hidden until first triggered.
- *Thought: "Not yet. The feast is not over."*

### Exsanguinate
Cael's ultimate. Charges through healing — every drain, every bleed tick, every sip builds toward this. When full, he drains the entire battlefield simultaneously. Massive damage, massive self-heal, lingering bleeds on everyone. The banquet's main course.
- *Thought: "Transmutation unleashed."*
- *Visibility: always (charge bar shown)*

---

## Action Reactions

How Cael reshapes every action card the player uses on him.

### Fire Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Fireball** | +15% | -10% | Fire cauterizes — bleed DoTs on target removed. But cauterized wound reopens: delayed bleed (2s later, 3s, value 7) | *"Fire seals wounds. Temporarily."* |
| **Flame Lance** | +15% | -10% | Pierce burns through blood vessels — target takes bleed DoT (3s, value 5) and drain heals 10% more | *"Cauterization disrupts, but the blood still flows beneath."* |

### Ice Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Frostbolt** | — | — | Cold slows blood flow — drain heals 15% less but slow (2s) added to target | *"Cold blood. Less nutritious, but it holds them still."* |
| **Ice Nova** | — | — | Frozen targets' bleeds pause but don't expire — resume at full duration when thawed | *"Preserved. I'll collect later."* |
| **Blizzard** | +10% | -10% | All bleeds paused during blizzard. When blizzard ends: all bleeds resume + bonus tick. Delayed feast. | *"Frozen reserves. Patience is a virtue I've had centuries to learn."* |

### Physical Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Shiv** | -10% | — | Blade applies bleed DoT (3s, value 4). Each bleed tick heals Cael. Efficient feeding. | *"A small incision. Precision over force."* |
| **Charge** | — | — | Impact ruptures — target takes bleed DoT (3s, value 5) + Cael heals on arrival | *"Direct collection."* |
| **Cleave** | — | — | Both targets bleed. Cael heals from both — double the donors. | *"Two incisions. Double the yield."* |
| **Execute** | — | +15% | If kill: Cael heals for 20% of target's max HP. The final feeding. | *"The last drop is always the richest."* |
| **Garrote** | -10% | — | Stun + bleed DoT (4s, value 6) — throat wound, maximum blood flow | *"The jugular. Efficient access."* |
| **Chain** | — | — | Chains become blood-threaded — chained target takes bleed DoT alongside slow | *"Tethered. Like an IV."* |
| **Riposte** | — | — | Counter-attack drains — heals Cael for 30% of damage dealt on counter | *"You struck me. I'll take compensation."* |
| **Taunt** | — | — | Taunted enemies who attack Cael trigger micro-drains — heals 5% of damage taken | *"Come. Feed me."* |
| **Mark Target** | -10% | — | Marked target takes +15% drain damage from Cael. Diagnosis before extraction. | *"Vitals assessed. Rich composition."* |
| **Intercept** | +10% | — | Shield absorbs damage and converts 10% to stored blood shield. Every hit feeds the reserve. | *"I absorb. It's what I do."* |

### Shadow Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Cursed Dart** | -10% | +10% | Dart is blood-infused — curse + drain (heals 25% of damage) | *"A cursed transfusion. Elegant."* |
| **Shadowstep** | -10% | — | Departure leaves blood mist — enemies nearby take bleed DoT (2s, value 4) | *"I leave a sample behind."* |
| **Leech Blade** | -15% | +15% | Perfect resonance. Drain heals 60%. If target below 50% HP: heals 75%. | *"Leech. Such a crude word for such refined work."* |
| **Smoke Bomb** | — | — | Smoke becomes blood mist — enemies inside are drained (bp 3 per second, heals Cael) | *"Aerosolized extraction. Imprecise, but atmospheric."* |
| **Poison Strike** | -10% | +10% | Poison becomes blood toxin — DoT ticks heal Cael for 15% of damage | *"Not poison. Anticoagulant."* |
| **Toxic Coating** | -10% | +10% | Coating becomes blood varnish — attacks apply bleed DoT and heal on hit | *"Every wound opens a vein."* |

### Earth/Defense Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Fortify** | -10% | +10% | Shield becomes blood barrier — attackers are drained on contact (bp 3 per hit, heals Cael) | *"Strike the barrier. Donate."* |
| **Shield Wall** | -10% | — | Defense buff. While active, Vital Transmutation's excess healing shield cap doubles to 30% max HP. | *"Storing reserves. A prudent vintage."* |
| **Stand Firm** | — | — | While active, all bleed DoTs on enemies tick 25% faster. Standing still, collecting. | *"I'll wait. The bleeding doesn't."* |

### Light Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Holy** | +25% | -20% | Light burns through him — 4% self-damage. But the pain triggers Vital Transmutation, converting next drain heal to 50% more. | *"The light... disrupts the process. Painfully."* |
| **Mana Weave** | +20% | -15% | Healing reduced significantly — light resists his nature. But cleanses one debuff. | *"Light healing is... incompatible with my biology."* |
| **Rally Cry** | +15% | — | Attack buff weaker. But Hemorrhage bleed value increases by +3 for 5s. | *"I do not rally. But increased flow is... acceptable."* |
| **Mirror Shield** | +10% | — | Reflected damage drains — heals Cael for 20% of reflected damage. Even reflected attacks feed him. | *"Your force, transmuted into my sustenance."* |
| **Arcane Blast** | +10% | — | Blast applies bleed DoT (2s, value 4). Arcane energy ruptures blood vessels. | *"Arcane force has... medical applications."* |

### Wind/Hybrid Actions

| Action | Cast Time | Power | Bonus Effect | Thought |
|--------|-----------|-------|--------------|---------|
| **Chain Spark** | — | — | Spark carries blood mist — each chained target takes bleed DoT (2s, value 3) | *"Airborne transmission. Crude but effective."* |
| **Time Slip** | — | — | Resets Crimson Siphon and Sanguine Lance cooldowns. All active bleeds gain 2s duration. More time, more blood. | *"Time is on my side. It always has been."* |

---

## Alliance & Synergies

**Alignment: Chaotic** — Cael serves no cause. He serves his appetite. The war is a banquet, and he will eat from whichever table is fullest.

### Compatible Allies

| Ally | Synergy Name | Effect |
|------|-------------|--------|
| **Flame Warlock (Malachar)** | Cauterize | Burning targets bleed more — Cael's drain heals 20% more on targets with active fire DoTs. Cauterized wounds reopen wider. |
| **Night Venom (Silas)** | Compound Interest | Poisoned targets have thinned blood — Cael's drains heal 15% more. Silas's poisons last 1s longer on drained targets. Weakened immune system can't fight both. |
| **Tyrant Overlord (Severan)** | Blood Tithe | Cael's drains heal 20% more on targets debuffed by Severan. Defense shred opens the veins wider. Severan provides, Cael collects. |
| **Demon Empress** | Abyssal Transfusion | Cael's drains are 15% stronger on Demon Empress's debuffed targets. Demon Empress gains 5% of all Cael's drain healing as bonus attack. Symbiotic corruption. |
| **Necromancer** | Red Requiem | Enemies killed while bleeding grant Necromancer bonus ability charge. Necromancer's shadow debuffs reduce targets' healing received — less self-repair means more blood for Cael. |
| **Frost Queen (Eirwen)** | Frozen Reserves | Eirwen's slows reduce targets' ability to regenerate. Cael's bleeds last 1s longer on slowed targets. Cold preserves the wound. |

### Incompatible Heroes

| Ally | Penalty Name | Effect |
|------|-------------|--------|
| **Iron Knight (Garen)** | Tainted Steel | Blood magic seeps into Garen's armor — Bulwark absorb reduced to 10%. Garen's light disrupts Cael's drains by 15%. Steel and blood don't mix. |
| **Dawn Priest** | Forbidden Blood | Dawn Priest's light disrupts blood transmutation — Cael's drains 25% weaker. Cael's dark vitality makes the Priest's healing 10% weaker when he's nearby. The healer and the parasite cancel each other. |
| **Arcane Paladin** | Forbidden Transmutation | Paladin's light disrupts blood magic — Cael's drains 20% weaker. Cael's dark vitality corrodes the Paladin's shields by 10%. Discipline vs indulgence. |
| **Princess Emberheart** | Royal Revulsion | Emberheart's fire and light both weaken Cael. His drain heals 15% less on fire-buffed allies. She finds his nature abhorrent — her morale aura doesn't extend to him. |

### Lore Relationships

- **Tyrant Overlord (Severan)** — The provider. Severan's wars produce an unlimited supply of what Cael needs, and Severan doesn't ask uncomfortable questions about what happens in the field hospitals after dark. It's the most honest relationship Cael has ever had: I provide the blood, you provide the service. No pretense. Cael finds Severan's absolute lack of moral judgment refreshing.
- **Flame Warlock (Malachar)** — Fire makes Cael's skin crawl — literally. But burning targets bleed freely, and freely bleeding targets are easier to drain. Cael tolerates the discomfort for the yield. Malachar doesn't notice or care. Their synergy is chemical, not personal.
- **Night Venom (Silas)** — Two specialists in bodily corruption. Silas thins the blood with poison; Cael drinks what flows. They discuss technique with the clinical detachment of colleagues at a conference. Silas finds Cael's feeding habits mildly fascinating. Cael finds Silas's poisons professionally useful. Neither would call it friendship. Both would call it efficient.
- **Necromancer** — The Necromancer deals in death. Cael deals in the moments just before death — the richest feeding window. They orbit the same prey at different stages. The Necromancer finds Cael's vampirism pedestrian. Cael finds the Necromancer's death obsession dramatic. Professional coexistence.
- **Dawn Priest** — The natural enemy. Light purifies blood — strips it of the shadow resonance that makes it nourishing to Cael. In the Priest's presence, Cael's transmutation falters, his drains weaken, and his centuries-old composure cracks. He avoids the Priest the way any predator avoids something that smells wrong. The Priest, for their part, senses what Cael is without being able to prove it.
- **Iron Knight (Garen)** — Garen's honor is a physical force that rejects Cael's presence. The blood magic literally corrodes Garen's defenses, and Garen's light aura disrupts Cael's feeding. Neither can function near the other. Garen sees a parasite wearing nobility. Cael sees a man too stubborn to accept that his kingdom's blood was spilled for nothing.
- **Frost Queen (Eirwen)** — Cold preserves blood. Eirwen's winter is, from Cael's perspective, excellent storage conditions. He respects her composure — it reminds him of his own. Two beings who have learned that warmth is a vulnerability. She doesn't know what he is. He intends to keep it that way.

## Counters

- **Weak against:** Light-heavy teams that disrupt his transmutation and weaken his drains. Burst damage that kills him before his sustain ramps up — 110 DEF means focused fire drops him quickly. Healing reduction effects that cut his drain healing. Fire removes his bleed DoTs through cauterization, disrupting his sustain cycle.
- **Strong against:** Prolonged fights where his sustain outpaces incoming damage. Teams without burst who let him stack bleeds across the entire enemy team. Low-healing teams that can't outregen his drains. Single-target duelists who can't kill him through his constant self-healing.
