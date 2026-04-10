import type { GodotNode, GodotValue, GodotExtRef } from "./types";

export class NodeBuilder {
  private _name: string;
  private _type?: string;
  private _parent?: string;
  private _instance?: GodotExtRef;
  private _properties: Record<string, GodotValue> = {};

  constructor(name: string, type?: string) {
    this._name = name;
    this._type = type;
  }

  parent(p: string): this {
    this._parent = p;
    return this;
  }

  instance(ref: GodotExtRef): this {
    this._instance = ref;
    this._type = undefined;
    return this;
  }

  prop(key: string, value: GodotValue): this {
    this._properties[key] = value;
    return this;
  }

  props(entries: Record<string, GodotValue>): this {
    Object.assign(this._properties, entries);
    return this;
  }

  script(ref: GodotExtRef): this {
    return this.prop("script", ref);
  }

  visible(v: boolean): this {
    return this.prop("visible", v);
  }

  // --- Layout helpers ---

  layoutMode(mode: number): this {
    return this.prop("layout_mode", mode);
  }

  anchorsPreset(preset: number): this {
    return this.prop("anchors_preset", preset);
  }

  fullRect(): this {
    return this.props({
      layout_mode: 1,
      anchors_preset: 15,
      anchor_right: 1.0,
      anchor_bottom: 1.0,
      grow_horizontal: 2,
      grow_vertical: 2,
    });
  }

  centered(): this {
    return this.props({
      layout_mode: 1,
      anchors_preset: 8,
      anchor_left: 0.5,
      anchor_top: 0.5,
      anchor_right: 0.5,
      anchor_bottom: 0.5,
      grow_horizontal: 2,
      grow_vertical: 2,
    });
  }

  offset(left: number, top: number, right: number, bottom: number): this {
    return this.props({
      offset_left: left,
      offset_top: top,
      offset_right: right,
      offset_bottom: bottom,
    });
  }

  size(w: number, h: number): this {
    return this.props({
      size: { _type: "Vector2", x: w, y: h } as GodotValue,
    });
  }

  position(x: number, y: number): this {
    return this.prop("position", { _type: "Vector2", x, y });
  }

  build(): GodotNode {
    return {
      name: this._name,
      type: this._type,
      parent: this._parent,
      instance: this._instance,
      properties: { ...this._properties },
    };
  }
}
