export const P1_SKILLS = [
  { id: "p1-deconstruct", path: ".cursor/skills/p1-deconstruct/skill.yaml" },
  { id: "p1-diagnose", path: ".cursor/skills/p1-diagnose/skill.yaml" },
  { id: "p1-develop", path: ".cursor/skills/p1-develop/skill.yaml" },
  { id: "p1-deliver", path: ".cursor/skills/p1-deliver/skill.yaml" },
  { id: "p1-legal-search", path: ".cursor/skills/p1-legal-search/skill.yaml" },
  { id: "p1-folio-ontology", path: ".cursor/skills/p1-folio-ontology/skill.yaml" },
  { id: "p1-courtlistener", path: ".cursor/skills/p1-courtlistener/skill.yaml" },
  { id: "p1-prompt-optimize", path: ".cursor/skills/p1-prompt-optimize/skill.yaml" },
  { id: "p1-local-models", path: ".cursor/skills/p1-local-models/skill.yaml" },
  { id: "p1-catalog-lookup", path: ".cursor/skills/p1-catalog-lookup/skill.yaml" },
  { id: "p1-issue-memo", path: ".cursor/skills/p1-issue-memo/skill.yaml" },
  { id: "p1-motion-outline", path: ".cursor/skills/p1-motion-outline/skill.yaml" },
  { id: "p1-citation-hygiene", path: ".cursor/skills/p1-citation-hygiene/skill.yaml" },
  { id: "p1-jurisdiction-map", path: ".cursor/skills/p1-jurisdiction-map/skill.yaml" },
  { id: "p1-work-product", path: ".cursor/skills/p1-work-product/skill.yaml" },
  { id: "p1-ci-health", path: ".cursor/skills/p1-ci-health/skill.yaml" },
] as const;

export const P1_AGENTS = [
  { id: "legal-researcher", path: ".cursor/agents/legal-researcher.md" },
  { id: "prompt-optimizer", path: ".cursor/agents/prompt-optimizer.md" },
  { id: "folio-librarian", path: ".cursor/agents/folio-librarian.md" },
  { id: "p1-cataloger", path: ".cursor/agents/p1-cataloger.md" },
  { id: "ci-gatekeeper", path: ".cursor/agents/ci-gatekeeper.md" },
  { id: "playground-tester", path: ".cursor/agents/playground-tester.md" },
  { id: "cloudflare-operator", path: ".cursor/agents/cloudflare-operator.md" },
  { id: "citation-checker", path: ".cursor/agents/citation-checker.md" },
  { id: "issue-memo-writer", path: ".cursor/agents/issue-memo-writer.md" },
  { id: "local-api-operator", path: ".cursor/agents/local-api-operator.md" },
] as const;

export const P1_PIPELINES = [
  { id: "cloudflare-ci", path: "scripts/pipelines/cloudflare-ci.sh" },
  { id: "cloudflare-p1-health", path: "scripts/pipelines/cloudflare-p1-health.sh" },
  { id: "p1-catalog-audit", path: "scripts/pipelines/p1-catalog-audit.sh" },
  { id: "skill-agent-roster", path: "scripts/pipelines/skill-agent-roster.sh" },
  { id: "local-api-smoke", path: "scripts/pipelines/local-api-smoke.sh" },
] as const;

export const P1_WORKER = { id: "ci-gate", path: "workers/ci-gate.js" } as const;

export function mapP1Entities(index: number) {
  const skill = P1_SKILLS[index % P1_SKILLS.length];
  const agent = P1_AGENTS[index % P1_AGENTS.length];
  const pipeline = P1_PIPELINES[index % P1_PIPELINES.length];
  const resourceKind = index % 3 === 0 ? "skill" : index % 3 === 1 ? "agent" : "pipeline";
  const resource =
    resourceKind === "skill" ? skill : resourceKind === "agent" ? agent : pipeline;
  return {
    skillId: skill.id,
    skillPath: skill.path,
    agentId: agent.id,
    agentPath: agent.path,
    pipelineId: pipeline.id,
    pipelinePath: pipeline.path,
    workerId: P1_WORKER.id,
    workerPath: P1_WORKER.path,
    resource: { kind: resourceKind, id: resource.id, path: resource.path },
  };
}
