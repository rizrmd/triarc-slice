export interface HeroConfig {
  full_name: string;
  frame_image?: string;
  char_bg_pos: {
    x: number;
    y: number;
  };
  char_fg_pos: {
    x: number;
    y: number;
  };
  char_bg_scale: number;
  char_fg_scale: number;
  name_pos: {
    x: number;
    y: number;
  };
  name_scale: number;
  text_shadow_color: string;
  text_shadow_size?: number;
  tint: string;
  lore?: string;
  audio?: Record<string, string>;
  action_overrides?: Record<string, HeroActionOverride>;
  hp_bar_pos: {
    x: number;
    y: number;
  };
  hp_bar_scale: number;
  hp_bar_current: number;
  hp_bar_max: number;
  hp_bar_hue: number;
  hp_bar_font_size?: number;
  pose?: PoseConfig;
  stats?: HeroStats;
  visible_layers?: Partial<VisibleLayers>;
}

export type EffectKind = 'damage' | 'heal' | 'shield' | 'status' | 'damage_and_status' | 'cleanse';
export type StatusKind = 'stun' | 'shield' | 'attack_buff' | 'defense_buff' | 'dot' | 'hot';

export interface ActionGameplay {
  casting_time_ms: number;
  effect_kind: EffectKind;
  base_power: number;
  status_kind: StatusKind | null;
  status_duration_ms: number;
  status_value: number;
}

export interface ActionConfig {
  full_name: string;
  frame_image?: string;
  char_bg_pos: {
    x: number;
    y: number;
  };
  char_bg_scale: number;
  name_pos: {
    x: number;
    y: number;
  };
  name_scale: number;
  text_shadow_color: string;
  text_shadow_size?: number;
  tint: string;
  description?: string;
  cost?: number;
  element?: string[];
  target_rule?: TargetRule;
  targeting?: ActionTargeting;
  gameplay?: ActionGameplay;
  visible_layers?: Partial<VisibleLayers>;
}

export interface ActionTargeting {
  side: TargetSide;
  scope: TargetScope;
  selection: TargetSelection;
  allow_self?: boolean;
  allow_dead?: boolean;
}

export interface HeroActionOverride {
  target_rule?: TargetRule;
  targeting?: ActionTargeting;
}

export type TargetSide = 'enemy' | 'ally' | 'any';
export type TargetScope = 'single' | 'none';
export type TargetSelection = 'manual' | 'auto';
export type TargetRule =
  | 'enemy_single'
  | 'ally_single'
  | 'self'
  | 'any_single'
  | 'enemy_auto'
  | 'ally_auto'
  | 'any_auto'
  | 'no_target';

export type CardConfig = HeroConfig | ActionConfig;

export interface HeroStats {
  max_hp: number;
  attack: number;
  defense: number;
  element_affinity: {
    fire: number;
    ice: number;
    earth: number;
    wind: number;
    light: number;
    shadow: number;
  };
}

export interface PoseConfig {
  char_fg_pos: {
    x: number;
    y: number;
  };
  char_fg_scale: number;
  shadow_pos: {
    x: number;
    y: number;
  };
  shadow_scale: number;
}

export type CharLayer = 'char-bg' | 'char-fg';
export type PoseLayer = 'pose-char-fg' | 'pose-shadow';
export type MaskLayer = 'mask-bg' | 'mask-fg' | 'pose-mask-fg';
export type TextLayer = 'name';
export type BarLayer = 'hp-bar';
export type CharProperty = 'x' | 'y' | 'scale';
export type LayerId = 'char-bg' | 'mask-bg' | 'card' | 'mask-fg' | 'char-fg' | 'name' | 'hp-bar' | 'canvas' | 'pose-frame' | 'pose-char-fg' | 'pose-shadow' | 'pose-mask-fg';
export type AssetPickerTarget = CharLayer | 'card' | PoseLayer | null;
export type AssetItem = { name: string; url: string };

export type VisibleLayers = {
  'char-bg': boolean;
  'mask-bg': boolean;
  card: boolean;
  'mask-fg': boolean;
  'char-fg': boolean;
  name: boolean;
  'hp-bar': boolean;
  'pose-char-fg': boolean;
  'pose-frame': boolean;
  'pose-mask-fg': boolean;
  'pose-shadow': boolean;
};

export type PoseVisibleLayers = {
  'pose-frame': boolean;
  'pose-char-fg': boolean;
  'pose-mask-fg': boolean;
  'pose-shadow': boolean;
};

export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nx?: number;
  ny?: number;
  label: string;
  pivot?: string;
  screen_anchor: string;
  anchor_offset_x: number;
  anchor_offset_y: number;
  fill?: 'contain' | 'cover' | 'stretch' | 'none';
  cardSlug?: string;
  actionSlug?: string;
  poseSlug?: string;
  animapSlug?: string;
  asset?: string;
  locked?: boolean;
  screen_relative?: boolean;
  width_percent?: number;
  height_percent?: number;
}

export interface GameLayout {
  background?: string;
  boxes: Record<string, Box>;
}

export interface GameLayoutFile {
  scenes: Record<string, GameLayout>; // key: scene slug (startup, login, home, gameplay, postgame)
}

export type GameSceneSlug = 'startup' | 'login' | 'home' | 'gameplay' | 'postgame';

export interface AnimapLayer {
  id: string;
  name: string;
  type: 'image' | 'video' | 'mask' | 'text';
  file: string;
  visible: boolean;
  locked?: boolean;
  opacity?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scale?: number;
  text?: string;
  font_size?: number;
  color?: string;
  text_align?: 'left' | 'center' | 'right';
  loop?: boolean;
  loop_start?: number;
  loop_end?: number;
  targets?: string[];
  hue?: number;
  saturation?: number;
  lightness?: number;
  brightness?: number;
  contrast?: number;
}

export type AnimapLayerStateOverride = Partial<Pick<
  AnimapLayer,
  | 'visible'
  | 'opacity'
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'scale'
  | 'text'
  | 'font_size'
  | 'color'
  | 'text_align'
  | 'loop'
  | 'loop_start'
  | 'loop_end'
  | 'targets'
  | 'hue'
  | 'saturation'
  | 'lightness'
  | 'brightness'
  | 'contrast'
>>;

export interface AnimapTransition {
  mode: 'instant' | 'timed';
  duration_ms?: number;
}

export interface AnimapState {
  id: string;
  name: string;
  layer_overrides?: Record<string, AnimapLayerStateOverride>;
  transitions_to?: Record<string, AnimapTransition>;
  transitions_from?: Record<string, AnimapTransition>;
}

export interface AnimapConfig {
  name: string;
  width: number;
  height: number;
  layers: AnimapLayer[];
  states?: AnimapState[];
}

export const GAME_SCENES: { slug: GameSceneSlug; label: string; desc: string }[] = [
  { slug: 'startup', label: 'Startup', desc: 'Logo intro & loading' },
  { slug: 'login', label: 'Login / Register', desc: 'Auth screens' },
  { slug: 'home', label: 'Home', desc: 'Main menu & navigation' },
  { slug: 'gameplay', label: 'Gameplay', desc: 'In-game battle layout' },
  { slug: 'postgame', label: 'Post Game', desc: 'Results & rewards' },
];
