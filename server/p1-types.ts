export interface P1Slot {
  id: string;
  slot: number;
  title: string;
  practiceArea: string;
  jurisdiction: string;
  workProduct: string;
  folioTopic: string;
  courtlistenerQuery: string;
  status: "available";
  tags: string[];
  skillId: string;
  skillPath: string;
  agentId: string;
  agentPath: string;
  pipelineId: string;
  pipelinePath: string;
  workerPath: string;
  workerId: string;
  resource: { kind: string; id: string; path: string };
  tier?: "core" | "tier-1";
  assetFamily?: string;
  requestedPackage?: string;
  installedPackage?: string;
}
