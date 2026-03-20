#!/usr/bin/env node
// Generates vg-server/src/vg/content.gleam from data/ JSON files.
// Run: node scripts/sync-content.mjs
// Run after editing hero/action data in the editor.

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const HERO_DIR = join(ROOT, 'data', 'hero');
const ACTION_DIR = join(ROOT, 'data', 'action');
const OUTPUT = join(ROOT, '..', 'vg-server', 'src', 'vg', 'content.gleam');

// --- Helpers ---

function slugToFn(slug) {
  return slug.replace(/-/g, '_');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function elementToGleam(el) {
  const map = { fire: 'Fire', ice: 'Ice', earth: 'Earth', wind: 'Wind', light: 'Light', shadow: 'Shadow' };
  return map[el] || 'Earth';
}

function targetRuleToGleam(rule) {
  const map = {
    enemy_single: 'EnemySingle', ally_single: 'AllySingle', self: 'Self',
    any_single: 'AnySingle', enemy_auto: 'EnemyAuto', ally_auto: 'AllyAuto',
    any_auto: 'AnyAuto', no_target: 'NoTarget',
  };
  return map[rule] || 'EnemySingle';
}

function effectKindToGleam(kind) {
  const map = {
    damage: 'Damage', heal: 'Heal', shield: 'Shield',
    status: 'Status', damage_and_status: 'DamageAndStatus', cleanse: 'Cleanse',
  };
  return map[kind] || 'Damage';
}

function statusKindToGleam(kind) {
  if (!kind) return 'None';
  const map = {
    stun: 'Some(Stun)', shield: 'Some(ShieldBuff)', attack_buff: 'Some(AttackBuff)',
    defense_buff: 'Some(DefenseBuff)', dot: 'Some(Dot)', hot: 'Some(Hot)',
  };
  return map[kind] || 'None';
}

// --- Read data ---

function readHeroes() {
  const slugs = readdirSync(HERO_DIR).filter(f => !f.startsWith('.'));
  const heroes = [];
  for (const slug of slugs) {
    try {
      const data = JSON.parse(readFileSync(join(HERO_DIR, slug, 'hero.json'), 'utf8'));
      heroes.push({ slug, data });
    } catch { /* skip */ }
  }
  return heroes.sort((a, b) => a.slug.localeCompare(b.slug));
}

function readActions() {
  const slugs = readdirSync(ACTION_DIR).filter(f => !f.startsWith('.'));
  const actions = [];
  for (const slug of slugs) {
    try {
      const data = JSON.parse(readFileSync(join(ACTION_DIR, slug, 'action.json'), 'utf8'));
      actions.push({ slug, data });
    } catch { /* skip */ }
  }
  return actions.sort((a, b) => a.slug.localeCompare(b.slug));
}

// --- Group actions by element ---

function groupActionsByElement(actions) {
  const order = ['fire', 'ice', 'earth', 'wind', 'light', 'shadow'];
  const groups = {};
  for (const el of order) groups[el] = [];
  groups['neutral'] = [];

  for (const action of actions) {
    const el = action.data.element?.[0];
    if (el && groups[el]) {
      groups[el].push(action);
    } else {
      groups['neutral'].push(action);
    }
  }
  return groups;
}

// --- Generate Gleam ---

function generateHeroFn({ slug, data }) {
  const stats = data.stats || {};
  const affinity = stats.element_affinity || {};
  return `fn ${slugToFn(slug)}() -> HeroDef {
  HeroDef(
    slug: "${slug}",
    display_name: "${data.full_name}",
    max_hp: ${stats.max_hp || 2500},
    attack: ${stats.attack || 100},
    defense: ${stats.defense || 100},
    fire_affinity: ${affinity.fire || 0},
    ice_affinity: ${affinity.ice || 0},
    earth_affinity: ${affinity.earth || 0},
    wind_affinity: ${affinity.wind || 0},
    light_affinity: ${affinity.light || 0},
    shadow_affinity: ${affinity.shadow || 0},
  )
}`;
}

function generateActionFn({ slug, data }) {
  const gp = data.gameplay || {};
  const element = data.element?.[0] || 'earth';
  const targetRule = data.target_rule || 'enemy_single';
  return `fn ${slugToFn(slug)}() -> ActionDef {
  ActionDef(slug: "${slug}", display_name: "${data.full_name}", element: ${elementToGleam(element)},
    target_rule: ${targetRuleToGleam(targetRule)}, energy_cost: ${data.cost || 0}, casting_time_ms: ${gp.casting_time_ms || 1000},
    effect_kind: ${effectKindToGleam(gp.effect_kind)}, base_power: ${gp.base_power || 0},
    status_kind: ${statusKindToGleam(gp.status_kind)}, status_duration_ms: ${gp.status_duration_ms || 0}, status_value: ${gp.status_value || 0})
}`;
}

// --- Main ---

const heroes = readHeroes();
const actions = readActions();
const actionGroups = groupActionsByElement(actions);

// Collect all needed imports
const usedElements = new Set();
const usedTargetRules = new Set();
const usedEffectKinds = new Set();
const usedStatusKinds = new Set();
let needsSome = false;
let needsNone = false;

for (const { data } of actions) {
  const el = data.element?.[0] || 'earth';
  usedElements.add(elementToGleam(el));
  usedTargetRules.add(targetRuleToGleam(data.target_rule || 'enemy_single'));
  const gp = data.gameplay || {};
  usedEffectKinds.add(effectKindToGleam(gp.effect_kind || 'damage'));
  if (gp.status_kind) {
    needsSome = true;
    const gleamStatus = statusKindToGleam(gp.status_kind);
    // Extract just the type name from "Some(Stun)" -> "Stun"
    const match = gleamStatus.match(/Some\((\w+)\)/);
    if (match) usedStatusKinds.add(match[1]);
  } else {
    needsNone = true;
  }
}

const optionImports = [needsSome && 'Some', needsNone && 'None'].filter(Boolean).join(', ');
const typeImports = [
  'type ActionDef', 'type HeroDef', 'ActionDef', 'HeroDef',
  ...Array.from(usedTargetRules).sort(),
  ...Array.from(usedElements).sort(),
  ...Array.from(usedEffectKinds).sort(),
  ...Array.from(usedStatusKinds).sort(),
].join(', ');

const elementLabels = { fire: 'Fire', ice: 'Ice', earth: 'Earth', wind: 'Wind', light: 'Light', shadow: 'Shadow', neutral: 'Physical / Neutral' };

let out = `// Static content definitions - heroes and actions
// Auto-generated from triarc-slice data/ — do not edit by hand.
// Regenerate with: node scripts/sync-content.mjs

import gleam/dict.{type Dict}
import gleam/option.{${optionImports}}
import vg/types.{
  ${typeImports},
}

// ============================================================================
// Hero definitions
// ============================================================================

pub fn hero_definitions() -> Dict(String, HeroDef) {
  dict.from_list([
${heroes.map(h => `    #("${h.slug}", ${slugToFn(h.slug)}()),`).join('\n')}
  ])
}

