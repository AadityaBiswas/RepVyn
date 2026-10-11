import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The exercise library runs in the app too, so it is held to the same rules.
const PURE_DIRS = [join(__dirname, "../src/engine"), join(__dirname, "../src/library")];
const FORBIDDEN: [RegExp, string][] = [
  [/from\s+["']node:/, "node:* import"],
  [/import\(\s*["']node:/, "node:* dynamic import"],
  [/\brequire\s*\(/, "require()"],
  [/from\s+["'](fs|path|os|crypto|child_process|http|https|net)["']/, "node builtin import"],
  [/from\s+["'][^"']*\/(storage|sim|cli)(\/[^"']*)?["']/, "import from storage/sim/cli"],
  [/\bDate\.now\s*\(/, "Date.now()"],
  [/\bMath\.random\s*\(/, "Math.random()"],
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? tsFiles(join(dir, d.name)) : d.name.endsWith(".ts") ? [join(dir, d.name)] : [],
  );
}

function scan(source: string): string[] {
  return FORBIDDEN.filter(([re]) => re.test(source)).map(([, why]) => why);
}

describe("engine purity", () => {
  it("engine and library files contain no forbidden imports or calls", () => {
    const files = PURE_DIRS.flatMap(tsFiles);
    expect(files.length).toBeGreaterThan(0);
    const violations = files.flatMap((f) => scan(readFileSync(f, "utf8")).map((v) => `${f}: ${v}`));
    expect(violations).toEqual([]);
  });

  it("scanner catches each forbidden pattern", () => {
    for (const bad of [
      `import fs from "node:fs";`,
      `const x = require("x");`,
      `import { readFileSync } from "fs";`,
      `import { repo } from "../storage/repo";`,
      `import { run } from "../sim/runner";`,
      `const t = Date.now();`,
      `const r = Math.random();`,
    ]) expect(scan(bad), bad).not.toEqual([]);
  });
});
