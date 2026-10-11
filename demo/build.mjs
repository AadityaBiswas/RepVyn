// Bundles demo/app.ts (engine + catalog + params) into one self-contained demo/dist/index.html.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const { outputFiles } = await build({ entryPoints: ["demo/app.ts"], bundle: true, minify: true, format: "iife", target: "es2020", write: false });
const js = outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync("demo/index.html", "utf8").replace("/*APP*/", () => js);
mkdirSync("demo/dist", { recursive: true });
writeFileSync("demo/dist/index.html", html);
console.log(`demo/dist/index.html  ${(html.length / 1024).toFixed(0)} KB`);
