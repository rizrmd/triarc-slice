#!/usr/bin/env node
/**
 * Generate VFX configurations for all action cards
 * 
 * This script:
 * 1. Scans each action directory for .efkefc files
 * 2. Generates a sensible VFX config based on the action's element and targeting
 * 3. Adds the vfx config to action.json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';

const ACTIONS_DIR = 'data/action';

// Get all action directories
const actionDirs = readdirSync(ACTIONS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

console.log(`Found ${actionDirs.length} actions\n`);

let updated = 0;
let skipped = 0;

for (const slug of actionDirs) {
  const actionDir = join(ACTIONS_DIR, slug);
  const actionJsonPath = join(actionDir, 'action.json');
  
  // Check if action.json exists
  if (!existsSync(actionJsonPath)) {
    console.log(`⚠️  ${slug}: action.json not found, skipping`);
    skipped++;
    continue;
  }
  
  // Find VFX directory (vfx or VFX)
  const vfxDir = join(actionDir, 'vfx');
  const vfxDirUpper = join(actionDir, 'VFX');
  const actualVfxDir = existsSync(vfxDir) ? vfxDir : (existsSync(vfxDirUpper) ? vfxDirUpper : null);
  
  if (!actualVfxDir) {
    console.log(`⚠️  ${slug}: No vfx directory found, skipping`);
    skipped++;
    continue;
  }
  
  // Find .efkefc files
  const vfxFiles = readdirSync(actualVfxDir)
    .filter(f => extname(f).toLowerCase() === '.efkefc')
    .sort();
  
  if (vfxFiles.length === 0) {
    console.log(`⚠️  ${slug}: No .efkefc files found, skipping`);
    skipped++;
    continue;
  }
  
  // Use the first effect file (or prefer one matching the action name)
  let effectFile = vfxFiles[0];
  for (const file of vfxFiles) {
    const baseName = basename(file, extname(file)).toLowerCase();
    if (baseName.includes(slug.replace('-', '')) || baseName.includes(slug.replace('-', ' '))) {
      effectFile = file;
      break;
    }
  }
  
  // Read action.json
  let actionConfig;
  try {
    const content = readFileSync(actionJsonPath, 'utf-8');
    actionConfig = JSON.parse(content);
  } catch (e) {
    console.log(`❌ ${slug}: Failed to parse action.json: ${e.message}`);
    skipped++;
    continue;
  }
  
  // Check if vfx config already exists and is valid
  if (actionConfig.vfx && actionConfig.vfx.enabled && actionConfig.vfx.effect_file) {
    console.log(`✅ ${slug}: Already has valid vfx config (${actionConfig.vfx.effect_file}), skipping`);
    skipped++;
    continue;
  }
  
  // Determine sensible defaults based on action properties
  const element = Array.isArray(actionConfig.element) ? actionConfig.element[0] : null;
  const targeting = actionConfig.targeting || {};
  const side = targeting.side || 'enemy';
  const gameplay = actionConfig.gameplay || {};
  const effectKind = gameplay.effect_kind || 'damage';
  const allowSelf = targeting.allow_self || false;
  
  // Determine targets:
  // - Most actions target the RECIPIENT (enemy being hit, ally being buffed)
  // - Self-cast actions (allow_self + ally/enemy side) target the CASTER
  let targets = { caster: false, target: true }; // Default: only target
  
  // Self-cast abilities (e.g., shadowstep - teleport to self)
  if (allowSelf && side === 'ally' && targeting.scope === 'none') {
    targets = { caster: true, target: false };
  }
  
  // Determine sensible position offset based on element
  let positionOffset = { x: 0, y: -50 }; // Default above hero
  if (element === 'fire') {
    positionOffset = { x: 0, y: -70 }; // Fire effects tend to be bigger
  } else if (element === 'ice') {
    positionOffset = { x: 0, y: -60 };
  } else if (element === 'shadow') {
    positionOffset = { x: 0, y: -40 }; // Shadow effects are often centered
  } else if (element === 'light') {
    positionOffset = { x: 0, y: -80 }; // Holy/light effects need space
  }
  
  // Determine scale multiplier based on action type
  let scaleMultiplier = 1.5; // Default
  if (slug.includes('nova') || slug.includes('blizzard') || slug.includes('cleave') || slug.includes('aoe')) {
    scaleMultiplier = 2.0; // Area effects need to be bigger
  } else if (slug.includes('strike') || slug.includes('shot') || slug.includes('bolt')) {
    scaleMultiplier = 1.2; // Single target projectiles are smaller
  } else if (effectKind === 'heal' || effectKind === 'shield') {
    scaleMultiplier = 1.8; // Buff effects should be visible
  }
  
  // Create vfx config
  const vfxConfig = {
    enabled: true,
    effect_file: effectFile,
    targets: targets,
    position_offset: positionOffset,
    scale_multiplier: scaleMultiplier
  };
  
  // Add to action config
  actionConfig.vfx = vfxConfig;
  
  // Write back
  try {
    writeFileSync(actionJsonPath, JSON.stringify(actionConfig, null, 2) + '\n');
    console.log(`✅ ${slug}: Added VFX config (${effectFile}, targets: ${JSON.stringify(targets)}, scale: ${scaleMultiplier})`);
    updated++;
  } catch (e) {
    console.log(`❌ ${slug}: Failed to write action.json: ${e.message}`);
    skipped++;
  }
}

console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
