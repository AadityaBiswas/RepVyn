import { loadCatalog, type Catalog } from "../engine/catalog";
import { EventSchema, parseParams, type EngineEvent, type Params } from "../engine/types";
import { DuplicateEventError, type CatalogStore, type EventStore, type ParamsStore } from "./repo";

export const byTsSeq = (a: EngineEvent, b: EngineEvent) => a.ts - b.ts || a.seq - b.seq;

export class MemoryEventStore implements EventStore {
  private events = new Map<string, EngineEvent>();

  async append(event: EngineEvent): Promise<void> {
    const e = EventSchema.parse(event);
    if (this.events.has(e.id)) throw new DuplicateEventError(e.id);
    this.events.set(e.id, structuredClone(e));
  }

  async list(userId: string, { from = -Infinity, to = Infinity } = {}): Promise<EngineEvent[]> {
    return [...this.events.values()]
      .filter((e) => e.userId === userId && e.ts >= from && e.ts <= to)
      .map((e) => EventSchema.parse(structuredClone(e)))
      .sort(byTsSeq);
  }
}

/** Catalog from an already-parsed exercises.json (a JSON import works on Node and React Native). */
export class MemoryCatalogStore implements CatalogStore {
  constructor(private readonly raw: unknown) {}
  async load(): Promise<Catalog> {
    return loadCatalog(this.raw);
  }
}

/** Params from one or more already-parsed params files, keyed by their `version`. */
export class MemoryParamsStore implements ParamsStore {
  private readonly byVersion: Params[];
  constructor(raws: unknown[]) {
    this.byVersion = raws.map(parseParams).sort((a, b) => a.version - b.version);
  }
  async load(version?: number): Promise<Params> {
    const p = version === undefined ? this.byVersion.at(-1) : this.byVersion.find((x) => x.version === version);
    if (!p) throw new Error(version === undefined ? "no params available" : `params version ${version} not found`);
    return p;
  }
}
