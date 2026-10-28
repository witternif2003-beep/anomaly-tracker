import { describe, expect, it } from "vitest";
import { auditHash, GENESIS_HASH, type AuditRow, verifyAuditRows } from "../audit";
import { classOf, codename, type FindingRow } from "../findings";
import { metricBlock } from "../metrics";
import { buildNarrative } from "../narrative";
import { exposureScore } from "../sources";
import { costOf } from "../treasury";

const finding: FindingRow = {
  cve_id: "CVE-2026-12345", anomaly_no: 7, vendor: "Acme", product: "Edge Gateway", title: "Acme Edge Gateway OS Command Injection Vulnerability",
  summary: "Command injection in the management interface.", date_added: "2026-10-20", due_date: "2026-11-10", ransomware: "Unknown", cwes: ["CWE-78"],
  source: "kev", source_url: null, epss: 0.5, epss_percentile: 0.98, epss_date: "2026-10-27", cvss: 9.8, cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
  cvss_severity: "CRITICAL", cvss_version: "3.1", cvss_exploitability: 3.9, cvss_impact: 5.9, vuln_status: "Analyzed", reference_count: 4,
  nvd_published: "2026-10-01T00:00:00Z", nvd_last_modified: "2026-10-21T00:00:00Z", exposure_score: 74.2, kev_listed: true, record_hash: "ab".repeat(32),
  first_seen_batch: 1, last_seen_batch: 2, created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-21T00:00:00Z",
};

describe("exposureScore", () => {
  it("combines prediction, severity and catalog listing and caps at 100", () => {
    expect(exposureScore({ kevListed: true, epss: 0.5, cvss: 9.8, ransomware: null })).toBe(74.2);
    expect(exposureScore({ kevListed: true, epss: 1, cvss: 10, ransomware: "Known" })).toBe(100);
    expect(exposureScore({ kevListed: false, epss: null, cvss: null, ransomware: null })).toBe(0);
  });
});

describe("audit chain", () => {
  const rec = (seq: number, prev: string, action: string): AuditRow => {
    const base = { seq: String(seq), at: new Date(Date.UTC(2026, 9, 28, 0, 0, seq)), actor: "operator", role: "admin", action, subject: null, details: { n: seq }, ip_address: null, prev_hash: prev, hash: "" };
    base.hash = auditHash(prev, { at: base.at.toISOString(), actor: base.actor, role: base.role, action, subject: null, details: base.details, ipAddress: null });
    return base;
  };
  it("verifies an intact chain and detects tampering", () => {
    const a = rec(1, GENESIS_HASH, "batch.completed");
    const b = rec(2, a.hash, "incident.updated");
    expect(verifyAuditRows([a, b])).toMatchObject({ ok: true, checked: 2, head: b.hash });
    const tampered = { ...b, action: "incident.deleted" };
    expect(verifyAuditRows([a, tampered])).toMatchObject({ ok: false, brokenAt: "2" });
  });
});

describe("anomaly record", () => {
  it("produces exactly fifty numbered metrics with nulls left empty", () => {
    const m = metricBlock(finding, {
      batchId: 2, trigger: "manual", durationMs: null, sourceBytes: null, heapMb: null, rssMb: null, stageCount: null, catalogVersion: null, catalogCount: null,
      auditHead: null, rank: 1, cohort: 10, assetCount: 0, incidentState: null, incidentPriority: null, incidentOpenedAt: null, observedAt: "2026-10-28T00:00:00Z",
    });
    expect(m).toHaveLength(50);
    expect(m.map((x) => x.no)).toEqual(Array.from({ length: 50 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`));
    expect(m.every((x) => x.value === null || typeof x.value === "string")).toBe(true);
    expect(m.some((x) => x.value === null)).toBe(true);
  });
  it("derives a stable product codename and class", () => {
    expect(codename(finding)).toBe(codename({ ...finding }));
    expect(codename(finding)).toMatch(/^[A-Z0-9-]+$/);
    expect(classOf(finding)).toBe("Command Injection");
  });
});

describe("narrative and treasury", () => {
  it("writes the narrative only from supplied figures", () => {
    const text = buildNarrative({
      id: 2, startedAt: new Date("2026-10-28T06:00:00Z"), durationMs: 1234, trigger: "manual", actor: "operator", catalogVersion: "2026.10.27", catalogReleased: "2026-10-27T00:00:00Z",
      catalogCount: 1760, windowStart: "2026-10-27T06:00:00Z", windowEnd: "2026-10-28T06:00:00Z", windowTotal: 300, newFindings: 1, changedFindings: 0, openedIncidents: 1,
      scored: 1, predicted: 1, costUnits: 3.5, sourceBytes: 1_572_864, top: [finding],
    });
    expect(text).toContain("B-000002");
    expect(text).toContain("CVE-2026-12345");
    expect(text).toContain("1760");
  });
  it("charges two units plus one per MiB read", () => {
    expect(costOf(0)).toBe(2);
    expect(costOf(1_048_576 * 3)).toBe(5);
  });
});

describe("plainText", () => {
  it("decodes literal entities from source descriptions", async () => {
    const { plainText } = await import("@/lib/findings");
    expect(plainText("root access.&nbsp; This &amp; that &lt;x&gt;")).toBe("root access. This & that <x>");
    expect(plainText(null)).toBeNull();
  });
});

describe("handle", () => {
  it("maps schema validation failures to 400", async () => {
    const { handle } = await import("@/lib/http");
    const { z } = await import("zod");
    const res = await handle(async () => {
      z.object({ units: z.number() }).parse({ units: null });
      return new Response("unreachable");
    })();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/units/);
  });
});
