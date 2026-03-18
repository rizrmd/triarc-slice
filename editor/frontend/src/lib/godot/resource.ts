import type {
  ExtResource,
  SubResource,
  GodotExtRef,
  GodotSubRef,
  GodotValue,
} from "./types";

function slugify(s: string): string {
  const base = s.split("/").pop()?.split(".")[0] ?? "res";
  return base.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 8);
}

export class ResourceTracker {
  private counter = 0;
  private extResources: ExtResource[] = [];
  private subResources: SubResource[] = [];
  private pathIndex = new Map<string, ExtResource>();

  addExtResource(
    type: string,
    path: string,
    uid?: string
  ): GodotExtRef {
    const existing = this.pathIndex.get(path);
    if (existing) {
      return { _type: "ExtResource", id: existing.id };
    }

    this.counter++;
    const id = `${this.counter}_${slugify(path)}`;
    const res: ExtResource = { id, type, path, uid };
    this.extResources.push(res);
    this.pathIndex.set(path, res);
    return { _type: "ExtResource", id };
  }

  addSubResource(
    type: string,
    properties: Record<string, GodotValue> = {}
  ): GodotSubRef {
    const id = `${type}_${this.subResources.length + 1}`;
    const res: SubResource = { id, type, properties };
    this.subResources.push(res);
    return { _type: "SubResource", id };
  }

  getExtResources(): ExtResource[] {
    return this.extResources;
  }

  getSubResources(): SubResource[] {
    return this.subResources;
  }

  get loadSteps(): number {
    return this.extResources.length + this.subResources.length + 1;
  }
}
