// Copies the pinned three build into public/vendor so the viewer imports it from
// the same origin instead of a CDN.

import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "three", "build", "three.module.js");
const targetDir = join(root, "public", "vendor");

await mkdir(targetDir, { recursive: true });
await copyFile(source, join(targetDir, "three.module.js"));
console.log("vendored three.module.js ->", join(targetDir, "three.module.js"));
