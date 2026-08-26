import { mapP1Entities } from "./p1-entities";
import { TIER1_CATALOG } from "./p1-tier1";
import type { P1Slot } from "./p1-types";

export type { P1Slot };

const PRACTICE_AREAS = [
  "Civil procedure",
  "Constitutional law",
  "Contracts",
  "Criminal procedure",
  "Evidence",
  "Torts",
  "Administrative law",
  "Antitrust",
  "Bankruptcy",
  "Civil rights",
  "Class actions",
  "Copyright",
  "Corporate governance",
  "Employment discrimination",
  "Environmental law",
  "ERISA",
  "False Claims Act",
  "Family law",
  "First Amendment",
  "Fourth Amendment",
  "Habeas corpus",
  "Immigration",
  "Insurance coverage",
  "Intellectual property",
  "Labor law",
  "Patent",
  "Privacy and data",
  "Products liability",
  "Qualified immunity",
  "Securities",
  "Sentencing",
  "Tax",
  "Trademark",
  "Trade secrets",
  "Trusts and estates",
  "White-collar crime",
  "Arbitration",
  "Discovery",
  "Injunctions",
  "Jurisdiction and venue",
] as const;

const JURISDICTIONS = [
  "SCOTUS",
  "1st Cir.",
  "2d Cir.",
  "3d Cir.",
  "4th Cir.",
  "5th Cir.",
  "6th Cir.",
  "7th Cir.",
  "8th Cir.",
  "9th Cir.",
  "10th Cir.",
  "11th Cir.",
  "D.C. Cir.",
  "Fed. Cir.",
  "S.D.N.Y.",
  "N.D. Cal.",
  "N.D. Ill.",
  "E.D. Va.",
  "D.D.C.",
  "C.D. Cal.",
  "E.D. Tex.",
  "D. Del.",
  "S.D. Fla.",
  "D. Mass.",
  "W.D. Tex.",
  "D.N.J.",
  "E.D. Pa.",
  "N.D. Tex.",
  "S.D. Cal.",
  "D. Colo.",
  "E.D. Mich.",
  "W.D. Wash.",
] as const;

const WORK_PRODUCTS = [
  "Issue memo",
  "Motion outline",
  "Opinion digest",
  "Discovery plan",
  "Hearing prep",
  "Settlement brief",
  "Jury instruction draft",
  "Appeal issue statement",
  "Client advisory",
  "Checklist",
] as const;

const FOLIO_TOPICS = [
  "elements and burdens",
  "standard of review",
  "preservation and waiver",
  "remedies and relief",
  "limitations and tolling",
  "standing and justiciability",
  "preemption",
  "legislative history use",
] as const;

const SLOT_COUNT = 1280;

function buildSlot(index: number): P1Slot {
  const slot = index + 1;
  const practiceArea = PRACTICE_AREAS[index % PRACTICE_AREAS.length];
  const jurisdiction = JURISDICTIONS[Math.floor(index / PRACTICE_AREAS.length) % JURISDICTIONS.length];
  const workProduct = WORK_PRODUCTS[index % WORK_PRODUCTS.length];
  const folioTopic = FOLIO_TOPICS[index % FOLIO_TOPICS.length];
  const id = `p1-${String(slot).padStart(4, "0")}`;
  const mapped = mapP1Entities(index);
  return {
    id,
    slot,
    title: `${practiceArea} — ${workProduct} (${jurisdiction})`,
    practiceArea,
    jurisdiction,
    workProduct,
    folioTopic,
    courtlistenerQuery: `${practiceArea} ${jurisdiction}`,
    status: "available",
    tags: [practiceArea, jurisdiction, workProduct, folioTopic, "p1", mapped.skillId, mapped.agentId],
    tier: "core",
    ...mapped,
  };
}

export const P1_CATALOG: P1Slot[] = [...Array.from({ length: SLOT_COUNT }, (_, i) => buildSlot(i)), ...TIER1_CATALOG];

export function listP1Slots(opts: { q?: string; limit?: number; offset?: number } = {}) {
  const q = opts.q?.trim().toLowerCase();
  let rows = P1_CATALOG;
  if (q) {
    rows = rows.filter((slot) =>
      [slot.id, slot.title, slot.practiceArea, slot.jurisdiction, slot.workProduct, slot.folioTopic, slot.skillId, slot.agentId, slot.assetFamily, slot.requestedPackage, slot.installedPackage]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = opts.limit;
  const sliced = typeof limit === "number" ? rows.slice(offset, offset + limit) : rows.slice(offset);
  return {
    object: "list" as const,
    catalog: "p1",
    count: rows.length,
    coreSlots: SLOT_COUNT,
    tier1Slots: TIER1_CATALOG.length,
    totalSlots: P1_CATALOG.length,
    offset,
    limit: limit ?? null,
    data: sliced,
  };
}

export function searchP1(query: string, limit = 8): P1Slot[] {
  const { data } = listP1Slots({ q: query, limit, offset: 0 });
  return data;
}
