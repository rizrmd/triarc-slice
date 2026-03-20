#!/usr/bin/env node
// One-time migration: adds gameplay fields to action JSONs and fixes target_rule
// to match vg-server content.gleam values.
// Run: node scripts/migrate-gameplay-data.mjs

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(import.meta.dirname, '..', 'data', 'action');

// Server-authoritative data from vg-server/src/vg/content.gleam
const SERVER_DATA = {
  "fireball":       { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1500, effect_kind: "damage",            base_power: 25, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "flame-lance":    { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1200, effect_kind: "damage_and_status", base_power: 20, status_kind: "dot",          status_duration_ms: 4000, status_value: 6 } },
  "frostbolt":      { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1000, effect_kind: "damage",            base_power: 15, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "blizzard":       { target_rule: "enemy_single",  gameplay: { casting_time_ms: 2500, effect_kind: "damage_and_status", base_power: 28, status_kind: "attack_buff",  status_duration_ms: 4000, status_value: -10 } },
  "ice-nova":       { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1800, effect_kind: "damage_and_status", base_power: 18, status_kind: "attack_buff",  status_duration_ms: 3000, status_value: -12 } },
  "fortify":        { target_rule: "ally_single",   gameplay: { casting_time_ms: 1000, effect_kind: "shield",            base_power: 30, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "shield-wall":    { target_rule: "ally_single",   gameplay: { casting_time_ms: 1200, effect_kind: "status",            base_power: 0,  status_kind: "shield",       status_duration_ms: 6000, status_value: 20 } },
  "stand-firm":     { target_rule: "self",          gameplay: { casting_time_ms: 800,  effect_kind: "status",            base_power: 0,  status_kind: "shield",       status_duration_ms: 4000, status_value: 15 } },
  "poison-strike":  { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1400, effect_kind: "damage_and_status", base_power: 16, status_kind: "dot",          status_duration_ms: 5000, status_value: 7 } },
  "toxic-coating":  { target_rule: "ally_single",   gameplay: { casting_time_ms: 800,  effect_kind: "status",            base_power: 0,  status_kind: "attack_buff",  status_duration_ms: 5000, status_value: 10 } },
  "chain-spark":    { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1200, effect_kind: "damage",            base_power: 22, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "smoke-bomb":     { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1000, effect_kind: "status",            base_power: 0,  status_kind: "attack_buff",  status_duration_ms: 4000, status_value: -15 } },
  "time-slip":      { target_rule: "ally_single",   gameplay: { casting_time_ms: 1400, effect_kind: "status",            base_power: 0,  status_kind: "attack_buff",  status_duration_ms: 5000, status_value: 18 } },
  "arcane-blast":   { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1800, effect_kind: "damage",            base_power: 32, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "holy":           { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1500, effect_kind: "damage",            base_power: 24, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "mana-weave":     { target_rule: "ally_single",   gameplay: { casting_time_ms: 1000, effect_kind: "heal",              base_power: 20, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "mirror-shield":  { target_rule: "ally_single",   gameplay: { casting_time_ms: 1200, effect_kind: "shield",            base_power: 45, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "rally-cry":      { target_rule: "ally_single",   gameplay: { casting_time_ms: 1000, effect_kind: "status",            base_power: 0,  status_kind: "attack_buff",  status_duration_ms: 5000, status_value: 14 } },
  "cursed-dart":    { target_rule: "enemy_single",  gameplay: { casting_time_ms: 900,  effect_kind: "damage_and_status", base_power: 12, status_kind: "shield",       status_duration_ms: 4000, status_value: -10 } },
  "leech-blade":    { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1400, effect_kind: "damage_and_status", base_power: 20, status_kind: "hot",          status_duration_ms: 4000, status_value: 8 } },
  "shadowstep":     { target_rule: "enemy_single",  gameplay: { casting_time_ms: 800,  effect_kind: "damage",            base_power: 26, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "garrote":        { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1200, effect_kind: "damage_and_status", base_power: 14, status_kind: "dot",          status_duration_ms: 6000, status_value: 8 } },
  "shiv":           { target_rule: "enemy_single",  gameplay: { casting_time_ms: 600,  effect_kind: "damage",            base_power: 10, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "charge":         { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1000, effect_kind: "damage_and_status", base_power: 22, status_kind: "stun",         status_duration_ms: 1500, status_value: 0 } },
  "cleave":         { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1200, effect_kind: "damage",            base_power: 24, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "execute":        { target_rule: "enemy_single",  gameplay: { casting_time_ms: 2000, effect_kind: "damage",            base_power: 40, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "riposte":        { target_rule: "self",          gameplay: { casting_time_ms: 600,  effect_kind: "status",            base_power: 0,  status_kind: "shield",       status_duration_ms: 3000, status_value: 12 } },
  "intercept":      { target_rule: "ally_single",   gameplay: { casting_time_ms: 800,  effect_kind: "shield",            base_power: 25, status_kind: null,          status_duration_ms: 0,    status_value: 0 } },
  "taunt":          { target_rule: "self",          gameplay: { casting_time_ms: 600,  effect_kind: "status",            base_power: 0,  status_kind: "shield",       status_duration_ms: 4000, status_value: 18 } },
  "mark-target":    { target_rule: "enemy_single",  gameplay: { casting_time_ms: 800,  effect_kind: "status",            base_power: 0,  status_kind: "shield",       status_duration_ms: 5000, status_value: -12 } },
  "chain":          { target_rule: "enemy_single",  gameplay: { casting_time_ms: 1000, effect_kind: "damage_and_status", base_power: 14, status_kind: "attack_buff",  status_duration_ms: 3000, status_value: -8 } },
};

function targetRuleToTargeting(rule) {
  switch (rule) {
    case 'ally_single':
      return { side: 'ally', scope: 'single', selection: 'manual', allow_self: true, allow_dead: false };
    case 'self':
      return { side: 'ally', scope: 'single', selection: 'manual', allow_self: true, allow_dead: false };
    case 'enemy_single':
    default:
      return { side: 'enemy', scope: 'single', selection: 'manual', allow_self: false, allow_dead: false };
  }
}

const slugs = readdirSync(DATA_DIR).filter(f => !f.startsWith('.'));

for (const slug of slugs) {
  const jsonPath = join(DATA_DIR, slug, 'action.json');
  let data;
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch {
    console.warn(`Skipping ${slug}: no action.json`);
    continue;
  }

  const server = SERVER_DATA[slug];
  if (!server) {
    console.warn(`No server data for ${slug}, adding default gameplay`);
    if (!data.gameplay) {
      data.gameplay = {
        casting_time_ms: 1000,
        effect_kind: 'damage',
        base_power: 10,
        status_kind: null,
        status_duration_ms: 0,
        status_value: 0,
      };
    }
  } else {
    // Fix target_rule and targeting to match server
    data.target_rule = server.target_rule;
    data.targeting = targetRuleToTargeting(server.target_rule);
    data.gameplay = server.gameplay;
  }

  writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated ${slug}`);
}

console.log('Done! All action JSONs updated with gameplay data.');
