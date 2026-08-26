/**
 * Write static JSON snapshots under public/static for GitHub Pages.
 * Run before `STATIC_EXPORT=1 npm run build`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compileAnomalyTracker } from "../server/anomaly-tracker";
import { compileCorporateTaxonomy } from "../server/corporate-taxonomy";
import { installNotebook } from "../server/notebook";
import { loadEnvFiles } from "../server/load-env";

loadEnvFiles();

const outDir = path.join(process.cwd(), "public/static");
mkdirSync(outDir, { recursive: true });

function write(name: string, data: unknown) {
  const file = path.join(outDir, name);
  writeFileSync(file, JSON.stringify(data));
  console.log("wrote", file, Buffer.byteLength(JSON.stringify(data)), "bytes");
}

write(
  "anomaly.json",
  compileAnomalyTracker({
    improvementLimit: 48,
    improvementOffset: 0,
  }),
);
write("corporate.json", compileCorporateTaxonomy());
write("notebook.json", installNotebook());

console.log("STATIC DATA OK", outDir);
