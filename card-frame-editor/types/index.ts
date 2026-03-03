export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Effects {
  tint?: RGBA;
  blur?: number; // px
  opacity?: number; // 0-1
  blendMode?: string; // e.g., 'multiply', 'screen', 'overlay'
}

export interface Transform {
  rotation: number; // degrees
  scaleX: number;
  scaleY: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  color: string; // Hex or RGBA string
  textAlign: 'left' | 'center' | 'right';
  lineHeight?: number;
}

export type ElementType = 'image' | 'text' | 'shape';

export interface CardElement {
  id: string;
  type: ElementType;
  name: string;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  position: Position;
  size: Size;
  transform: Transform;
  effects?: Effects;
  
  // Type specific properties
  src?: string; // For images
  content?: string; // For text
  textStyle?: TextStyle; // For text
  backgroundColor?: string; // For shapes
}

export interface CardLayout {
  id: string;
  name: string;
  dimensions: Size;
  elements: CardElement[];
  backgroundColor: string;
}
