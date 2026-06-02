#!/usr/bin/env node
// Patch all workspace package.jsons to add a "production" condition to
// their exports field. Production runtime needs the compiled dist/*.js
// paths, not the src/*.ts source files. We preserve the dev experience
// (tsx + import) by adding "production" alongside the existing
// "import" and "default" conditions.
//
// Usage:  node scripts/patch-package-exports.mjs [root-dir]

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] || process.cwd();

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (name === "package.json") out.push(p);
  }
  return out;
}

function fix(value) {
  if (typeof value === "string" && value.startsWith("./src/") && value.endsWith(".ts")) {
    const inner = value.slice(6, -3); // strip "./src/" and ".ts"
    return {
      types: value,
      production: `./dist/${inner}.js`,
      import: value,
      default: value,
    };
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = fix(v);
    return out;
  }
  return value;
}

let changed = 0;
for (const pkg of walk(join(root, "packages"))) {
  let json;
  try { json = JSON.parse(readFileSync(pkg, "utf8")); } catch { continue; }
  if (!json.exports) continue;
  const before = JSON.stringify(json.exports);
  json.exports = fix(json.exports);
  if (JSON.stringify(json.exports) === before) continue;
  writeFileSync(pkg, JSON.stringify(json, null, 2) + "\n");
  changed++;
  console.log(`patched ${pkg}`);
}
console.log(`patched ${changed} package.json files`);
