#!/usr/bin/env node
// Generates vg-server/src/vg/content.gleam hero section from data/ JSON files.
// Run: node scripts/sync-content.mjs
// Run after editing hero data in the editor.
//
// NOTE: Action definitions live in vg-server/src/vg/actions.gleam
// (server-owned balance source of truth). This script does NOT touch
// actions — only hero defs.

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const HERO_DIR = join(ROOT, 'data', 'hero');
const OUTPUT = join(ROOT, '..', 'vg-server', 'src', 'vg', 'content.gleam');

// --- Helpers ---

function slugToFn(slug) {
  return slug.replace(/-/g, '_');
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

// --- Main ---

const heroes = readHeroes();

let out = `// Static hero content definitions - auto-generated from triarc-slice data/
// Regenerate with: node scripts/sync-content.mjs
// NOTE: Action definitions live in vg/actions.gleam (server-owned, not auto-generated)

import gleam/dict.{type Dict}
import vg/types.{type HeroDef, HeroDef}

pub fn hero_definitions() -> Dict(String, HeroDef) {
  dict.from_list([
${heroes.map(h => `    #("${h.slug}", ${slugToFn(h.slug)}()),`).join('\n')}
  ])
}

${heroes.map(h => generateHeroFn(h)).join('\n\n')}

pub fn get_hero_def(slug: String) -> Result(HeroDef, Nil) {
  dict.get(hero_definitions(), slug)
}

pub fn get_all_hero_slugs() -> List(String) {
  dict.keys(hero_definitions())
}
`;

writeFileSync(OUTPUT, out);
console.log(`Generated ${OUTPUT}`);
console.log(`  ${heroes.length} heroes synced`);
