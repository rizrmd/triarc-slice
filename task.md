# Task List

## Server Sync - Action Damage Stats

### Background
Game client menggunakan `data/action/*.json` untuk visual display.
Server (vg-server) menggunakan `content.gleam` (hasil generate dari sync-content.mjs) untuk damage calculation.

Damage calculation di server ada di `match_logic.gleam`:
```gleam
pub fn calculate_damage(action: ActionDef, ...) -> Int {
  let base_power = int.to_float(action.base_power)
  ...
}
```

### Steps

- [ ] 1. SSH ke server: `ssh rizz@avolut.com`
- [ ] 2. Sync content: `cd ~/triarc-slice && node scripts/sync-content.mjs`
- [ ] 3. Build server: `cd ~/vg-server && gleam build`
- [ ] 4. Restart server service

### Notes
- arcane-blast sudah diupdate dengan base_power: 45 di `data/action/arcane-blast/action.json`
- Perlu sync dan rebuild server agar damage terpakai
