import { describe, expect, it } from "vitest";
import { parseAttack, plainAttack } from "../attack";

const ref = (id: string, kind: string) => ({ source_name: "mitre-attack", external_id: id, url: `https://attack.mitre.org/${kind}/${id}` });
const bundle = {
  objects: [
    { id: "x-mitre-collection--1", type: "x-mitre-collection", x_mitre_version: "20.0", modified: "2026-10-13T00:00:00Z" },
    { id: "intrusion-set--a", type: "intrusion-set", name: "Group A", description: "Group A is a cyber espionage group active since 2010.", external_references: [ref("G9001", "groups")] },
    { id: "intrusion-set--b", type: "intrusion-set", name: "Group B", description: "Group B is a financially motivated group.", external_references: [ref("G9002", "groups")] },
    { id: "campaign--c", type: "campaign", name: "Campaign C", description: "Campaign C targeted routers.", external_references: [ref("C9003", "campaigns")] },
    { id: "attack-pattern--t", type: "attack-pattern", name: "Exploit Public-Facing Application" },
    { id: "relationship--1", type: "relationship", relationship_type: "uses", source_ref: "intrusion-set--a", target_ref: "attack-pattern--t",
      description: "[Group A](https://attack.mitre.org/groups/G9001) has exploited CVE-2021-26855 in Exchange.(Citation: Vendor Report) It also scanned widely.",
      external_references: [{ source_name: "Vendor Report", url: "https://example.org/report" }] },
    { id: "relationship--2", type: "relationship", relationship_type: "uses", source_ref: "intrusion-set--b", target_ref: "attack-pattern--t", description: "Group B exploited CVE-2017-11882." },
    { id: "relationship--3", type: "relationship", relationship_type: "uses", source_ref: "campaign--c", target_ref: "attack-pattern--t", description: "Campaign C exploited CVE-2023-20198." },
    { id: "relationship--4", type: "relationship", relationship_type: "attributed-to", source_ref: "campaign--c", target_ref: "intrusion-set--a" },
    { id: "relationship--5", type: "relationship", relationship_type: "uses", source_ref: "intrusion-set--a", target_ref: "attack-pattern--t", description: "Group A exploited CVE-2019-0001.", revoked: true },
  ],
};

describe("ATT&CK espionage attribution", () => {
  const out = parseAttack(bundle);
  it("keeps only espionage-described actors and live relationships", () => {
    expect(out.version).toBe("20.0");
    expect(out.links.map((l) => `${l.cve_id}|${l.actor_id}`)).toEqual(["CVE-2021-26855|G9001", "CVE-2023-20198|C9003"]);
  });
  it("quotes only the sentence naming the CVE, with citations and basis", () => {
    const a = out.links[0];
    expect(a.statement).toBe("Group A has exploited CVE-2021-26855 in Exchange.");
    expect(a.citations).toEqual([{ name: "Vendor Report", url: "https://example.org/report" }]);
    expect(a.espionage_note).toContain("cyber espionage group");
    expect(out.links[1].espionage_note).toContain("attributed in ATT&CK to Group A");
  });
  it("strips markdown links and citation markers", () => {
    expect(plainAttack("[X](https://a.b/c) did Y.(Citation: Z)")).toBe("X did Y.");
  });
});
