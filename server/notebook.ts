import { aipSigma0Status } from "../src/lib/aip-sigma0/protocol";
import { ghostHandStatus } from "../src/lib/optimize/ghost-hand";
import { postdocStatus } from "../src/lib/optimize/postdoc";
import { suggestionBotStatus } from "../src/lib/optimize/suggest";
import { envPlaceholderStatus } from "./load-env";
import { inventoryStatus } from "./inventory";
import { oneShotStatus } from "./install-status";
import { legalSearchStatus } from "./legal-search";
import { listP1Slots } from "./p1-catalog";
import { cjisStatus, policyStatus } from "./policy";

const EXPANSION = [
  {
    id: "optional-keys",
    title: "Optional research keys",
    status: "optional" as const,
    note: "CourtListener, Congress.gov, GovInfo, OpenLaws, FINRA, and USPTO work better with keys. The studio still runs without them.",
  },
  {
    id: "westlaw-lexis",
    title: "Westlaw / LexisNexis contracts",
    status: "blocked-contract" as const,
    note: "No public SDK. REST stubs stay until a licensed client id exists. Do not scrape subscriber databases.",
  },
  {
    id: "pacer-session",
    title: "PACER session",
    status: "blocked-credentials" as const,
    note: "Placeholders only. pacer-client on PyPI is not PACER. No CM/ECF session is opened here.",
  },
  {
    id: "docker-daemon",
    title: "Docker daemon for ES / Neo4j / OSINT images",
    status: "fallback-installed" as const,
    note: "If Docker is unavailable, MiniSearch and graphology remain the in-process substitutes. Do not assume a daemon on this VM.",
  },
  {
    id: "cuckoo-sandbox",
    title: "Cuckoo live malware sandbox",
    status: "wont-do" as const,
    note: "Source may be cloned under vendor/p1/cuckoo. The live sandbox is never started from this app.",
  },
  {
    id: "cjis-ncic",
    title: "CJIS / NCIC live queries",
    status: "wont-do" as const,
    note: "This is not a CJIS-certified interface. Live NCIC/III queries are refused (HTTP 403).",
  },
  {
    id: "blacks",
    title: "Black's Law Dictionary",
    status: "wont-do" as const,
    note: "Copyrighted. Public-domain glossary + FOLIO is the installed workaround.",
  },
  {
    id: "cloudflare-live",
    title: "Live Cloudflare wrangler deploy",
    status: "wont-do" as const,
    note: "scripts/wrangler-safe.sh refuses deploy without --dry-run.",
  },
  {
    id: "unpublished-names",
    title: "Unpublished requested package names",
    status: "closest-installed" as const,
    note: "Keep closest public matches. Do not invent private scoped packages that are not on the registry.",
  },
  {
    id: "p1-catalog",
    title: "P1 catalog growth",
    status: "done" as const,
    note: "1,280 core + 10,000 Tier-1 slots are already generated. Do not mint a second 10k of fake law-enforcement products.",
  },
];

export function installNotebook() {
  const install = oneShotStatus();
  const inventory = inventoryStatus();
  const p1 = listP1Slots({ limit: 8, offset: 0 });
  const p1Tier1 = listP1Slots({ limit: 6, offset: p1.coreSlots });
  const legal = legalSearchStatus();
  const env = envPlaceholderStatus();
  const policy = policyStatus();
  const cjis = cjisStatus();
  const aip = aipSigma0Status();
  const mode = ghostHandStatus();
  const postdoc = postdocStatus();
  const bot = suggestionBotStatus();

  const legalLive = legal.filter((s) => s.status === "live").length;
  const envSet = env.variables.filter((v) => v.configured).length;
  const assetsOk = inventory.assets.filter((a) => a.install?.ok).length;

  return {
    object: "lyra.notebook" as const,
    title: "Lyra install inventory and expansion plan",
    classified: false,
    governmentProgram: false,
    simulated: false,
    generatedAt: new Date().toISOString(),
    note: "Local studio inventory compiled from live status endpoints. Not an NSA, SAP, or cryptologic notebook. No classification markings apply.",
    summary: {
      oneShot: `${install.okCount}/${install.stepCount} steps recorded`,
      p1Slots: p1.totalSlots,
      coreSlots: p1.coreSlots,
      tier1Slots: p1.tier1Slots,
      closestAssets: `${assetsOk}/${inventory.assets.length} recorded`,
      legalSources: legal.length,
      legalLive,
      envPlaceholders: env.variables.length,
      envConfigured: envSet,
      dockerAvailable: install.dockerAvailable,
      cuckooLiveSandbox: false,
      cuckooSourceCloned: install.cuckooSourceCloned,
      aipSigma0: aip.deployed && !aip.simulated,
      lyra2: mode.engine === "lyra-2" && mode.hyperDimensional,
      postdoc: true,
      liveSuggestionBot: bot.hardcoded && bot.live,
    },
    protocols: {
      ghostHand: {
        protocol: mode.protocol,
        engine: mode.engine,
        hyperDimensional: mode.hyperDimensional,
        defaultOn: mode.defaultOn,
        axes: mode.lattice.axisCount,
      },
      postdoc: {
        protocol: postdoc.protocol,
        bot: postdoc.bot,
        hardcoded: postdoc.hardcoded,
        simulated: postdoc.simulated,
        liveSuggestions: postdoc.liveSuggestions,
        layers: postdoc.layers.length,
      },
      liveBot: {
        bot: bot.bot,
        hardcoded: bot.hardcoded,
        simulated: bot.simulated,
        ruleCount: bot.ruleCount,
      },
      aipSigma0: {
        protocol: aip.protocol,
        deployed: aip.deployed,
        simulated: aip.simulated,
        spectrum: aip.spectrum,
        cloudflareLiveDeploy: aip.cloudflareLiveDeploy,
      },
    },
    oneShot: install,
    inventory,
    p1: {
      object: "p1.catalog.summary" as const,
      totalSlots: p1.totalSlots,
      coreSlots: p1.coreSlots,
      tier1Slots: p1.tier1Slots,
      sampleCore: p1.data,
      sampleTier1: p1Tier1.data,
    },
    legal,
    env,
    policy,
    cjis,
    expansion: EXPANSION.map((item) => {
      if (item.id === "docker-daemon") {
        return {
          ...item,
          live: install.dockerAvailable ? "docker-available" : "in-process-fallback",
        };
      }
      if (item.id === "cuckoo-sandbox") {
        return {
          ...item,
          live: install.cuckooSourceCloned ? "source-cloned-sandbox-off" : "not-cloned-sandbox-off",
        };
      }
      if (item.id === "optional-keys") {
        return { ...item, live: `${envSet}/${env.variables.length} placeholders currently set` };
      }
      return { ...item, live: item.status };
    }),
  };
}

export type InstallNotebook = ReturnType<typeof installNotebook>;
