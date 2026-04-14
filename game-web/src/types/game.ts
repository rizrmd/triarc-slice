export interface HeroData {
  hero_slug: string;
  full_name: string;
  frame_image: string;
  char_bg_pos: { x: number; y: number };
  char_fg_pos: { x: number; y: number };
  char_bg_scale: number;
  char_fg_scale: number;
  name_pos: { x: number; y: number };
  name_scale: number;
  text_shadow_color: string;
  text_shadow_size: number;
  tint: string;
  hp_bar_pos: { x: number; y: number };
  hp_bar_scale: number;
  hp_bar_current: number;
  hp_bar_max: number;
  hp_bar_hue: number;
  hp_bar_font_size: number;
  lore: string;
  stats: {
    attack: number;
    defense: number;
    element_affinity: Record<string, number>;
    max_hp: number;
  };
  audio: Record<string, string>;
  pose: {
    char_fg_pos: { x: number; y: number };
    char_fg_scale: number;
    shadow_pos: { x: number; y: number };
    shadow_scale: number;
  };
}

export interface ActionData {
  action_slug: string;
  full_name: string;
  frame_image: string;
  char_bg_pos: { x: number; y: number };
  char_bg_scale: number;
  name_pos: { x: number; y: number };
  name_scale: number;
  text_shadow_color: string;
  text_shadow_size: number;
  tint: string;
  description: string;
  cost: number;
  element: string[];
  target_rule: string;
  targeting: {
    side: string;
    scope: string;
    selection: string;
  };
  visible_layers: Record<string, boolean>;
  vfx?: {
    enabled: boolean;
    effect_file: string;
    targets: { caster: boolean; target: boolean };
    position_offset: { x: number; y: number };
    scale_multiplier: number;
  };
}

export interface Hero {
  hero_instance_id: string;
  hero_slug: string;
  team: 0 | 1;
  slot_index: number;
  max_hp: number;
  current_hp: number;
  is_alive: boolean;
}

export interface ActionCard {
  action_slug: string;
  slot_index: number;
  // Fields below come from server (when available) or are looked up from action_defs
  action_name?: string;
  energy_cost?: number;
  target_rule?: string;
  is_dragging?: boolean;
}

export interface MatchState {
  match_id: string;
  current_team: 0 | 1;
  state: 'waiting' | 'loading' | 'playing' | 'ended';
  time_remaining_ms: number;
}

export interface GameState {
  player_id: string | null;
  display_name: string | null;
  ws: WebSocket | null;
  current_match_id: string | null;
  current_team: 0 | 1;
  match_state: MatchState['state'];
  selected_heroes: string[];
  hero_defs: Record<string, HeroData>;
  action_defs: Record<string, ActionData>;
  local_mock_mode: boolean;
}

export type Scene = 'loading' | 'main' | 'gameplay';
