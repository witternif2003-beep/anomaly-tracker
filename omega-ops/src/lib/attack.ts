import type postgres from "postgres";

/** MITRE ATT&CK Enterprise bundle; groups and campaigns whose own description calls them espionage actors. */
export const ATTACK_SOURCE = {
  id: "attack",
  label: "MITRE ATT&CK Enterprise (STIX 2.1)",
  url: "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json",
  notice: "© 2026 The MITRE Corporation. This work is reproduced and distributed with the permission of The MITRE Corporation.",
  terms: "https://attack.mitre.org/resources/legal-and-branding/terms-of-use/",
} as const;

export const ATTACK_REFRESH_HOURS = 24;

export interface Citation {
  name: string;
  url: string;
}

export interface AttributionLink {
  cve_id: string;
  actor_id: string;
  actor_name: string;
  actor_kind: "group" | "campaign";
  actor_url: string;
  espionage_note: string;
  statement: string;
  citations: Citation[];
}

interface StixRef {
  source_name?: string;
  external_id?: string;
  url?: string;
}
interface StixObject {
  id: string;
  type: string;
  name?: string;
  description?: string;
  modified?: string;
  revoked?: boolean;
  x_mitre_deprecated?: boolean;
  x_mitre_version?: string;
  source_ref?: string;
  target_ref?: string;
  relationship_type?: string;
  external_references?: StixRef[];
}

const CVE = /CVE-\d{4}-\d{4,7}/g;
const ESPIONAGE = /espionage/i;

