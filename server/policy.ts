/**
 * Policy surface for replacements the user required.
 * GitHub CI/MCP are absent on purpose. CJIS/NCIC is applicable as placeholders only.
 */

export function policyStatus() {
  return {
    object: "lyra.policy" as const,
    githubActions: {
      status: "removed",
      replacement: "Cloudflare pipelines (scripts/pipelines/cloudflare-ci.sh, wrangler --dry-run)",
    },
    githubMcp: {
      status: "removed",
      replacement: "Cloudflare MCP (@cloudflare/mcp-server-cloudflare + mcp-remote Code Mode)",
    },
    blacksLawDictionary: {
      status: "workaround-installed",
      reason: "Black's Law Dictionary is copyrighted and is not shipped.",
      installed: "Public-domain glossary + FOLIO ontology (source=glossary|folio)",
    },
    cursorYoloAutoRun: {
      status: "disabled",
      files: [".cursor/permissions.json", ".vscode/settings.json"],
      note: "Empty terminal and MCP allowlists. Auto-run / YOLO keys are false.",
    },
    backgroundAgents: {
      status: "activated",
      files: [".cursor/environment.json"],
      note: "Cloud Agents (formerly Background Agents) boot from environment.json install/start plus forwarded ports.",
    },
    marketplacePlugins: {
      status: "integrated",
      plugins: ["saoudrizwan.claude-dev", "RooVeterinaryInc.roo-cline", "Continue.continue"],
      files: [".vscode/extensions.json", ".cursor/marketplace.json", ".continue/config.yaml"],
    },
    cloudflareDeployment: {
      status: "dry-run-only",
      command: "bash scripts/wrangler-safe.sh deploy --dry-run --config workers/wrangler.toml",
    },
    cjisNcicFederal: {
      status: "applicable-placeholders",
      liveQueries: false,
      note: "This studio is not a CJIS-certified interface. Credentials apply as empty placeholders only. No NCIC/III queries are sent.",
    },
    ghostHandDetailedMode: {
      status: "activated",
      protocol: "GHOST-HAND",
      defaultMode: "detail",
      note: "Detail mode is the default. GHOST-HAND plus Lyra-2 13-axis lattice (4-D, GHOST, HAND) with explicit tensions. Not a classified product.",
    },
    lyra2HyperDimensional: {
      status: "engaged",
      engine: "lyra-2",
      protocol: "GHOST-HAND",
      axes: 13,
      note: "Hyper-dimensional means 4-D + GHOST + HAND scored together with tensions. No clearance banners. No interagency cable simulation.",
    },
    postdoctoralMode: {
      status: "activated",
      protocol: "POSTDOC",
      bot: "postdoc-live",
      hardcoded: true,
      simulated: false,
      note: "Post-doctoral mode plus a hard-coded live suggestion bot. Pattern matchers only. Not a university credential and not a model call.",
    },
    aipSigma0: {
      status: "deployed",
      protocol: "AIP-Σ0",
      spectrum: "full",
      simulated: false,
      cloudflareLiveDeploy: false,
      note: "Anchor Inventory Protocol Σ0: live claim scan, tool receipts, chat footers, deep-dive fixtures. Not a live Cloudflare deploy.",
    },
    corporateTaxonomy: {
      status: "activated",
      endpoint: "/v1/corporate",
      skills: ["p1-corporate-taxonomy", "p1-legal-hold", "p1-compliance-matrix"],
      agent: "corporate-counsel",
      intercepts: false,
      sigint: false,
      liveNcic: false,
      note: "Business-law forensic map bound to lockfile, MCP, and placeholders. Not a classified case file.",
    },
    anomalyTracker: {
      status: "activated",
      endpoint: "/v1/anomaly",
      page: "/tracker",
      skills: ["p1-anomaly-tracker"],
      agent: "anomaly-tracker",
      improvements: 10080,
      intercepts: false,
      liveFbi: false,
      massSurveillance: false,
      note: "Unclassified 3D fixture tracker. Taxonomy-mapped improvements. Not a field collection system.",
    },
    credentialsFramework: {
      status: "activated",
      envExample: ".env.example",
      vaultExample: "vault.hcl.example",
      vaultDeployed: false,
      cjisLiveQueries: false,
      secretsInGit: false,
      note: "Placeholders + policy only. HashiCorp Vault is not started. Operator may skip optional secrets.",
    },
  };
}

export function cjisStatus() {
  const names = ["CJIS_ORI", "CJIS_AGENCY_ID", "NCIC_ORI", "NCIC_MNEMONIC", "FBI_UCR_AGENCY_ID"] as const;
  return {
    object: "compliance.cjis" as const,
    applicable: true,
    liveQueries: false,
    certifiedInterface: false,
    note: "CJIS/NCIC credentials are applicable as placeholders. Live criminal-justice queries are refused from this app.",
    variables: names.map((name) => ({
      name,
      configured: Boolean(process.env[name]?.trim()),
    })),
  };
}

export function refuseCjisQuery() {
  return {
    object: "compliance.cjis.refused" as const,
    ok: false,
    liveQueries: false,
    reason:
      "NCIC/CJIS/III live queries are not available from this local studio. The interface is not CJIS-certified. Supply agency credentials only as placeholders; do not route restricted criminal-justice traffic through this process.",
  };
}
