# Hero Ability Icon Manifest

This manifest covers the four hero specs currently present in `docs/heroes/`:

- `flame-warlock.md`
- `arc-strider.md`
- `storm-ranger.md`
- `iron-knight.md`

The repo already has hero card art in `data/hero/<slug>/img/` and hero voice assets in `data/hero/<slug>/audio/`, but it does not currently have per-ability icon images.

## Scope

- Total missing hero ability icons: `24`
- Flame Warlock: `5`
- Arc Strider: `6`
- Storm Ranger: `6`
- Iron Knight: `7`

## Recommended Runtime Layout

Store exported icon files here:

- `/data/hero/<slug>/img/abilities/<ability-id>.webp`

Recommended export spec:

- `256x256` transparent WebP for runtime
- Readable at `48-64px`
- Strong silhouette first, detail second
- Element color bias should match the hero kit
- One icon per ability, even for hidden abilities

Recommended source asset layout if art files are kept in-repo later:

- `/data/hero/<slug>/img/abilities/source/<ability-id>.<psd|svg|aseprite>`

## Pollinations Workflow

Prompt definitions for these icons live in:

- `/scripts/hero-ability-icon-prompts.json`

Batch generation script:

- `/scripts/generate-ability-icons-pollinations.mjs`

Example usage:

```sh
node scripts/generate-ability-icons-pollinations.mjs --hero=flame-warlock --dry-run
node scripts/generate-ability-icons-pollinations.mjs --hero=flame-warlock --delay-ms=15000
node scripts/generate-ability-icons-pollinations.mjs --hero=iron-knight --ability=shield-bash --overwrite
```

Notes:

- The script paces requests because Pollinations may return `429 Too Many Requests`.
- It normalizes downloads to `.webp` via local `cwebp`.
- Model selection is resolved against the live `/models` endpoint unless overridden with `--model=...`.

## UI Notes

- Hidden reactions should use the same icon asset as the revealed state. UI can apply a generic hidden overlay or question-mark treatment.
- Charge-based ultimates should use the same icon asset as the ready state. UI can apply a generic charge ring/progress treatment.
- No separate icon assets are required for action-card reactions from these docs. Those reactions modify existing action cards rather than defining new hero abilities.

## Optional Shared UI Assets

These are not per-hero, but they would make the icon system usable in UI:

- `/assets/ui/ability-hidden-overlay.webp`
- `/assets/ui/ability-ultimate-charge-ring.webp`
- `/assets/ui/ability-passive-badge.webp`
- `/assets/ui/ability-reaction-badge.webp`

## Flame Warlock

Base path: `/data/hero/flame-warlock/img/abilities/`

| Ability ID | Name | Type | Suggested File | Icon Brief |
|---|---|---|---|---|
| `fire-bolt` | Fire Bolt | skill | `/data/hero/flame-warlock/img/abilities/fire-bolt.webp` | Narrow flaming projectile or rune bolt with a bright core |
| `ignite` | Ignite | passive | `/data/hero/flame-warlock/img/abilities/ignite.webp` | Burning brand, ember wound, or small cursed flame |
| `inferno` | Inferno | skill | `/data/hero/flame-warlock/img/abilities/inferno.webp` | Expanding wall or cone of fire hitting multiple targets |
| `volatile-end` | Volatile End | reaction | `/data/hero/flame-warlock/img/abilities/volatile-end.webp` | Cracked ember core or unstable fire sphere about to burst |
| `apocalypse-flame` | Apocalypse Flame | ultimate | `/data/hero/flame-warlock/img/abilities/apocalypse-flame.webp` | Catastrophic flame sigil, descending firestorm, or world-scale blaze |

## Arc Strider

Base path: `/data/hero/arc-strider/img/abilities/`

