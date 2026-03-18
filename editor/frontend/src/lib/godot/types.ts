// --- Godot value types (discriminated union) ---

export interface GodotVector2 {
  _type: "Vector2";
  x: number;
  y: number;
}

export interface GodotColor {
  _type: "Color";
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface GodotRect2 {
  _type: "Rect2";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GodotExtRef {
  _type: "ExtResource";
  id: string;
}

export interface GodotSubRef {
  _type: "SubResource";
  id: string;
}

export interface GodotArray {
  _type: "Array";
  items: GodotValue[];
}

export interface GodotRawValue {
  _type: "raw";
  value: string;
}

export type GodotValue =
  | string
  | number
  | boolean
  | GodotVector2
  | GodotColor
  | GodotRect2
  | GodotExtRef
  | GodotSubRef
  | GodotArray
  | GodotRawValue;

// --- Scene structure ---

export interface ExtResource {
  id: string;
  type: string;
  path: string;
  uid?: string;
}

export interface SubResource {
  id: string;
  type: string;
  properties: Record<string, GodotValue>;
}

export interface GodotNode {
  name: string;
  type?: string;
  parent?: string;
  instance?: GodotExtRef;
  properties: Record<string, GodotValue>;
}

export interface GodotScene {
  uid?: string;
  extResources: ExtResource[];
  subResources: SubResource[];
  nodes: GodotNode[];
}

// --- Viewport / screen size ---

export interface ViewportConfig {
  slug: string;
  label: string;
  desc: string;
  width: number;
  height: number;
}
