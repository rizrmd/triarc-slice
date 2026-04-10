# Triarc Slice

A real-time tactical card battle game built with Godot (mobile portrait). Two players each bring a team of three heroes and fight simultaneously — no discrete turns.

## Gameplay

### The Battle Screen

- **Top:** Three enemy heroes with HP bars
- **Bottom:** Your three allied heroes with HP bars
- **Hand:** Five action cards along the bottom
- **Energy bar:** Starts at 10, regenerates 1 per second
- **Reroll button** and a **draggable info button**

### How to Play

1. **Drag a card onto one of your heroes** to begin casting. A pie-chart timer shows cast progress (~600–1500 ms depending on the action). When the cast completes, the action resolves — dealing damage, applying shields, or inflicting status effects.

2. **Manage energy.** Each card costs 1–4 energy. When you run out, wait for it to regenerate or play cheaper cards.

3. **Reroll your hand** for 2 energy to draw 5 fresh cards. Playing all 5 cards in your hand earns a free reroll.

4. **React in real-time.** Both players act simultaneously. Enemy cast indicators are visible so you can anticipate incoming actions.

### Info Button

The gameplay HUD includes a draggable info button. Drag it over any hero or card to inspect it — other elements dim while dragging, and the hovered target stays at normal brightness. On release the button snaps back with a small zoom animation.

### Winning

A match ends when all three heroes on one side are eliminated.

## Heroes

There are 17 playable heroes. Each has **HP**, **Attack**, **Defense**, and **element affinities** across six elements: Fire, Ice, Earth, Wind, Light, and Shadow.

| Role | Examples | Traits |
|------|----------|--------|
| Tank | Iron Knight, Earth Warden, Tyrant Overlord | High HP (3500–3800), high Defense |
| Damage | Flame Warlock, Night Venom, Gunslinger | High Attack (165–175), lower Defense |
| Specialist | Frost Queen (Ice), Arc Strider (Wind), Storm Ranger (Wind) | Strong element affinity, exploits matchups |

Element affinities create a rock-paper-scissors dynamic. A Frost Queen with +40 Ice affinity deals bonus ice damage and resists it, but her -35 Fire affinity makes her vulnerable to fire attacks.

## Actions

There are 31 action cards spanning all six elements:

| Category | Examples | Cost |
|----------|----------|------|
| Fire damage | Fireball, Flame Lance | 3 |
| Ice damage | Frostbolt, Ice Nova, Blizzard | 2–4 |
| Physical | Cleave, Charge, Execute, Shiv | 1–4 |
| Defense | Shield Wall, Fortify, Riposte, Stand Firm | 2–3 |
| Shadow | Cursed Dart, Leech Blade, Shadowstep | 2–3 |
| Light support | Rally Cry, Mana Weave, Mirror Shield | 3–4 |
| Utility | Taunt, Mark Target, Smoke Bomb, Time Slip | 2–4 |

Each action has a targeting mode — enemy single, ally single, or self — and a cast duration.

## Damage Formula

```
Damage = (Base Power x Caster Attack / 100)
       x (1 + Caster Element Affinity / 100)
       x (100 / (100 + Target Defense))
       x (1 - Target Element Affinity / 100)

Minimum: 1
```

Strong element matchups can nearly double damage; weak ones halve it.

## Strategy

- **Hero drafting:** Pick heroes that exploit element matchups against the opponent's team.
- **Card sequencing:** Play the right card at the right moment — a well-timed shield can negate a big attack.
- **Energy management:** Don't waste energy on low-impact plays. Know when to reroll for better options.
- **Focus fire:** Eliminating one enemy hero early creates a 3v2 advantage.

## Project Layout

- `game/`: Godot project, scenes, scripts, and exported game assets.
- `editor/`: Content/layout editor and its frontend.
- `data/`: Source-of-truth content for heroes, actions, layouts, and animaps.
- `scripts/`: Utility scripts for content sync and migration.

## Development Notes

- Gameplay layout data lives in `data/game-layout.json`.
- If you change files under `editor/frontend/src/`, rebuild with:

```bash
npm --prefix editor/frontend run build
```

- If you edit content data under `data/`, sync the server content with:

```bash
node scripts/sync-content.mjs
```