| Ability ID | Name | Type | Suggested File | Icon Brief |
|---|---|---|---|---|
| `arc-slash` | Arc Slash | skill | `/data/hero/arc-strider/img/abilities/arc-slash.webp` | Blade sweep with a lightning arc cutting through air |
| `thunder-step` | Thunder Step | skill | `/data/hero/arc-strider/img/abilities/thunder-step.webp` | Blink strike silhouette with a bolt at the point of impact |
| `storm-pulse` | Storm Pulse | skill | `/data/hero/arc-strider/img/abilities/storm-pulse.webp` | Circular electric shockwave radiating outward |
| `static-charge` | Static Charge | passive | `/data/hero/arc-strider/img/abilities/static-charge.webp` | Stacked electric nodes, charge pips, or a third-hit overload glyph |
| `lightning-reflexes` | Lightning Reflexes | reaction | `/data/hero/arc-strider/img/abilities/lightning-reflexes.webp` | Dodging figure with a split-bolt afterimage |
| `tempest-surge` | Tempest Surge | ultimate | `/data/hero/arc-strider/img/abilities/tempest-surge.webp` | Multi-strike storm form or chained lightning cutting across the field |

## Storm Ranger

Base path: `/data/hero/storm-ranger/img/abilities/`

| Ability ID | Name | Type | Suggested File | Icon Brief |
|---|---|---|---|---|
| `volt-arrow` | Volt Arrow | skill | `/data/hero/storm-ranger/img/abilities/volt-arrow.webp` | Charged arrow with lightning trail |
| `hunters-mark` | Hunter's Mark | skill | `/data/hero/storm-ranger/img/abilities/hunters-mark.webp` | Tracking reticle, target rune, or marked-eye glyph |
| `gale-volley` | Gale Volley | skill | `/data/hero/storm-ranger/img/abilities/gale-volley.webp` | Rain of arrows with wind streaks across a wide area |
| `patience` | Patience | passive | `/data/hero/storm-ranger/img/abilities/patience.webp` | Taut drawn bow, waiting crosshair, or still-air charge motif |
| `storm-shelter` | Storm Shelter | reaction | `/data/hero/storm-ranger/img/abilities/storm-shelter.webp` | Ally shield protected beneath a curved wind canopy |
| `skybreak-volley` | Skybreak Volley | ultimate | `/data/hero/storm-ranger/img/abilities/skybreak-volley.webp` | Open sky split by descending arrows and mark sigils |

## Iron Knight

Base path: `/data/hero/iron-knight/img/abilities/`

| Ability ID | Name | Type | Suggested File | Icon Brief |
|---|---|---|---|---|
| `shield-bash` | Shield Bash | skill | `/data/hero/iron-knight/img/abilities/shield-bash.webp` | Shield slam with a blunt impact burst |
| `hold-the-line` | Hold the Line | skill | `/data/hero/iron-knight/img/abilities/hold-the-line.webp` | Raised shield wall or defensive formation symbol |
| `bulwark` | Bulwark | passive | `/data/hero/iron-knight/img/abilities/bulwark.webp` | Heavy shield intercepting incoming strikes for allies |
| `retribution` | Retribution | reaction | `/data/hero/iron-knight/img/abilities/retribution.webp` | Reflected light impact bouncing off steel |
| `last-stand` | Last Stand | reaction | `/data/hero/iron-knight/img/abilities/last-stand.webp` | Cracked shield reigniting with stubborn light |
| `vow-of-two-shields` | Vow of Two Shields | reaction | `/data/hero/iron-knight/img/abilities/vow-of-two-shields.webp` | Two interlocking shields with a shared oath glow |
| `unbreakable-oath` | Unbreakable Oath | ultimate | `/data/hero/iron-knight/img/abilities/unbreakable-oath.webp` | Radiant shield dome with a cleansing light burst |

## Suggested Future Data Hook

If `data/hero/<slug>/abilities.json` is added per `docs/hero-behaviors.md`, each ability entry should carry an icon path that matches this manifest. Example:

```json
{
  "id": "fire-bolt",
  "name": "Fire Bolt",
  "icon_image": "/data/hero/flame-warlock/img/abilities/fire-bolt.webp"
}
```
