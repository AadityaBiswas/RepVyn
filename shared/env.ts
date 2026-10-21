// The engine's catalog and params, loaded once for the whole app.
import rawCatalog from "../catalog/library";
import rawPrograms from "../catalog/programs.json";
import rawParams from "../params/default.params.json";
import { loadCatalog, parseParams } from "../src/engine";

export const catalog = loadCatalog(rawCatalog, rawPrograms);
export const params = parseParams(rawParams);
