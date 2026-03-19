import type {
  AnimapConfig,
  AnimapLayer,
  AnimapLayerStateOverride,
  AnimapState,
  AnimapTransition,
} from '@/types';

const DEFAULT_STATE_ID = 'default';

const STATEFUL_LAYER_KEYS = [
  'visible',
  'opacity',
  'x',
  'y',
  'scale',
  'loop',
  'loop_start',
  'loop_end',
  'targets',
  'hue',
  'saturation',
  'lightness',
  'brightness',
  'contrast',
] as const;

type StatefulLayerKey = (typeof STATEFUL_LAYER_KEYS)[number];

export function normalizeAnimapConfig(config: AnimapConfig): AnimapConfig {
  const states = config.states ?? [];
  const withoutDefault = states.filter((state) => state.id !== DEFAULT_STATE_ID);

  return {
    ...config,
    states: [
      {
        id: DEFAULT_STATE_ID,
        name: 'Default',
        transitions_to: {},
        transitions_from: {},
      },
      ...withoutDefault.map((state) => ({
        ...state,
        layer_overrides: state.layer_overrides ?? {},
        transitions_to: state.transitions_to ?? {},
        transitions_from: state.transitions_from ?? {},
      })),
    ],
  };
}

export function getAnimapState(config: AnimapConfig, stateId: string): AnimapState {
  return normalizeAnimapConfig(config).states!.find((state) => state.id === stateId) ?? normalizeAnimapConfig(config).states![0];
}

export function getEffectiveLayer(config: AnimapConfig, layer: AnimapLayer, stateId: string): AnimapLayer {
  if (stateId === DEFAULT_STATE_ID) {
    return layer;
  }

  const state = getAnimapState(config, stateId);
  const override = state.layer_overrides?.[layer.id];
  return override ? { ...layer, ...override } : layer;
}

export function getEffectiveLayers(config: AnimapConfig, stateId: string): AnimapLayer[] {
  return config.layers.map((layer) => getEffectiveLayer(config, layer, stateId));
}

export function updateStateLayerOverride(
  config: AnimapConfig,
  stateId: string,
  layerId: string,
  key: keyof AnimapLayerStateOverride,
  value: AnimapLayerStateOverride[keyof AnimapLayerStateOverride],
): AnimapConfig {
  if (stateId === DEFAULT_STATE_ID) {
    return {
      ...config,
      layers: config.layers.map((layer) => (layer.id === layerId ? { ...layer, [key]: value } : layer)),
    };
  }

  const baseLayer = config.layers.find((layer) => layer.id === layerId);
  if (!baseLayer) return config;

  return {
    ...config,
    states: normalizeAnimapConfig(config).states!.map((state) => {
      if (state.id !== stateId) return state;

      const currentOverrides = { ...(state.layer_overrides ?? {}) };
      const currentLayerOverride = { ...(currentOverrides[layerId] ?? {}) };
      const baseValue = baseLayer[key as keyof AnimapLayer];
      const nextValue = value;

      if (areOverrideValuesEqual(baseValue, nextValue)) {
        delete currentLayerOverride[key];
      } else {
        currentLayerOverride[key] = nextValue as never;
      }

      if (Object.keys(currentLayerOverride).length === 0) {
        delete currentOverrides[layerId];
      } else {
        currentOverrides[layerId] = currentLayerOverride;
      }

      return {
        ...state,
        layer_overrides: currentOverrides,
      };
    }),
  };
}

export function clearStateLayerOverride(config: AnimapConfig, stateId: string, layerId: string, key: keyof AnimapLayerStateOverride): AnimapConfig {
  if (stateId === DEFAULT_STATE_ID) {
    return config;
  }

  return {
    ...config,
    states: normalizeAnimapConfig(config).states!.map((state) => {
      if (state.id !== stateId) return state;
      const currentOverrides = { ...(state.layer_overrides ?? {}) };
      const currentLayerOverride = { ...(currentOverrides[layerId] ?? {}) };
      delete currentLayerOverride[key];

      if (Object.keys(currentLayerOverride).length === 0) {
        delete currentOverrides[layerId];
      } else {
        currentOverrides[layerId] = currentLayerOverride;
      }

      return {
        ...state,
        layer_overrides: currentOverrides,
      };
    }),
  };
}

export function addAnimapState(config: AnimapConfig, name: string): { config: AnimapConfig; stateId: string } {
  const slug = slugifyStateName(name);
  const existingIds = new Set(normalizeAnimapConfig(config).states!.map((state) => state.id));
  let stateId = slug || 'state';
  let suffix = 2;

  while (existingIds.has(stateId)) {
    stateId = `${slug || 'state'}-${suffix++}`;
  }

  return {
    stateId,
    config: {
      ...config,
      states: [
        ...normalizeAnimapConfig(config).states!,
        {
          id: stateId,
          name: name.trim(),
          layer_overrides: {},
          transitions_to: {},
          transitions_from: {},
        },
      ],
    },
  };
}

export function deleteAnimapState(config: AnimapConfig, stateId: string): AnimapConfig {
  if (stateId === DEFAULT_STATE_ID) return config;

  return {
    ...config,
    states: normalizeAnimapConfig(config).states!
      .filter((state) => state.id !== stateId)
      .map((state) => {
        const transitionsTo = { ...(state.transitions_to ?? {}) };
        const transitionsFrom = { ...(state.transitions_from ?? {}) };
        delete transitionsTo[stateId];
        delete transitionsFrom[stateId];
        return {
          ...state,
          transitions_to: transitionsTo,
          transitions_from: transitionsFrom,
        };
      }),
  };
}

export function renameAnimapState(config: AnimapConfig, stateId: string, name: string): AnimapConfig {
  return {
    ...config,
    states: normalizeAnimapConfig(config).states!.map((state) => (state.id === stateId ? { ...state, name } : state)),
  };
}

export function updateAnimapTransition(
  config: AnimapConfig,
  stateId: string,
  direction: 'to' | 'from',
  otherStateId: string,
  transition: AnimapTransition | null,
): AnimapConfig {
  return {
    ...config,
    states: normalizeAnimapConfig(config).states!.map((state) => {
      if (state.id !== stateId) return state;
      const key = direction === 'to' ? 'transitions_to' : 'transitions_from';
      const transitions = { ...(state[key] ?? {}) };
      if (!transition || transition.mode === 'instant') {
        delete transitions[otherStateId];
      } else {
        transitions[otherStateId] = transition;
      }
      return {
        ...state,
        [key]: transitions,
      };
    }),
  };
}

export function getAnimapTransition(state: AnimapState, direction: 'to' | 'from', otherStateId: string): AnimapTransition {
  const source = direction === 'to' ? state.transitions_to : state.transitions_from;
  return source?.[otherStateId] ?? { mode: 'instant', duration_ms: 0 };
}

export function getStateOverrideValue(
  config: AnimapConfig,
  stateId: string,
  layerId: string,
  key: keyof AnimapLayerStateOverride,
): AnimapLayerStateOverride[keyof AnimapLayerStateOverride] | undefined {
  if (stateId === DEFAULT_STATE_ID) return undefined;
  return getAnimapState(config, stateId).layer_overrides?.[layerId]?.[key];
}

export function isStateOverrideKey(key: string): key is StatefulLayerKey {
  return STATEFUL_LAYER_KEYS.includes(key as StatefulLayerKey);
}

function areOverrideValuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function slugifyStateName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export { DEFAULT_STATE_ID };
