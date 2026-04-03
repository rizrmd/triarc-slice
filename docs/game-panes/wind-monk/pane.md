# Wind Monk - Opening Flow Pane

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      ✦ OPENING FLOW ✦                                   │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    FLOW COUNTER                               │      │
│  ├───────────────────────────────────────────────────────────────┤      │
│  │                                                               │      │
│  │     〜  [●●●●●●●]  7/7  (START OF MATCH)                      │      │
│  │                                                               │      │
│  │     ~ Flow decreases by 1 each time a technique is used       │      │
│  │                                                               │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                     FOUR TECHNIQUES                               ││
│  │                     (Choose 1 per Action Card)                    ││
│  ├─────────────────────────────────────────────────────────────────────┤│
│  │                                                                   ││
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────┐││
│  │   │   〜 1       │  │   〜 1       │  │   〜 1       │  │  〜 1  │││
│  │   │              │  │              │  │              │  │        │││
│  │   │   PRESSURE   │  │    SLIP      │  │   RETURNING  │  │  FLOW  │││
│  │   │    PALM      │  │   BETWEEN    │  │   BREATH     │  │ BREAK  │││
│  │   │              │  │              │  │              │  │        │││
│  │   │  Card plays  │  │  Card plays  │  │  Card plays  │  │ Card   │││
│  │   │  normally +  │  │  normally +  │  │  normally +  │  │ plays  │││
│  │   │  bonus dmg   │  │  big shield  │  │  counter-    │  │ +      │││
│  │   │  to target   │  │  next turn   │  │  attack      │  │ weaken │││
│  │   │              │  │              │  │              │  │ target │││
│  │   └──────────────┘  └──────────────┘  └──────────────┘  └────────┘││
│  │                                                                   ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                     HOW IT WORKS                              │      │
│  ├───────────────────────────────────────────────────────────────┤      │
│  │                                                               │      │
│  │   1. Play Action Card on Tenzin                               │      │
│  │          ↓                                                    │      │
│  │   2. Choose 1 of 4 Techniques (costs 1 Flow)                  │      │
│  │          ↓                                                    │      │
│  │   3. Card resolves normally + Technique effect                │      │
│  │          ↓                                                    │      │
│  │   4. Flow -1                                                  │      │
│  │          ↓                                                    │      │
│  │   5. Repeat until Flow = 0                                    │      │
│  │          ↓                                                    │      │
│  │   6. Tenzin returns to normal state                           │      │
│  │                                                               │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                     STRATEGY                                  │      │
│  ├───────────────────────────────────────────────────────────────┤      │
│  │  • Strong early game (7 enhanced actions)                     │      │
│  │  • Plan Flow usage carefully - once gone, it's gone           │      │
│  │  • Mix offense (Pressure Palm, Flow Break) and                │      │
│  │    defense (Slip Between, Returning Breath)                   │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Legend

| Symbol | Meaning |
|--------|---------|
| 〜 | Flow point |
| ● | Flow available |
| ○ | Flow used |

## Technique Details

| Technique | Cost | Effect |
|-----------|------|--------|
| Pressure Palm | 1 Flow | Card plays normally + bonus damage to target |
| Slip Between | 1 Flow | Card plays normally + big protection next turn |
| Returning Breath | 1 Flow | Card plays normally + counter-attack on next attacker |
| Flow Break | 1 Flow | Card plays normally + weaken target temporarily |

## Gameplay Flow

```
┌─────────────────┐
│  START MATCH    │
│    Flow = 7     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Play Action Card        │
│ on Tenzin               │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐     ┌──────────────────┐
│ Choose 1 Technique:     │     │ No Flow?         │
│ • Pressure Palm         │────▶│ → Normal card    │
│ • Slip Between          │     │   play only      │
│ • Returning Breath      │     └──────────────────┘
│ • Flow Break            │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Card resolves +         │
│ Technique bonus         │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐     ┌──────────────────┐
│ Flow -1                 │────▶│ Flow = 0?        │
│                         │     │ → Normal state   │
└────────┬────────────────┘     └──────────────────┘
         │
         ▼
    (Repeat)
```