/** ATT&CK prose without its markdown links and citation markers. */
export function plainAttack(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/\(Citation:[^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const sentences = (text: string) => plainAttack(text).split(/(?<=\.)\s+(?=[A-Z[(])/);

const live = (o: StixObject) => !o.revoked && !o.x_mitre_deprecated;

/** Pure transform of an ATT&CK bundle into CVE → espionage-described actor links. */
export function parseAttack(bundle: { objects: StixObject[] }): { version: string | null; modified: string | null; links: AttributionLink[] } {
  const byId = new Map(bundle.objects.map((o) => [o.id, o]));
  const collection = bundle.objects.find((o) => o.type === "x-mitre-collection");
  const actors = bundle.objects.filter((o) => (o.type === "intrusion-set" || o.type === "campaign") && live(o));
  const espionageGroups = new Set(actors.filter((o) => o.type === "intrusion-set" && ESPIONAGE.test(o.description ?? "")).map((o) => o.id));
  const attributedTo = new Map<string, string[]>();
  for (const r of bundle.objects) {
    if (r.type === "relationship" && r.relationship_type === "attributed-to" && live(r) && r.source_ref && r.target_ref) {
      attributedTo.set(r.source_ref, [...(attributedTo.get(r.source_ref) ?? []), r.target_ref]);
    }
  }
  const noteFor = (a: StixObject): string | null => {
    const own = sentences(a.description ?? "").find((s) => ESPIONAGE.test(s));
    if (own) return own;
    const group = (attributedTo.get(a.id) ?? []).map((g) => byId.get(g)).find((g) => g && espionageGroups.has(g.id));
    return group ? `${a.name} is attributed in ATT&CK to ${group.name}, which ATT&CK describes as an espionage actor.` : null;
  };
  const notes = new Map<string, string>();
  for (const a of actors) {
    const n = noteFor(a);
    if (n) notes.set(a.id, n);
  }

  const merged = new Map<string, AttributionLink & { parts: Set<string> }>();
  const add = (actor: StixObject, cve: string, statement: string, refs: StixRef[]) => {
    const ext = actor.external_references?.find((r) => r.source_name === "mitre-attack");
    if (!ext?.external_id || !ext.url) return;
    const key = `${cve}|${ext.external_id}`;
    const cur =
      merged.get(key) ??
      ({
        cve_id: cve,
        actor_id: ext.external_id,
        actor_name: actor.name ?? ext.external_id,
        actor_kind: actor.type === "campaign" ? "campaign" : "group",
        actor_url: ext.url,
        espionage_note: notes.get(actor.id) ?? "",
        statement: "",
        citations: [],
        parts: new Set<string>(),
      } as AttributionLink & { parts: Set<string> });
    cur.parts.add(statement);
    for (const r of refs) if (r.url && r.source_name && !cur.citations.some((c) => c.url === r.url)) cur.citations.push({ name: r.source_name, url: r.url });
    merged.set(key, cur);
  };

  for (const r of bundle.objects) {
    if (r.type !== "relationship" || !live(r) || !r.source_ref || !r.description) continue;
    const actor = byId.get(r.source_ref);
    if (!actor || !notes.has(actor.id)) continue;
    for (const cve of new Set(r.description.match(CVE) ?? [])) {
      const said = sentences(r.description).filter((s) => s.includes(cve)).join(" ");
      add(actor, cve, said, r.external_references ?? []);
    }
  }
  for (const a of actors) {
    if (!notes.has(a.id)) continue;
    for (const cve of new Set(a.description?.match(CVE) ?? [])) {
      add(a, cve, sentences(a.description ?? "").filter((s) => s.includes(cve)).join(" "), (a.external_references ?? []).filter((r) => r.source_name !== "mitre-attack"));
    }
  }

  const links = [...merged.values()].map(({ parts, ...l }) => ({ ...l, statement: [...parts].join(" ").slice(0, 1200) }));
  links.sort((a, b) => a.cve_id.localeCompare(b.cve_id) || a.actor_id.localeCompare(b.actor_id));
  return { version: collection?.x_mitre_version ?? null, modified: collection?.modified ?? null, links };
}

export interface AttackMeta {
  version: string | null;
  modified: string | null;
  fetched_at: Date;
  link_count: number;
}

export async function attackMeta(sql: postgres.Sql): Promise<AttackMeta | null> {
  const [m] = await sql<AttackMeta[]>`SELECT version, modified, fetched_at, link_count FROM ops_reference WHERE source = 'attack'`;
  return m ?? null;
}

/** Downloads and stores the ATT&CK links; returns bytes read. */
export async function refreshAttack(sql: postgres.Sql, timeoutMs = 45_000): Promise<{ bytes: number; version: string | null; links: number }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let text: string;
  try {
    const res = await fetch(ATTACK_SOURCE.url, { headers: { "User-Agent": "omega-ops/1.0 (+defensive vulnerability telemetry)" }, signal: ctl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`raw.githubusercontent.com responded ${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }
  const bytes = Buffer.byteLength(text);
  const parsed = parseAttack(JSON.parse(text) as { objects: StixObject[] });
  if (!parsed.links.length) throw new Error("ATT&CK bundle produced no CVE links; keeping the stored set");
  await sql.begin(async (tx) => {
    await tx`DELETE FROM ops_attribution`;
    for (let k = 0; k < parsed.links.length; k += 200) {
      const rows = parsed.links.slice(k, k + 200).map((l) => ({ ...l, citations: JSON.stringify(l.citations), attack_version: parsed.version }));
      await tx`INSERT INTO ops_attribution ${tx(rows, "cve_id", "actor_id", "actor_name", "actor_kind", "actor_url", "espionage_note", "statement", "citations", "attack_version")}`;
    }
    await tx`
      INSERT INTO ops_reference (source, version, modified, fetched_at, link_count, bytes)
      VALUES ('attack', ${parsed.version}, ${parsed.modified}, now(), ${parsed.links.length}, ${bytes})
      ON CONFLICT (source) DO UPDATE SET version = EXCLUDED.version, modified = EXCLUDED.modified, fetched_at = now(), link_count = EXCLUDED.link_count, bytes = EXCLUDED.bytes`;
  });
  return { bytes, version: parsed.version, links: parsed.links.length };
}

export interface Attribution {
  version: string | null;
  links: Omit<AttributionLink, "cve_id">[];
}

export async function attributionFor(sql: postgres.Sql, cve: string): Promise<Attribution> {
  const meta = await attackMeta(sql);
  const rows = await sql<(Omit<AttributionLink, "cve_id" | "citations"> & { citations: Citation[] | string })[]>`
    SELECT actor_id, actor_name, actor_kind, actor_url, espionage_note, statement, citations FROM ops_attribution WHERE cve_id = ${cve} ORDER BY actor_id`;
  return {
    version: meta?.version ?? null,
    links: rows.map((r) => ({ ...r, citations: typeof r.citations === "string" ? (JSON.parse(r.citations) as Citation[]) : r.citations })),
  };
}
