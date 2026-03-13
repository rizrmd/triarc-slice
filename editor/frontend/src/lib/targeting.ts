import type { ActionTargeting, TargetRule } from '@/types';

const DEFAULT_TARGETING: ActionTargeting = {
  side: 'enemy',
  scope: 'single',
  selection: 'manual',
  allow_self: false,
  allow_dead: false,
};

export function targetRuleToTargeting(rule?: string | null): ActionTargeting {
  switch (rule) {
    case 'ally_single':
      return { side: 'ally', scope: 'single', selection: 'manual', allow_self: true, allow_dead: false };
    case 'self':
      return { side: 'ally', scope: 'single', selection: 'manual', allow_self: true, allow_dead: false };
    case 'any_single':
      return { side: 'any', scope: 'single', selection: 'manual', allow_self: true, allow_dead: false };
    case 'enemy_auto':
      return { side: 'enemy', scope: 'single', selection: 'auto', allow_self: false, allow_dead: false };
    case 'ally_auto':
      return { side: 'ally', scope: 'single', selection: 'auto', allow_self: true, allow_dead: false };
    case 'any_auto':
      return { side: 'any', scope: 'single', selection: 'auto', allow_self: true, allow_dead: false };
    case 'no_target':
      return { side: 'ally', scope: 'none', selection: 'auto', allow_self: true, allow_dead: false };
    case 'enemy_single':
    default:
      return { ...DEFAULT_TARGETING };
  }
}

export function normalizeTargeting(targeting?: Partial<ActionTargeting> | null, legacyRule?: string | null): ActionTargeting {
  const base = targetRuleToTargeting(legacyRule);
  return {
    side: targeting?.side ?? base.side,
    scope: targeting?.scope ?? base.scope,
    selection: targeting?.selection ?? base.selection,
    allow_self: targeting?.allow_self ?? base.allow_self ?? false,
    allow_dead: targeting?.allow_dead ?? base.allow_dead ?? false,
  };
}

export function targetingToTargetRule(targeting?: Partial<ActionTargeting> | null): TargetRule {
  const normalized = normalizeTargeting(targeting);
  if (normalized.scope === 'none') return 'no_target';
  if (normalized.selection === 'auto') {
    switch (normalized.side) {
      case 'ally':
        return 'ally_auto';
      case 'any':
        return 'any_auto';
      case 'enemy':
      default:
        return 'enemy_auto';
    }
  }
  if (normalized.side === 'any') return 'any_single';
  if (normalized.side === 'ally' && normalized.allow_self) return 'ally_single';
  if (normalized.side === 'ally') return 'ally_single';
  return 'enemy_single';
}
