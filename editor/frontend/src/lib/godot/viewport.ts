import type { ViewportConfig } from "./types";

export const ASPECT_PRESETS: readonly ViewportConfig[] = [
  { slug: "9-16", label: "9:16", desc: "Standard Phone", width: 1080, height: 1920 },
  { slug: "9-20", label: "9:20", desc: "Tall Phone", width: 1080, height: 2400 },
  { slug: "3-4", label: "3:4", desc: "Tablet", width: 1536, height: 2048 },
] as const;

export function getViewportForAspect(slug: string): ViewportConfig | undefined {
  return ASPECT_PRESETS.find((p) => p.slug === slug);
}

export function toPixels(
  nx: number,
  ny: number,
  viewport: { width: number; height: number }
): { x: number; y: number } {
  return {
    x: Math.round(nx * viewport.width),
    y: Math.round(ny * viewport.height),
  };
}

export function toNormalized(
  x: number,
  y: number,
  viewport: { width: number; height: number }
): { nx: number; ny: number } {
  return {
    nx: x / viewport.width,
    ny: y / viewport.height,
  };
}

export type Pivot =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const PIVOT_OFFSETS: Record<Pivot, { ox: number; oy: number }> = {
  "top-left":      { ox: 0,    oy: 0 },
  "top-center":    { ox: 0.5,  oy: 0 },
  "top-right":     { ox: 1,    oy: 0 },
  "center-left":   { ox: 0,    oy: 0.5 },
  "center":        { ox: 0.5,  oy: 0.5 },
  "center-right":  { ox: 1,    oy: 0.5 },
  "bottom-left":   { ox: 0,    oy: 1 },
  "bottom-center": { ox: 0.5,  oy: 1 },
  "bottom-right":  { ox: 1,    oy: 1 },
};

export function applyPivot(
  x: number,
  y: number,
  w: number,
  h: number,
  pivot: string
): { x: number; y: number } {
  const offsets = PIVOT_OFFSETS[pivot as Pivot] ?? PIVOT_OFFSETS["top-left"];
  return {
    x: Math.round(x - w * offsets.ox),
    y: Math.round(y - h * offsets.oy),
  };
}

export interface BoxLike {
  nx?: number;
  ny?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pivot?: string;
  screen_relative?: boolean;
}

export function resolveBoxPosition(
  box: BoxLike,
  viewport: { width: number; height: number }
): { x: number; y: number } {
  let px: number, py: number;

  if (box.screen_relative && box.nx != null && box.ny != null) {
    const pos = toPixels(box.nx, box.ny, viewport);
    px = pos.x;
    py = pos.y;
  } else {
    px = box.x;
    py = box.y;
  }

  if (box.pivot) {
    return applyPivot(px, py, box.width, box.height, box.pivot);
  }

  return { x: px, y: py };
}
