#!/usr/bin/env node
// One-time migration: converts hero poses from hero.json custom format to animap format.
// Run: node scripts/migrate-poses.mjs
// Requires: ImageMagick (convert command) for resizing char-fg images.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const HERO_DIR = 'data/hero';
const ANIMAP_DIR = 'data/animap';
const CATEGORIES_PATH = path.join(ANIMAP_DIR, 'categories.json');

// Pose reference canvas (matches POSE_REF_SIZE in hero.gd)
const CANVAS_W = 320;
const CANVAS_H = 517;

const heroSlugs = fs.readdirSync(HERO_DIR).filter(f =>
  fs.statSync(path.join(HERO_DIR, f)).isDirectory()
);

const poseSlugs = [];

for (const slug of heroSlugs) {
  const heroJsonPath = path.join(HERO_DIR, slug, 'hero.json');
  const imgDir = path.join(HERO_DIR, slug, 'img');
  const animapSlug = `pose-${slug}`;
  const animapDir = path.join(ANIMAP_DIR, animapSlug);

  // Check if pose images exist
  const charFgPath = path.join(imgDir, 'pose-char-fg.webp');
  const shadowPath = path.join(imgDir, 'pose-shadow.webp');
  const maskFgPath = path.join(imgDir, 'pose-mask-fg.webp');

  if (!fs.existsSync(charFgPath) || !fs.existsSync(shadowPath)) {
    console.log(`SKIP ${slug}: missing pose images`);
    continue;
  }

  // Read hero.json for pose config
  const heroJson = JSON.parse(fs.readFileSync(heroJsonPath, 'utf-8'));
  const pose = heroJson.pose || {};
  const charFgPos = pose.char_fg_pos || { x: 0, y: 0 };
  const charFgScale = pose.char_fg_scale ?? 100;
  const shadowPos = pose.shadow_pos || { x: 0, y: 0 };
  const shadowScale = pose.shadow_scale ?? 100;

  // Create animap directory
  fs.mkdirSync(animapDir, { recursive: true });

  // Resize char-fg from 1024x1536 to 320x517 (bakes in the non-uniform stretch the pose system used)
  console.log(`  Resizing char-fg for ${slug}...`);
  execSync(`convert "${charFgPath}" -resize ${CANVAS_W}x${CANVAS_H}! "${path.join(animapDir, 'char-fg.webp')}"`);

  // Copy shadow (already 320x517)
  fs.copyFileSync(shadowPath, path.join(animapDir, 'shadow.webp'));

  // Convert coordinates:
  // After resizing char-fg to 320x517, both images are at canvas size.
  // scale_multiplier = pose_pct / 100
  // position = center + offset - (canvas_dim * scale / 2)
  //          = canvas_dim/2 + offset - canvas_dim * scale / 2
  //          = canvas_dim/2 * (1 - scale) + offset
  const charScale = charFgScale / 100;
  const charX = (CANVAS_W / 2) * (1 - charScale) + charFgPos.x;
  const charY = (CANVAS_H / 2) * (1 - charScale) + charFgPos.y;

  const shdScale = shadowScale / 100;
  const shdX = (CANVAS_W / 2) * (1 - shdScale) + shadowPos.x;
  const shdY = (CANVAS_H / 2) * (1 - shdScale) + shadowPos.y;

  // Build layers
  const layers = [
    {
      id: 'shadow',
      name: 'Shadow',
      type: 'image',
      file: 'shadow.webp',
      visible: true,
      opacity: 1,
      x: round2(shdX),
      y: round2(shdY),
      scale: round4(shdScale),
    },
    {
      id: 'char-fg',
      name: 'Character',
      type: 'image',
      file: 'char-fg.webp',
      visible: true,
      opacity: 1,
      x: round2(charX),
      y: round2(charY),
      scale: round4(charScale),
    },
  ];

  const animapConfig = {
    name: `Pose: ${heroJson.full_name || slug}`,
    width: CANVAS_W,
    height: CANVAS_H,
    layers,
    states: [{ id: 'default', name: 'Default' }],
  };

  fs.writeFileSync(
    path.join(animapDir, 'animap.json'),
    JSON.stringify(animapConfig, null, 2) + '\n'
  );

  poseSlugs.push(animapSlug);
  console.log(`OK ${slug} -> ${animapSlug} (char: scale=${charScale} x=${round2(charX)} y=${round2(charY)}, shadow: scale=${shdScale} x=${round2(shdX)} y=${round2(shdY)})`);
}

// Update categories.json
const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf-8'));
categories['Pose'] = poseSlugs.sort();
fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(categories, null, 2) + '\n');

console.log(`\nDone. Migrated ${poseSlugs.length} poses. Updated categories.json.`);

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
