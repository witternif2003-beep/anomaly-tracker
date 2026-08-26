import type { AipScan } from "../aip-sigma0/scanner";

export type Mode = "basic" | "detail";

export type RequestType = "creative" | "technical" | "educational" | "complex";

export type Platform = "chatgpt" | "claude" | "gemini" | "universal";

export type RequestTypeChoice = "auto" | RequestType;

export interface ClarifyingQuestion {
  id: string;
  question: string;
  rationale: string;
  placeholder: string;
  ghostLetter?: "G" | "H" | "O" | "S" | "T";
}

export interface DeconstructResult {
  intent: string;
  taskVerb: string;
  subject: string;
  entities: string[]
  outputRequirements: string[];
  constraints: string[];
  audience?: string;
  tone?: string;
  provided: string[];
  missing: string[];
}

export interface DiagnoseResult {
  clarityGaps: string[];
  ambiguity: string[];
  specificity: "low" | "medium" | "high";
  completeness: "low" | "medium" | "high";
  complexity: "simple" | "moderate" | "complex";
  structureNeeds: string[];
}

export interface GhostHandLayer {
  letter: string;
  name: string;
  hint?: string;
  status?: "armed" | "idle" | "provided" | "asked" | "defaulted";
  value?: string;
  rule?: string;
}

export interface GhostHandReport {
  active: boolean;
  protocol: "GHOST-HAND";
  mode: "detailed" | "basic";
  defaultOn: boolean;
  ghost: GhostHandLayer[];
  hand: GhostHandLayer[];
}

export interface OptimizeRequest {
  input: string;
  mode: Mode;
  requestType: RequestTypeChoice;
  platform: Platform;
  answers?: Record<string, string>;
  skipQuestions?: boolean;
}

export interface OptimizeResult {
  status: "questions" | "complete";
  mode: Mode;
  requestType: RequestType;
  platform: Platform;
  questions?: ClarifyingQuestion[];
  deconstruct: DeconstructResult;
  diagnose: DiagnoseResult;
  techniques: string[];
  role: string;
  optimizedPrompt: string;
  whatChanged: string[];
  implementation: string[];
  platformNotes: string;
  inferredDefaults: string[];
  ghostHand: GhostHandReport;
  aipSigma0?: {
    protocol: "AIP-Σ0";
    deployed: true;
    simulated: false;
    briefScan: AipScan;
    promptScan: AipScan;
  };
}

