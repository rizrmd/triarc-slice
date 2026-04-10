import type {
  GodotVector2,
  GodotColor,
  GodotRect2,
  GodotExtRef,
  GodotSubRef,
  GodotArray,
  GodotRawValue,
  GodotValue,
} from "./types";

export function Vector2(x: number, y: number): GodotVector2 {
  return { _type: "Vector2", x, y };
}

export function Color(r: number, g: number, b: number, a = 1): GodotColor {
  return { _type: "Color", r, g, b, a };
}

export function ColorHex(hex: string, a = 1): GodotColor {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return { _type: "Color", r, g, b, a };
}

export function Rect2(x: number, y: number, w: number, h: number): GodotRect2 {
  return { _type: "Rect2", x, y, w, h };
}

export function ExtRef(id: string): GodotExtRef {
  return { _type: "ExtResource", id };
}

export function SubRef(id: string): GodotSubRef {
  return { _type: "SubResource", id };
}

export function GArray(...items: GodotValue[]): GodotArray {
  return { _type: "Array", items };
}

export function Raw(value: string): GodotRawValue {
  return { _type: "raw", value };
}
