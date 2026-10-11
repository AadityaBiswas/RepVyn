// The exercise database: one file per movement group, plus the ladders. Pass this to loadLibrary / loadCatalog.
// To add an exercise, append one record to the file for its pattern; loadLibrary validates everything.
import { ladders } from "./ladders.json";
import { exercises as push } from "./push.json";
import { exercises as pull } from "./pull.json";
import { exercises as legs } from "./legs.json";
import { exercises as core } from "./core.json";
import { exercises as arms } from "./arms.json";

export default { ladders, exercises: [...push, ...pull, ...legs, ...core, ...arms] };
