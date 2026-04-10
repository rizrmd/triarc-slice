import type {
  GodotScene,
  GodotNode,
  GodotValue,
  GodotExtRef,
  GodotSubRef,
} from "./types";
import { ResourceTracker } from "./resource";
import { NodeBuilder } from "./node";

// --- Value serializer ---

export function serializeValue(v: GodotValue): string {
  if (typeof v === "string") return `"${v}"`;
  if (typeof v === "number") return formatFloat(v);
  if (typeof v === "boolean") return v ? "true" : "false";

  switch (v._type) {
    case "Vector2":
      return `Vector2(${formatFloat(v.x)}, ${formatFloat(v.y)})`;
    case "Color":
      return `Color(${formatFloat(v.r)}, ${formatFloat(v.g)}, ${formatFloat(v.b)}, ${formatFloat(v.a)})`;
    case "Rect2":
      return `Rect2(${formatFloat(v.x)}, ${formatFloat(v.y)}, ${formatFloat(v.w)}, ${formatFloat(v.h)})`;
    case "ExtResource":
      return `ExtResource("${v.id}")`;
    case "SubResource":
      return `SubResource("${v.id}")`;
    case "Array":
      return `[${v.items.map(serializeValue).join(", ")}]`;
    case "raw":
      return v.value;
  }
}

function formatFloat(n: number): string {
  if (Number.isInteger(n)) return n.toFixed(1);
  return String(n);
}

// --- Scene serializer ---

export function serializeScene(scene: GodotScene): string {
  const lines: string[] = [];
  const loadSteps =
    scene.extResources.length + scene.subResources.length + 1;

  // Header
  const headerParts = [`load_steps=${loadSteps}`, `format=3`];
  if (scene.uid) headerParts.unshift(`uid="${scene.uid}"`);
  lines.push(`[gd_scene ${headerParts.join(" ")}]`);

  // External resources
  if (scene.extResources.length > 0) {
    lines.push("");
    for (const r of scene.extResources) {
      const parts = [`type="${r.type}"`];
      if (r.uid) parts.push(`uid="${r.uid}"`);
      parts.push(`path="${r.path}"`, `id="${r.id}"`);
      lines.push(`[ext_resource ${parts.join(" ")}]`);
    }
  }

  // Sub-resources
  for (const r of scene.subResources) {
    lines.push("");
    lines.push(`[sub_resource type="${r.type}" id="${r.id}"]`);
    for (const [key, val] of Object.entries(r.properties)) {
      lines.push(`${key} = ${serializeValue(val)}`);
    }
  }

  // Nodes
  for (const node of scene.nodes) {
    lines.push("");
    const parts = [`name="${node.name}"`];
    if (node.type) parts.push(`type="${node.type}"`);
    if (node.parent !== undefined) parts.push(`parent="${node.parent}"`);
    if (node.instance) parts.push(`instance=${serializeValue(node.instance)}`);
    lines.push(`[node ${parts.join(" ")}]`);
    for (const [key, val] of Object.entries(node.properties)) {
      lines.push(`${key} = ${serializeValue(val)}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// --- Builder class ---

export class SceneBuilder {
  private resources = new ResourceTracker();
  private nodes: GodotNode[] = [];
  private sceneUid?: string;

  constructor(uid?: string) {
    this.sceneUid = uid;
  }

  extResource(type: string, path: string, uid?: string): GodotExtRef {
    return this.resources.addExtResource(type, path, uid);
  }

  subResource(
    type: string,
    properties?: Record<string, GodotValue>
  ): GodotSubRef {
    return this.resources.addSubResource(type, properties);
  }

  addNode(node: GodotNode): this {
    this.nodes.push(node);
    return this;
  }

  addRoot(name: string, type: string): NodeBuilder {
    const builder = new NodeBuilder(name, type);
    const self = this;
    const origBuild = builder.build.bind(builder);
    builder.build = () => {
      const node = origBuild();
      self.nodes.push(node);
      return node;
    };
    return builder;
  }

  addChild(name: string, type: string, parent: string): NodeBuilder {
    const builder = new NodeBuilder(name, type).parent(parent);
    const self = this;
    const origBuild = builder.build.bind(builder);
    builder.build = () => {
      const node = origBuild();
      self.nodes.push(node);
      return node;
    };
    return builder;
  }

  toScene(): GodotScene {
    return {
      uid: this.sceneUid,
      extResources: this.resources.getExtResources(),
      subResources: this.resources.getSubResources(),
      nodes: this.nodes,
    };
  }

  serialize(): string {
    return serializeScene(this.toScene());
  }
}
