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
  tint: string;
  lore?: string;
  stats?: Record<string, any>;
  audio?: Record<string, string>;
  pose?: Record<string, any>;
  hp_bar_pos: {
    x: number;
    y: number;
  };
  hp_bar_scale: number;
  hp_bar_current: number;
  hp_bar_max: number;
  hp_bar_hue: number;
  hp_bar_font_size?: number;
}

export type CharLayer = 'char-bg' | 'char-fg';
export type MaskLayer = 'mask-bg' | 'mask-fg';
export type TextLayer = 'name';
export type BarLayer = 'hp-bar';
export type CharProperty = 'x' | 'y' | 'scale';
export type LayerId = 'char-bg' | 'mask-bg' | 'card' | 'mask-fg' | 'char-fg' | 'name' | 'hp-bar' | 'canvas';
export type AssetPickerTarget = CharLayer | 'card' | null;
export type AssetItem = { name: string; url: string };

export type VisibleLayers = {
  'char-bg': boolean;
  'mask-bg': boolean;
  card: boolean;
  'mask-fg': boolean;
  'char-fg': boolean;
  name: boolean;
  'hp-bar': boolean;
};
