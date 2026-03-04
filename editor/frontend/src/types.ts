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
  tint: string;
}

export type CharLayer = 'char-bg' | 'char-fg';
export type MaskLayer = 'mask-bg' | 'mask-fg';
export type CharProperty = 'x' | 'y' | 'scale';
export type LayerId = 'char-bg' | 'mask-bg' | 'card' | 'mask-fg' | 'char-fg' | 'canvas';
export type AssetPickerTarget = CharLayer | 'card' | null;
export type AssetItem = { name: string; url: string };

export type VisibleLayers = {
  'char-bg': boolean;
  'mask-bg': boolean;
  card: boolean;
  'mask-fg': boolean;
  'char-fg': boolean;
};
