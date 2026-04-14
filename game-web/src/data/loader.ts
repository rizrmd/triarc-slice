import type { HeroData, ActionData } from '../types/game';

// Slugs mirror the Godot game_state.gd hardcoded definitions
const HERO_SLUGS = [
  'iron-knight', 'arc-strider', 'necromancer', 'spellblade-empress',
  'earth-warden', 'dawn-priest', 'flame-warlock', 'blood-alchemist',
  'gunslinger', 'night-venom', 'princess-emberheart', 'demon-empress',
  'tyrant-overlord', 'arcane-paladin', 'storm-ranger', 'wind-monk', 'frost-queen',
];

const ACTION_SLUGS = [
  'fireball', 'flame-lance', 'frostbolt', 'blizzard', 'ice-nova',
  'fortify', 'shield-wall', 'stand-firm', 'poison-strike', 'toxic-coating',
  'chain-spark', 'smoke-bomb', 'time-slip', 'arcane-blast', 'holy',
  'mana-weave', 'mirror-shield', 'rally-cry', 'cursed-dart', 'leech-blade',
  'shadowstep', 'garrote', 'shiv', 'charge', 'cleave', 'execute',
  'riposte', 'intercept', 'taunt', 'mark-target', 'chain',
];

const DATA_BASE = '/data';

export async function loadHeroes(): Promise<Record<string, HeroData>> {
  const heroes: Record<string, HeroData> = {};
  await Promise.all(
    HERO_SLUGS.map(async (slug) => {
      const res = await fetch(`${DATA_BASE}/hero/${slug}/hero.json`);
      if (!res.ok) console.error('failed hero', slug, res.status);
      heroes[slug] = await res.json();
    })
  );
  return heroes;
}

export async function loadActions(): Promise<Record<string, ActionData>> {
  const actions: Record<string, ActionData> = {};
  await Promise.all(
    ACTION_SLUGS.map(async (slug) => {
      const res = await fetch(`${DATA_BASE}/action/${slug}/action.json`);
      if (!res.ok) console.error('failed action', slug, res.status);
      actions[slug] = await res.json();
    })
  );
  return actions;
}

export { HERO_SLUGS, ACTION_SLUGS };