${heroes.map(h => generateHeroFn(h)).join('\n\n')}

// ============================================================================
// Action definitions
// ============================================================================

pub fn action_definitions() -> Dict(String, ActionDef) {
  // Slugs must match editor data/action/ directory names (hyphens, not underscores)
  dict.from_list([
${actions.map(a => `    #("${a.slug}", ${slugToFn(a.slug)}()),`).join('\n')}
  ])
}

// ---------------------------------------------------------------------------
// Action definitions — slugs match editor data/action/ directory names
// ---------------------------------------------------------------------------

`;

for (const [group, groupActions] of Object.entries(actionGroups)) {
  if (groupActions.length === 0) continue;
  out += `// -- ${elementLabels[group] || capitalize(group)} --\n`;
  out += groupActions.map(a => generateActionFn(a)).join('\n');
  out += '\n\n';
}

out += `// ============================================================================
// Helper functions
// ============================================================================

pub fn get_hero_def(slug: String) -> Result(HeroDef, Nil) {
  dict.get(hero_definitions(), slug)
}

pub fn get_action_def(slug: String) -> Result(ActionDef, Nil) {
  dict.get(action_definitions(), slug)
}

pub fn get_all_action_slugs() -> List(String) {
  dict.keys(action_definitions())
}

pub fn get_all_hero_slugs() -> List(String) {
  dict.keys(hero_definitions())
}
`;

writeFileSync(OUTPUT, out);
console.log(`Generated ${OUTPUT}`);
console.log(`  ${heroes.length} heroes, ${actions.length} actions`);
