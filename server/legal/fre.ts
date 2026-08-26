import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LegalHit } from "./types";

interface FreRule {
  id: string;
  rule: string;
  title: string;
  text: string;
}

interface FreFile {
  title: string;
  rules: FreRule[];
}

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data/legal/fre-excerpts.json");

let cache: FreFile | null = null;

function loadFre(): FreFile {
  if (!cache) {
    cache = JSON.parse(readFileSync(filePath, "utf8")) as FreFile;
  }
  return cache;
}

export function searchFre(query: string, limit: number): LegalHit[] {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 1);
  const rules = loadFre().rules;
  return rules
    .map((rule) => {
      const hay = `${rule.rule} ${rule.title} ${rule.text}`.toLowerCase();
      const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      return { rule, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ rule }) => ({
      source: "fre" as const,
      id: rule.id,
      title: `FRE ${rule.rule} — ${rule.title}`,
      snippet: rule.text,
      citation: `Fed. R. Evid. ${rule.rule}`,
    }));
}
