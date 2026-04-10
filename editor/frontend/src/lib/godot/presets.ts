import type { GodotNode, GodotExtRef, GodotColor } from "./types";
import { NodeBuilder } from "./node";

export function rootControl(name: string, scriptRef?: GodotExtRef): GodotNode {
  const b = new NodeBuilder(name, "Control").fullRect();
  if (scriptRef) b.script(scriptRef);
  return b.build();
}

export function textureBackground(
  name: string,
  textureRef: GodotExtRef,
  parent = "."
): GodotNode {
  return new NodeBuilder(name, "TextureRect")
    .parent(parent)
    .fullRect()
    .props({
      texture: textureRef,
      expand_mode: 1,
      stretch_mode: 6,
    })
    .build();
}

export function styledLabel(
  name: string,
  opts: {
    parent?: string;
    font?: GodotExtRef;
    fontSize?: number;
    text?: string;
    fontColor?: GodotColor;
    outlineColor?: GodotColor;
    outlineSize?: number;
    shadowColor?: GodotColor;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
    hAlign?: number;
    vAlign?: number;
  }
): GodotNode {
  const b = new NodeBuilder(name, "Label");
  if (opts.parent) b.parent(opts.parent);

  b.fullRect();

  if (opts.text) b.prop("text", opts.text);
  if (opts.font) b.prop("theme_override_fonts/font", opts.font);
  if (opts.fontSize) b.prop("theme_override_font_sizes/font_size", opts.fontSize);
  if (opts.fontColor) b.prop("theme_override_colors/font_color", opts.fontColor);
  if (opts.outlineColor) b.prop("theme_override_colors/font_outline_color", opts.outlineColor);
  if (opts.outlineSize) b.prop("theme_override_constants/outline_size", opts.outlineSize);
  if (opts.shadowColor) b.prop("theme_override_colors/font_shadow_color", opts.shadowColor);
  if (opts.shadowOffsetX != null) b.prop("theme_override_constants/shadow_offset_x", opts.shadowOffsetX);
  if (opts.shadowOffsetY != null) b.prop("theme_override_constants/shadow_offset_y", opts.shadowOffsetY);
  if (opts.hAlign != null) b.prop("horizontal_alignment", opts.hAlign);
  if (opts.vAlign != null) b.prop("vertical_alignment", opts.vAlign);

  return b.build();
}

export function colorRect(
  name: string,
  color: GodotColor,
  parent?: string
): GodotNode {
  const b = new NodeBuilder(name, "ColorRect").fullRect().prop("color", color);
  if (parent) b.parent(parent);
  return b.build();
}

export function marginContainer(
  name: string,
  margins: { left?: number; top?: number; right?: number; bottom?: number },
  parent?: string
): GodotNode {
  const b = new NodeBuilder(name, "MarginContainer").fullRect();
  if (parent) b.parent(parent);
  if (margins.left != null) b.prop("theme_override_constants/margin_left", margins.left);
  if (margins.top != null) b.prop("theme_override_constants/margin_top", margins.top);
  if (margins.right != null) b.prop("theme_override_constants/margin_right", margins.right);
  if (margins.bottom != null) b.prop("theme_override_constants/margin_bottom", margins.bottom);
  return b.build();
}

export function canvasLayer(name: string, layer = 1): GodotNode {
  return new NodeBuilder(name, "CanvasLayer")
    .parent(".")
    .prop("layer", layer)
    .build();
}

export function sprite2D(
  name: string,
  textureRef: GodotExtRef,
  opts?: { parent?: string; x?: number; y?: number; scale?: number }
): GodotNode {
  const b = new NodeBuilder(name, "Sprite2D").prop("texture", textureRef);
  if (opts?.parent) b.parent(opts.parent);
  if (opts?.x != null || opts?.y != null) {
    b.position(opts?.x ?? 0, opts?.y ?? 0);
  }
  if (opts?.scale != null) {
    b.prop("scale", { _type: "Vector2", x: opts.scale, y: opts.scale });
  }
  return b.build();
}
