import type { Catalog } from "../engine/catalog";
import type { EngineEvent, Params } from "../engine/types";

/**
 * Storage interfaces. Async so a React Native adapter (e.g. expo-sqlite) can implement them unchanged.
 * State is never stored: it is always replay(events).
 */
export interface EventStore {
  /** Validates the event; throws DuplicateEventError if the id already exists. */
  append(event: EngineEvent): Promise<void>;
  /** Events of a user with from <= ts <= to (both optional), ordered by (ts, seq). Validated on read. */
  list(userId: string, range?: { from?: number; to?: number }): Promise<EngineEvent[]>;
}

export interface CatalogStore {
  load(): Promise<Catalog>;
}

export interface ParamsStore {
  /** A specific params version, or the latest when omitted. */
  load(version?: number): Promise<Params>;
}

export class DuplicateEventError extends Error {
  constructor(readonly id: string) {
    super(`event ${id} already exists`);
  }
}
