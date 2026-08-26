import { existsSync, lstatSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tscBin = join(root, "node_modules", ".bin", "tsc");
const tscTarget = join("..", "typescript", "bin", "tsc");
const tscReal = join(root, "node_modules", "typescript", "bin", "tsc");

if (!existsSync(tscReal)) {
  process.exit(0);
}

if (existsSync(tscBin)) {
  const stat = lstatSync(tscBin);
  if (stat.isSymbolicLink() || stat.isFile()) {
    rmSync(tscBin);
  }
}

symlinkSync(tscTarget, tscBin);
