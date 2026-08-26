import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LegalHit } from "./types";

interface GlossaryEntry {
  id: string;
  term: string;
  text: string;
}

interface GlossaryFile {
  title: string;
  source: string;
  entries: GlossaryEntry[];
}

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/legal/glossary.json");

let cache: GlossaryFile | null = null;

function loadGlossary(): GlossaryFile {
  if (!cache) {
    cache = JSON.parse(readFileSync(filePath, "utf8")) as GlossaryFile;
  }
  return cache;
}

export function searchGlossary(query: string, limit: number): LegalHit[] {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 1);
  return loadGlossary()
    .entries.map((entry) => {
      const hay = `${entry.term} ${entry.text}`.toLowerCase();
      const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      return { entry, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => ({
      source: "glossary" as const,
      id: entry.id,
      title: entry.term,
      snippet: entry.text,
      citation: "Public-domain glossary (not Black's Law Dictionary)",
    }));
}
